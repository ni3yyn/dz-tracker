'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import {
  decryptYalidineWebhookCredentials,
  encryptYalidineWebhookCredentials,
} from '../../../lib/yalidine-webhook-credentials';

type YalidineWebhookStatus = {
  prepared: boolean;
  connected: boolean;
  endpointUrl: string | null;
  connectedAt: string | null;
  lastWebhookReceivedAt: string | null;
  lastWebhookProcessedAt: string | null;
  testMode: boolean;
  lastError: string | null;
};

async function authenticatedMerchantId(): Promise<string> {
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

function webhookBaseUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app';
  let base: URL;
  try { base = new URL(configured); } catch {
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
    throw new Error('يجب ضبط NEXT_PUBLIC_SITE_URL على عنوان HTTPS عام قبل ربط Yalidine.');
  }
  return base;
}

function endpointUrl(token: string): string {
  return new URL(`/api/webhooks/yalidine/${token}`, webhookBaseUrl().origin).toString();
}

async function loadIntegration(merchantId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error')
    .eq('merchant_id', merchantId)
    .eq('provider', 'yalidine')
    .maybeSingle();
  if (error) throw new Error('تعذر قراءة إعدادات Yalidine. تأكد من تطبيق تحديث قاعدة البيانات.');
  return data;
}

function statusFromRow(row: any): YalidineWebhookStatus {
  let hasSecret = false;
  try {
    if (row?.credentials_encrypted) {
      const credentials = decryptYalidineWebhookCredentials(
        row.credentials_encrypted,
        row.merchant_id,
        process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || ''
      );
      hasSecret = Boolean(credentials.webhookSecret);
    }
  } catch {
    hasSecret = false;
  }
  const prepared = Boolean(row?.webhook_endpoint_token);
  return {
    prepared,
    connected: Boolean(row?.sync_enabled) && hasSecret,
    endpointUrl: prepared ? endpointUrl(row.webhook_endpoint_token) : null,
    connectedAt: row?.connected_at || null,
    lastWebhookReceivedAt: row?.last_webhook_received_at || null,
    lastWebhookProcessedAt: row?.last_webhook_processed_at || null,
    testMode: Boolean(row?.webhook_test_mode),
    lastError: row?.last_error || null,
  };
}

export async function getYalidineWebhookStatus(): Promise<{
  success: boolean;
  status: YalidineWebhookStatus;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const row = await loadIntegration(merchantId);
    return {
      success: true,
      status: row ? statusFromRow({ ...row, merchant_id: merchantId }) : {
        prepared: false,
        connected: false,
        endpointUrl: null,
        connectedAt: null,
        lastWebhookReceivedAt: null,
        lastWebhookProcessedAt: null,
        testMode: false,
        lastError: null,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      status: {
        prepared: false,
        connected: false,
        endpointUrl: null,
        connectedAt: null,
        lastWebhookReceivedAt: null,
        lastWebhookProcessedAt: null,
        testMode: false,
        lastError: null,
      },
      error: error?.message || 'تعذر تحميل حالة ربط Yalidine.',
    };
  }
}

/** Reserve a stable callback URL before the merchant creates the webhook in the courier dashboard. */
export async function prepareYalidineWebhookEndpoint(): Promise<{
  success: boolean;
  endpointUrl?: string;
  alreadyConnected?: boolean;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const existing = await loadIntegration(merchantId);
    if (existing?.webhook_endpoint_token) {
      return {
        success: true,
        endpointUrl: endpointUrl(existing.webhook_endpoint_token),
        alreadyConnected: Boolean(statusFromRow({ ...existing, merchant_id: merchantId }).connected),
      };
    }

    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (encryptionKey.length < 32) {
      throw new Error('إعداد التشفير غير مكتمل على الخادم. يرجى التواصل مع الدعم.');
    }

    const token = randomBytes(32).toString('base64url');
    const encryptedPendingSecret = encryptYalidineWebhookCredentials(
      { webhookSecret: '' },
      merchantId,
      encryptionKey
    );
    const now = new Date().toISOString();
    const supabase = getSupabaseAdminClient();
    const { error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .upsert({
        merchant_id: merchantId,
        provider: 'yalidine',
        base_url: 'https://api.guepex.app/v1/',
        credentials_encrypted: encryptedPendingSecret,
        webhook_endpoint_token: token,
        sync_enabled: false,
        connected_at: now,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      }, { onConflict: 'merchant_id,provider' });
    if (error) throw new Error('تعذر تجهيز رابط استقبال Yalidine. تأكد من تطبيق تحديث قاعدة البيانات.');

    revalidatePath('/merchant');
    return { success: true, endpointUrl: endpointUrl(token), alreadyConnected: false };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر تجهيز رابط استقبال Yalidine.' };
  }
}

export async function saveYalidineWebhookSecret(secretInput: string): Promise<{
  success: boolean;
  status?: YalidineWebhookStatus;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const secret = String(secretInput || '').trim();
    if (!secret || secret.length > 512) {
      throw new Error('مفتاح Webhook غير صالح. انسخ المفتاح الكامل من بطاقة Webhook في حسابك.');
    }

    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (encryptionKey.length < 32) {
      throw new Error('إعداد التشفير غير مكتمل على الخادم. يرجى التواصل مع الدعم.');
    }

    const existing = await loadIntegration(merchantId);
    if (!existing?.webhook_endpoint_token) {
      throw new Error('أنشئ رابط الاستقبال أولاً ثم أضفه في لوحة شركة التوصيل.');
    }

    const encrypted = encryptYalidineWebhookCredentials(
      { webhookSecret: secret },
      merchantId,
      encryptionKey
    );
    const now = new Date().toISOString();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        credentials_encrypted: encrypted,
        sync_enabled: true,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      })
      .eq('merchant_id', merchantId)
      .eq('provider', 'yalidine')
      .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error')
      .single();

    if (error || !data) throw new Error('تعذر حفظ مفتاح Webhook. تحقق من تحديث قاعدة البيانات ثم حاول مجدداً.');
    revalidatePath('/merchant');
    return { success: true, status: statusFromRow({ ...data, merchant_id: merchantId }) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر حفظ مفتاح Webhook.' };
  }
}

export async function setYalidineWebhookTestMode(enabled: boolean): Promise<{
  success: boolean;
  status?: YalidineWebhookStatus;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const existing = await loadIntegration(merchantId);
    if (!existing?.webhook_endpoint_token) {
      throw new Error('جهّز رابط الاستقبال أولاً.');
    }
    if (!existing?.sync_enabled) {
      throw new Error('احفظ مفتاح توقيع Webhook أولاً.');
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .update({ webhook_test_mode: enabled, updated_at: new Date().toISOString() })
      .eq('merchant_id', merchantId)
      .eq('provider', 'yalidine')
      .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error')
      .single();
    if (error || !data) throw new Error('تعذر تغيير وضع الاختبار.');
    revalidatePath('/merchant');
    return { success: true, status: statusFromRow({ ...data, merchant_id: merchantId }) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر تغيير وضع الاختبار.' };
  }
}

export async function disconnectYalidineWebhook(): Promise<{ success: boolean; error?: string }> {
  try {
    const merchantId = await authenticatedMerchantId();
    const supabase = getSupabaseAdminClient();
    const { error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .delete()
      .eq('merchant_id', merchantId)
      .eq('provider', 'yalidine');
    if (error) throw new Error('تعذر فصل ربط Yalidine من تاجر تراك.');
    revalidatePath('/merchant');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر فصل ربط Yalidine.' };
  }
}
