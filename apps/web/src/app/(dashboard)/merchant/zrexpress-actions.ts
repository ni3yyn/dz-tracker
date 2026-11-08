'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import {
  decryptZRExpressCredentials,
  encryptZRExpressCredentials,
} from '../../../lib/zrexpress-credentials';

const ZR_API_BASE = 'https://api.zrexpress.app/api/v1';
const ZR_EVENT_TYPES = [
  'parcel.state.updated',
  'parcel.state.situation.created',
  'parcel.isReturn.updated',
] as const;

type ZRIntegrationStatus = {
  connected: boolean;
  endpointUrl?: string;
  connectedAt?: string | null;
  lastWebhookReceivedAt?: string | null;
  lastWebhookProcessedAt?: string | null;
  lastError?: string | null;
};

type ZRApiResult<T = Record<string, unknown>> = {
  response: Response;
  body: T | null;
};

async function zrApi<T = Record<string, unknown>>(
  apiKey: string,
  tenantId: string | null,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}
): Promise<ZRApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  };
  if (tenantId) headers['X-Tenant'] = tenantId;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${ZR_API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error('تعذر الاتصال بمنصة ZR Express. تحقق من الاتصال ثم حاول مجدداً.');
  }

  let body: any = null;
  const text = await response.text().catch(() => '');
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  return { response, body: body as T | null };
}

function unwrapApiBody(body: any): any {
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

function zrApiError(status: number, body: any, operation: string): Error {
  const detail = body?.detail || body?.message || body?.title;
  if (status === 401) return new Error('رفضت ZR Express مفتاح API. تأكد من صحة المفتاح وأنه لم تنتهِ صلاحيته.');
  if (status === 403) return new Error('المفتاح صالح أو قابل للتعرّف، لكن حسابك لا يملك صلاحية إدارة Webhooks لهذا الـ Tenant. تحقق من Tenant ID وصلاحيات Supplier Admin.');
  if (status === 404) return new Error('لم يتم العثور على مورد Webhook المطلوب في حساب ZR Express.');
  if (status === 429) return new Error('فرضت ZR Express حداً مؤقتاً للطلبات. انتظر قليلاً ثم أعد المحاولة.');
  return new Error(`تعذر ${operation} لدى ZR Express (HTTP ${status})${detail ? `: ${String(detail).slice(0, 180)}` : '.'}`);
}

async function getAuthenticatedMerchantId(): Promise<string> {
  const authSupabase = await createClient();
  const { data: { user }, error } = await authSupabase.auth.getUser();
  if (error || !user) throw new Error('انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.');

  const supabase = getSupabaseAdminClient();
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (merchantError || !merchant) throw new Error('تعذر العثور على متجر مرتبط بحسابك.');
  return merchant.id;
}

function callbackUrl(endpointToken: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app';
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new Error('عنوان الموقع العام غير صالح. تحقق من NEXT_PUBLIC_SITE_URL.');
  }
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.hostname === 'localhost' ||
    base.hostname.endsWith('.local')
  ) {
    throw new Error('يجب ضبط NEXT_PUBLIC_SITE_URL على عنوان HTTPS عام قبل ربط ZR Express.');
  }
  return new URL(`/api/webhooks/zrexpress/${endpointToken}`, base.origin).toString();
}

function connectionStatus(row: any, endpointToken?: string): ZRIntegrationStatus {
  return {
    connected: Boolean(row?.sync_enabled),
    endpointUrl: endpointToken && row?.sync_enabled ? callbackUrl(endpointToken) : undefined,
    connectedAt: row?.connected_at || null,
    lastWebhookReceivedAt: row?.last_webhook_received_at || null,
    lastWebhookProcessedAt: row?.last_webhook_processed_at || null,
    lastError: row?.last_error || null,
  };
}

async function loadIntegration(merchantId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .select('id, base_url, credentials_encrypted, webhook_endpoint_id, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, last_error')
    .eq('merchant_id', merchantId)
    .eq('provider', 'zrexpress')
    .maybeSingle();
  if (error) throw new Error('تعذر قراءة بيانات ربط ZR Express. تأكد من تطبيق تحديث قاعدة البيانات.');
  return data;
}

