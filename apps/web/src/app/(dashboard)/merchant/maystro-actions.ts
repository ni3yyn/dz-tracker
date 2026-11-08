'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import {
  decryptMaystroCredentials,
  encryptMaystroCredentials,
} from '../../../lib/maystro-credentials';

const MAYSTRO_AUTH_CHECK_URL =
  'https://orders-management.maystro-delivery.com/api/base/wilayas/?language=fr&country=1';

type MaystroIntegrationStatus = {
  connected: boolean;
  endpointUrl?: string;
  connectedAt?: string | null;
  lastWebhookReceivedAt?: string | null;
  lastWebhookProcessedAt?: string | null;
  lastError?: string | null;
};

async function getAuthenticatedMerchantId(): Promise<string> {
  const authSupabase = await createClient();
  const { data: { user }, error: authError } = await authSupabase.auth.getUser();
  if (authError || !user) {
    throw new Error('انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error || !merchant) {
    throw new Error('تعذر العثور على متجر مرتبط بحسابك.');
  }
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
    throw new Error('يجب ضبط NEXT_PUBLIC_SITE_URL على عنوان HTTPS عام قبل ربط Maystro.');
  }

  return new URL(`/api/webhooks/maystro/${endpointToken}`, base.origin).toString();
}

async function loadMaystroIntegration(merchantId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .select('id, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, last_error')
    .eq('merchant_id', merchantId)
    .eq('provider', 'maystro')
    .maybeSingle();

  if (error) {
    console.error('[MaystroIntegration] Could not load account:', error.message);
    throw new Error('تعذر قراءة بيانات ربط Maystro. تأكد من تطبيق تحديث قاعدة البيانات.');
  }
  return data;
}

function toStatus(row: any): MaystroIntegrationStatus {
  const connected = Boolean(row?.sync_enabled && row?.webhook_endpoint_token);
  return {
    connected,
    endpointUrl: connected ? callbackUrl(row.webhook_endpoint_token) : undefined,
    connectedAt: row?.connected_at || null,
    lastWebhookReceivedAt: row?.last_webhook_received_at || null,
    lastWebhookProcessedAt: row?.last_webhook_processed_at || null,
    lastError: row?.last_error || null,
  };
}

async function validateMaystroToken(apiToken: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(MAYSTRO_AUTH_CHECK_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${apiToken}`,
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error('تعذر الاتصال بمنصة Maystro. تحقق من اتصال الإنترنت وحاول مجدداً.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('رفضت Maystro رمز API. تأكد من نسخه من Paramètres ← Info personnelles.');
  }
  if (!response.ok) {
    throw new Error(`تعذر التحقق من حساب Maystro (HTTP ${response.status}). حاول مجدداً لاحقاً.`);
  }

  // The wilayas endpoint is intentionally read-only; a valid response confirms
  // token authentication without creating, editing or cancelling any shipment.
  const text = await response.text().catch(() => '');
  if (!text) {
    throw new Error('استجاب Maystro دون بيانات تحقق. لم يتم حفظ الربط.');
  }
  try {
    const body = JSON.parse(text);
    const rows = Array.isArray(body) ? body
      : Array.isArray(body?.results) ? body.results
      : Array.isArray(body?.data) ? body.data
      : null;
    if (!rows) throw new Error('Unexpected Maystro validation response.');
  } catch {
    throw new Error('لم نتمكن من تأكيد صلاحية رمز Maystro. أعد المحاولة أو اطلب رمز API صالحاً من الشركة.');
  }
}

export async function getMaystroIntegrationStatus(): Promise<{
  success: boolean;
  status: MaystroIntegrationStatus;
  error?: string;
}> {
  try {
    const merchantId = await getAuthenticatedMerchantId();
    const row = await loadMaystroIntegration(merchantId);
    return { success: true, status: row ? toStatus(row) : { connected: false } };
  } catch (error: any) {
    return {
      success: false,
      status: { connected: false },
      error: error?.message || 'تعذر تحميل حالة ربط Maystro.',
    };
  }
}

export async function saveMaystroIntegration(
  apiTokenInput: string
): Promise<{ success: boolean; status?: MaystroIntegrationStatus; error?: string }> {
  try {
    const merchantId = await getAuthenticatedMerchantId();
    const apiToken = apiTokenInput.trim().replace(/^Token\\s+/i, '');

    if (apiToken.length < 8 || apiToken.length > 512 || !/^[\\x21-\\x7E]+$/.test(apiToken)) {
      throw new Error('أدخل Store API Token كاملاً كما يظهر في حساب Maystro.');
    }

    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (encryptionKey.length < 32) {
      throw new Error('إعداد التشفير CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل في Vercel.');
    }

    // Validate before replacing a previously working connection.
    await validateMaystroToken(apiToken);

    const existing = await loadMaystroIntegration(merchantId);
    const endpointToken = existing?.webhook_endpoint_token
      ? String(existing.webhook_endpoint_token)
      : randomBytes(32).toString('hex');
    const encrypted = encryptMaystroCredentials({ apiToken }, merchantId, encryptionKey);
    const now = new Date().toISOString();

    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .upsert({
        merchant_id: merchantId,
        provider: 'maystro',
        base_url: 'https://backend.maystro-delivery.com',
        credentials_encrypted: encrypted,
        webhook_endpoint_token: endpointToken,
        sync_enabled: true,
        connected_at: existing?.connected_at || now,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      }, { onConflict: 'merchant_id,provider' })
      .select('connected_at, sync_enabled, webhook_endpoint_token, last_webhook_received_at, last_webhook_processed_at, last_error')
      .single();

    if (error || !data) {
      console.error('[MaystroIntegration] Could not save account:', error?.message);
      throw new Error('تم التحقق من رمز Maystro، لكن تعذر حفظ الربط. تحقق من تحديث قاعدة البيانات ثم أعد المحاولة.');
    }

    revalidatePath('/merchant');
    return { success: true, status: toStatus(data) };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'تعذر ربط حساب Maystro.',
    };
  }
}

export async function disconnectMaystroIntegration(): Promise<{ success: boolean; error?: string }> {
  try {
    const merchantId = await getAuthenticatedMerchantId();
    const supabase = getSupabaseAdminClient();
    const { error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .delete()
      .eq('merchant_id', merchantId)
      .eq('provider', 'maystro');

    if (error) {
      throw new Error('تعذر فصل حساب Maystro من تاجر تراك.');
    }

    revalidatePath('/merchant');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر فصل حساب Maystro.' };
  }
}