export async function getZRExpressIntegrationStatus(): Promise<{
  success: boolean;
  status: ZRIntegrationStatus;
  error?: string;
}> {
  try {
    const merchantId = await getAuthenticatedMerchantId();
    const row = await loadIntegration(merchantId);
    return {
      success: true,
      status: row ? connectionStatus(row, row.webhook_endpoint_token) : { connected: false },
    };
  } catch (error: any) {
    return {
      success: false,
      status: { connected: false },
      error: error?.message || 'تعذر تحميل حالة ربط ZR Express.',
    };
  }
}

export async function saveZRExpressIntegration(
  apiKeyInput: string,
  tenantIdInput: string
): Promise<{ success: boolean; status?: ZRIntegrationStatus; error?: string }> {
  let createdEndpointId: string | null = null;
  let createdEndpointCredentials: { apiKey: string; tenantId: string } | null = null;

  try {
    const merchantId = await getAuthenticatedMerchantId();
    const apiKey = apiKeyInput.trim();
    const tenantId = tenantIdInput.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(apiKey)) {
      throw new Error('أدخل مفتاح API الخاص بـ ZR Express. يجب أن يكون المفتاح كاملاً كما ظهر عند إنشائه.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('أدخل Tenant ID الصحيح (UUID) من حساب ZR Express.');
    }

    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (encryptionKey.length < 32) {
      throw new Error('إعداد CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل في Vercel. استخدم نفس المفتاح الموجود في Railway.');
    }

    const merchantIntegration = await loadIntegration(merchantId);
    let previousCredentials: { apiKey: string; tenantId: string; signingSecret: string } | null = null;
    if (merchantIntegration?.credentials_encrypted) {
      previousCredentials = decryptZRExpressCredentials(
        merchantIntegration.credentials_encrypted,
        merchantId,
        encryptionKey
      );
    }

    // Validate the API key without tenant context, then validate tenant access
    // by listing endpoints before creating or updating anything.
    const profile = await zrApi(apiKey, null, '/users/profile');
    if (!profile.response.ok) throw zrApiError(profile.response.status, profile.body, 'التحقق من مفتاح API');
    const endpointList = await zrApi(apiKey, tenantId, '/webhooks/endpoints');
    if (!endpointList.response.ok) throw zrApiError(endpointList.response.status, endpointList.body, 'التحقق من صلاحيات إدارة Webhooks');

    const sameAccount = Boolean(
      previousCredentials &&
      previousCredentials.apiKey === apiKey &&
      previousCredentials.tenantId === tenantId &&
      merchantIntegration?.webhook_endpoint_id &&
      merchantIntegration?.webhook_endpoint_token
    );
    const endpointToken = sameAccount
      ? merchantIntegration.webhook_endpoint_token as string
      : randomBytes(32).toString('base64url');
    const url = callbackUrl(endpointToken);
    let endpointId: string;

    if (sameAccount) {
      endpointId = merchantIntegration.webhook_endpoint_id as string;
      const updated = await zrApi(apiKey, tenantId, `/webhooks/endpoints/${encodeURIComponent(endpointId)}`, {
        method: 'PUT',
        body: {
          url,
          description: 'TajerTrack shipment tracking',
          eventTypes: [...ZR_EVENT_TYPES],
        },
      });
      if (updated.response.status === 404) {
        // The endpoint may have been deleted in the provider portal. Recreate it
        // with the same callback token so the already-saved local route remains valid.
        const recreated = await zrApi(apiKey, tenantId, '/webhooks/endpoints', {
          method: 'POST',
          body: {
            url,
            description: 'TajerTrack shipment tracking',
            eventTypes: [...ZR_EVENT_TYPES],
          },
        });
        if (!recreated.response.ok) throw zrApiError(recreated.response.status, recreated.body, 'إعادة إنشاء نقطة استقبال Webhook');
        const endpoint = unwrapApiBody(recreated.body);
        endpointId = String(endpoint?.id || '');
        if (!endpointId.startsWith('ep_')) {
          throw new Error('لم تُرجع ZR Express معرّفاً صالحاً لنقطة Webhook الجديدة.');
        }
        createdEndpointId = endpointId;
        createdEndpointCredentials = { apiKey, tenantId };
      } else if (!updated.response.ok) {
        throw zrApiError(updated.response.status, updated.body, 'تحديث نقطة استقبال Webhook');
      }
    } else {
      const created = await zrApi(apiKey, tenantId, '/webhooks/endpoints', {
        method: 'POST',
        body: {
          url,
          description: 'TajerTrack shipment tracking',
          // ZR's live endpoint has returned HTTP 500 when this list is omitted.
          eventTypes: [...ZR_EVENT_TYPES],
        },
      });
      if (!created.response.ok) throw zrApiError(created.response.status, created.body, 'إنشاء نقطة استقبال Webhook');
      const endpoint = unwrapApiBody(created.body);
      endpointId = String(endpoint?.id || '');
      if (!endpointId.startsWith('ep_')) {
        throw new Error('أنشأت ZR Express نقطة استقبال، لكنها لم تُرجع معرّف Svix صالحاً. راجع لوحة Webhooks لدى ZR.');
      }
      createdEndpointId = endpointId;
      createdEndpointCredentials = { apiKey, tenantId };
    }

    const secretResult = await zrApi(apiKey, tenantId, `/webhooks/endpoints/${encodeURIComponent(endpointId)}/secret`);
    if (!secretResult.response.ok) throw zrApiError(secretResult.response.status, secretResult.body, 'استرجاع مفتاح توقيع Webhook');
    const secretBody = unwrapApiBody(secretResult.body);
    const signingSecret = String(secretBody?.secret || '');
    if (!signingSecret.startsWith('whsec_')) {
      throw new Error('أعادت ZR Express استجابة لا تحتوي على مفتاح توقيع Svix صالح.');
    }

    const encrypted = encryptZRExpressCredentials(
      { apiKey, tenantId, signingSecret },
      merchantId,
      encryptionKey
    );
    const now = new Date().toISOString();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .upsert({
        merchant_id: merchantId,
        provider: 'zrexpress',
        base_url: 'https://api.zrexpress.app',
        credentials_encrypted: encrypted,
        webhook_endpoint_id: endpointId,
        webhook_endpoint_token: endpointToken,
        sync_enabled: true,
        connected_at: sameAccount ? merchantIntegration.connected_at : now,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      }, { onConflict: 'merchant_id,provider' })
      .select('connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, last_error')
      .single();

    if (error || !data) {
      console.error('[ZRExpressIntegration] Could not save connection:', error?.message);
      throw new Error('تم إنشاء Webhook لدى ZR Express، لكن تعذر حفظ الربط في قاعدة البيانات. أعد المحاولة بعد التأكد من تحديث قاعدة البيانات.');
    }

    // Remove the former ZR endpoint only after the new configuration is safely stored.
    if (createdEndpointId && previousCredentials?.apiKey && merchantIntegration?.webhook_endpoint_id) {
      try {
        await zrApi(
          previousCredentials.apiKey,
          previousCredentials.tenantId,
          `/webhooks/endpoints/${encodeURIComponent(merchantIntegration.webhook_endpoint_id)}`,
          { method: 'DELETE' }
        );
      } catch {
        // A duplicate remote endpoint is harmless; the current endpoint is active.
      }
    }

    revalidatePath('/merchant');
    return {
      success: true,
      status: connectionStatus({ ...data, webhook_endpoint_token: endpointToken }, endpointToken),
    };
  } catch (error: any) {
    if (createdEndpointId && createdEndpointCredentials) {
      try {
        await zrApi(
          createdEndpointCredentials.apiKey,
          createdEndpointCredentials.tenantId,
          `/webhooks/endpoints/${encodeURIComponent(createdEndpointId)}`,
          { method: 'DELETE' }
        );
      } catch {
        // The merchant can remove an orphaned endpoint from the ZR portal.
      }
    }
    return { success: false, error: error?.message || 'تعذر ربط حساب ZR Express.' };
  }
}

export async function disconnectZRExpressIntegration(): Promise<{ success: boolean; error?: string }> {
  try {
    const merchantId = await getAuthenticatedMerchantId();
    const row = await loadIntegration(merchantId);
    if (!row) return { success: true };

    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    const credentials = decryptZRExpressCredentials(row.credentials_encrypted, merchantId, encryptionKey);

    if (row.webhook_endpoint_id) {
      const remote = await zrApi(
        credentials.apiKey,
        credentials.tenantId,
        `/webhooks/endpoints/${encodeURIComponent(row.webhook_endpoint_id)}`,
        { method: 'DELETE' }
      );
      if (!remote.response.ok && remote.response.status !== 404) {
        throw zrApiError(remote.response.status, remote.body, 'إزالة Webhook من حساب ZR Express');
      }
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .delete()
      .eq('merchant_id', merchantId)
      .eq('provider', 'zrexpress');
    if (error) throw new Error('تعذر حذف بيانات ربط ZR Express من تاجر تراك.');

    revalidatePath('/merchant');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر إلغاء ربط ZR Express.' };
  }
}
