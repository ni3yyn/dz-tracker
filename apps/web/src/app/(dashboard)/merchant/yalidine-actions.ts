'use server';

import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import {
  getYalidineManualParcelOptions as fetchYalidineManualParcelOptions,
  getYalidineFeeQuote as fetchYalidineFeeQuote,
} from '@saas/orchestrator';
import { createClient } from '../../../lib/supabase-server';
import { normalizeMerchantServerError } from '../../../lib/merchant-error-messages';
import {
  decryptYalidineWebhookCredentials,
  encryptYalidineWebhookCredentials,
} from '../../../lib/yalidine-webhook-credentials';

type YalidineWebhookStatus = {
  prepared: boolean;
  connected: boolean;
  apiConnected: boolean;
  lastApiSyncAt: string | null;
  apiLastError: string | null;
  apiSyncRequestedAt: string | null;
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



type CompanionProof = {
  installationId: string;
  timestamp: number;
  nonce: string;
  signature: string;
};

const COMPANION_PROOF_MAX_AGE_MS = 60_000;

function validUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function companionChallengeHash(challenge: string): string {
  return createHash('sha256').update(challenge, 'utf8').digest('hex');
}

function validCompanionPublicKey(value: any): boolean {
  return Boolean(
    value &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value.x) &&
    typeof value.y === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value.y)
  );
}

function verifyCompanionSignature(publicKeyJwk: any, message: string, signature: string): boolean {
  try {
    const key = createPublicKey({ key: publicKeyJwk, format: 'jwk' });
    const bytes = Buffer.from(signature, 'base64url');
    if (bytes.length !== 64) return false;
    return verifySignature(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      bytes
    );
  } catch {
    return false;
  }
}

async function requireYalidineCompanionProof(
  merchantId: string,
  proof: CompanionProof | undefined,
  purpose: string
): Promise<void> {
  if (
    !proof ||
    !validUuid(proof.installationId) ||
    !Number.isSafeInteger(proof.timestamp) ||
    Math.abs(Date.now() - proof.timestamp) > COMPANION_PROOF_MAX_AGE_MS ||
    typeof proof.nonce !== 'string' ||
    !/^[A-Za-z0-9_-]{20,128}$/.test(proof.nonce) ||
    typeof proof.signature !== 'string' ||
    proof.signature.length > 256
  ) {
    throw new Error('ثبّت إضافة TajerTrack Companion وافتحها في المتصفح ثم أعد التحقق قبل ربط Yalidine / Guepex.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: device, error } = await (supabase as any)
    .from('merchant_companion_devices')
    .select('installation_id, public_key, revoked_at')
    .eq('merchant_id', merchantId)
    .eq('installation_id', proof.installationId)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !device || !validCompanionPublicKey(device.public_key)) {
    throw new Error('إضافة TajerTrack Companion غير مربوطة بهذا المتجر. أعد ربط الإضافة أولاً.');
  }

  const signedMessage = [
    'tt-companion-proof-v1',
    proof.installationId,
    purpose,
    String(proof.timestamp),
    proof.nonce,
  ].join('\n');

  if (!verifyCompanionSignature(device.public_key, signedMessage, proof.signature)) {
    throw new Error('تعذر التحقق من إضافة TajerTrack Companion. حدّث حالة الإضافة وأعد المحاولة.');
  }

  const { error: purgeError } = await (supabase as any)
    .from('merchant_companion_proof_nonces')
    .delete()
    .lt('expires_at', new Date().toISOString());
  if (purgeError) throw new Error('تعذر تحديث حماية إضافة TajerTrack Companion. حاول مجدداً.');

  const { error: nonceError } = await (supabase as any)
    .from('merchant_companion_proof_nonces')
    .insert({
      installation_id: proof.installationId,
      nonce: proof.nonce,
      purpose,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  if (nonceError) {
    if (nonceError.code === '23505') throw new Error('تم استخدام إثبات الإضافة مسبقاً. أعد التحقق ثم حاول مجدداً.');
    throw new Error('تعذر تسجيل إثبات الإضافة لمرة واحدة. تحقق من تحديث قاعدة البيانات.');
  }

  const { error: touchError } = await (supabase as any)
    .from('merchant_companion_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('merchant_id', merchantId)
    .eq('installation_id', proof.installationId)
    .is('revoked_at', null);
  if (touchError) throw new Error('تعذر تحديث حالة إضافة TajerTrack Companion. حاول مجدداً.');
}

export async function getYalidineCompanionStatus(installationId?: string): Promise<{
  success: boolean;
  paired: boolean;
  installationId?: string;
  version?: string | null;
  pairedAt?: string | null;
  lastSeenAt?: string | null;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const supabase = getSupabaseAdminClient();
    let query = (supabase as any)
      .from('merchant_companion_devices')
      .select('installation_id, extension_version, paired_at, last_seen_at')
      .eq('merchant_id', merchantId)
      .is('revoked_at', null);
    if (installationId) {
      if (!validUuid(installationId)) throw new Error('معرّف تثبيت الإضافة غير صالح.');
      query = query.eq('installation_id', installationId);
    } else {
      query = query.order('last_seen_at', { ascending: false }).limit(1);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error('تعذر تحميل حالة إضافة TajerTrack Companion. تأكد من تطبيق تحديث قاعدة البيانات.');
    return {
      success: true,
      paired: Boolean(data?.installation_id),
      installationId: data?.installation_id,
      version: data?.extension_version || null,
      pairedAt: data?.paired_at || null,
      lastSeenAt: data?.last_seen_at || null,
    };
  } catch (error: any) {
    return {
      success: false,
      paired: false,
      error: error?.message || 'تعذر تحميل حالة إضافة TajerTrack Companion.',
    };
  }
}

export async function createYalidineCompanionPairingChallenge(): Promise<{
  success: boolean;
  challenge?: string;
  merchantId?: string;
  expiresAt?: string;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const challenge = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const supabase = getSupabaseAdminClient();
    const { error } = await (supabase as any)
      .from('merchant_companion_pairing_challenges')
      .insert({
        merchant_id: merchantId,
        challenge_hash: companionChallengeHash(challenge),
        expires_at: expiresAt,
      });
    if (error) throw new Error('تعذر إنشاء طلب ربط الإضافة. تحقق من تحديث قاعدة البيانات.');
    return { success: true, challenge, merchantId, expiresAt };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر إنشاء طلب ربط الإضافة.' };
  }
}

export async function completeYalidineCompanionPairing(input: {
  installationId: string;
  publicKey: unknown;
  signature: string;
  challenge: string;
  version?: string;
}): Promise<{ success: boolean; installationId?: string; error?: string }> {
  try {
    const merchantId = await authenticatedMerchantId();
    if (
      !input ||
      !validUuid(input.installationId) ||
      typeof input.challenge !== 'string' ||
      input.challenge.length < 32 ||
      input.challenge.length > 256 ||
      typeof input.signature !== 'string' ||
      input.signature.length > 256 ||
      !validCompanionPublicKey(input.publicKey)
    ) {
      throw new Error('بيانات ربط الإضافة غير صالحة. أعد المحاولة.');
    }

    const supabase = getSupabaseAdminClient();
    const challengeHash = companionChallengeHash(input.challenge);
    const { data: pending, error: challengeError } = await (supabase as any)
      .from('merchant_companion_pairing_challenges')
      .select('id, expires_at, consumed_at')
      .eq('merchant_id', merchantId)
      .eq('challenge_hash', challengeHash)
      .is('consumed_at', null)
      .maybeSingle();

    if (challengeError || !pending || new Date(pending.expires_at).getTime() <= Date.now()) {
      throw new Error('انتهت صلاحية طلب الربط. اضغط ربط الإضافة مجدداً.');
    }

    const signedMessage = [
      'tt-companion-pair-v1',
      merchantId,
      input.challenge,
      input.installationId,
    ].join('\n');

    if (!verifyCompanionSignature(input.publicKey, signedMessage, input.signature)) {
      throw new Error('فشل التحقق من توقيع TajerTrack Companion.');
    }

    const { data: existingDevice, error: existingError } = await (supabase as any)
      .from('merchant_companion_devices')
      .select('merchant_id, installation_id')
      .eq('installation_id', input.installationId)
      .maybeSingle();
    if (existingError) throw new Error('تعذر التحقق من تثبيت الإضافة.');
    if (existingDevice && existingDevice.merchant_id !== merchantId) {
      throw new Error('هذا التثبيت مربوط بمتجر آخر. افصل الإضافة من المتجر السابق أولاً.');
    }

    const now = new Date().toISOString();
    const { data: consumed, error: consumeError } = await (supabase as any)
      .from('merchant_companion_pairing_challenges')
      .update({ consumed_at: now })
      .eq('id', pending.id)
      .is('consumed_at', null)
      .select('id')
      .maybeSingle();
    if (consumeError || !consumed) {
      throw new Error('انتهت صلاحية طلب الربط أو استُخدم مسبقاً. أعد المحاولة.');
    }

    const { error: saveError } = await (supabase as any)
      .from('merchant_companion_devices')
      .upsert({
        merchant_id: merchantId,
        installation_id: input.installationId,
        public_key: input.publicKey,
        extension_version: String(input.version || '').slice(0, 32) || null,
        paired_at: now,
        last_seen_at: now,
        revoked_at: null,
      }, { onConflict: 'installation_id' });
    if (saveError) throw new Error('تعذر حفظ ربط الإضافة. أنشئ طلب ربط جديداً ثم حاول مجدداً.');

    revalidatePath('/merchant');
    return { success: true, installationId: input.installationId };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر ربط إضافة TajerTrack Companion.' };
  }
}

export async function recordYalidineCompanionHeartbeat(proof: CompanionProof): Promise<{
  success: boolean;
  installationId?: string;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    await requireYalidineCompanionProof(merchantId, proof, 'status');
    return { success: true, installationId: proof.installationId };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر التحقق من حالة الإضافة.' };
  }
}

const MANUAL_REFRESH_MIGRATION = 'apps/web/src/app/migrations/20261115_yalidine_manual_api_refresh.sql';
const MANUAL_REFRESH_SCHEMA_ERROR =
  'تحديث قاعدة البيانات الخاص بالتحديث اليدوي غير مطبق. شغّل الملف ' +
  MANUAL_REFRESH_MIGRATION +
  ' في Supabase SQL Editor ثم أعد المحاولة.';

function isMissingManualRefreshColumn(error: any): boolean {
  const message = String(error?.message || '');
  return /api_sync_requested_at/i.test(message) &&
    (error?.code === '42703' || /(does not exist|schema cache|could not find)/i.test(message));
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
    .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error, api_sync_enabled, last_api_sync_at, api_last_error, api_sync_requested_at')
    .eq('merchant_id', merchantId)
    .eq('provider', 'yalidine')
    .maybeSingle();
  if (error) {
    if (isMissingManualRefreshColumn(error)) throw new Error(MANUAL_REFRESH_SCHEMA_ERROR);
    throw new Error('تعذر قراءة إعدادات Yalidine. تأكد من تطبيق تحديث قاعدة البيانات.');
  }
  return data;
}

function manualParcelOptionsCacheVersion(integration: any): string {
  return createHash('sha256')
    .update([
      String(integration?.id || ''),
      String(integration?.base_url || 'https://api.guepex.app/v1/'),
      String(integration?.credentials_encrypted || ''),
    ].join('\n'))
    .digest('hex');
}

function manualParcelCredentials(integration: any, merchantId: string): {
  apiId: string;
  apiToken: string;
} {
  if (!integration?.api_sync_enabled || !integration?.credentials_encrypted) {
    throw new Error('اربط حساب Yalidine / Guepex API أولاً من صفحة التكاملات لإنشاء الشحنات مباشرة.');
  }

  const credentials = decryptYalidineWebhookCredentials(
    integration.credentials_encrypted,
    merchantId,
    process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || ''
  );
  if (!credentials.apiId || !credentials.apiToken) {
    throw new Error('بيانات API غير مكتملة. أعد ربط حساب Yalidine / Guepex.');
  }
  return { apiId: credentials.apiId, apiToken: credentials.apiToken };
}

/**
 * Returns an opaque fingerprint for the active carrier connection. This lets
 * the browser invalidate location data when credentials or the API endpoint
 * changes, without exposing any credential material.
 */
export async function getYalidineManualParcelOptionsCacheVersion(): Promise<{
  success: boolean;
  cacheVersion?: string;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const integration = await loadIntegration(merchantId);
    manualParcelCredentials(integration, merchantId);
    return { success: true, cacheVersion: manualParcelOptionsCacheVersion(integration) };
  } catch (error: any) {
    return {
      success: false,
      error: normalizeMerchantServerError(error, 'locations'),
    };
  }
}

/**
 * Fetch official Yalidine / Guepex locations for the authenticated merchant's
 * parcel-creation form. Credentials never leave this server action.
 */
export async function getYalidineManualParcelOptions(): Promise<{
  success: boolean;
  options?: Awaited<ReturnType<typeof fetchYalidineManualParcelOptions>>;
  cacheVersion?: string;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const integration = await loadIntegration(merchantId);
    const credentials = manualParcelCredentials(integration, merchantId);
    const cacheVersion = manualParcelOptionsCacheVersion(integration);
    const options = await fetchYalidineManualParcelOptions(
      integration.base_url || 'https://api.guepex.app/v1/',
      credentials
    );
    return { success: true, options, cacheVersion };
  } catch (error: any) {
    console.error('[YalidineManual] Location lookup failed:', {
      status: error?.status,
      kind: error?.kind,
      message: error?.message,
    });
    return {
      success: false,
      error: normalizeMerchantServerError(error, 'locations'),
    };
  }
}


export async function getYalidineManualFeeQuote(
  fromWilayaId: number,
  toWilayaId: number,
  communeId: number
): Promise<{
  success: boolean;
  quote?: Awaited<ReturnType<typeof fetchYalidineFeeQuote>>;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const integration = await loadIntegration(merchantId);
    if (!integration?.api_sync_enabled || !integration?.credentials_encrypted) {
      throw new Error('اربط حساب Yalidine / Guepex API أولاً لعرض تسعيرة التوصيل.');
    }
    const credentials = decryptYalidineWebhookCredentials(
      integration.credentials_encrypted,
      merchantId,
      process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || ''
    );
    if (!credentials.apiId || !credentials.apiToken) {
      throw new Error('بيانات API غير مكتملة. أعد ربط API ID و API Token.');
    }
    const quote = await fetchYalidineFeeQuote(
      integration.base_url || 'https://api.guepex.app/v1/',
      { apiId: credentials.apiId, apiToken: credentials.apiToken },
      fromWilayaId, toWilayaId, communeId
    );
    return { success: true, quote };
  } catch (error: any) {
    console.error('[YalidineManual] Fee quote failed:', {
      status: error?.status,
      kind: error?.kind,
      message: error?.message,
    });
    return {
      success: false,
      error: normalizeMerchantServerError(error, 'fees'),
    };
  }
}

function statusFromRow(row: any): YalidineWebhookStatus {
  let hasSecret = false;
  let hasApiCredentials = false;
  try {
    if (row?.credentials_encrypted) {
      const credentials = decryptYalidineWebhookCredentials(
        row.credentials_encrypted,
        row.merchant_id,
        process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || ''
      );
      hasSecret = Boolean(credentials.webhookSecret);
      hasApiCredentials = Boolean(credentials.apiId && credentials.apiToken);
    }
  } catch {
    hasSecret = false;
    hasApiCredentials = false;
  }
  const prepared = Boolean(row?.webhook_endpoint_token);
  return {
    prepared,
    connected: Boolean(row?.sync_enabled) && hasSecret,
    apiConnected: Boolean(row?.api_sync_enabled) && hasApiCredentials,
    lastApiSyncAt: row?.last_api_sync_at || null,
    apiLastError: row?.api_last_error || null,
    apiSyncRequestedAt: row?.api_sync_requested_at || null,
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
        apiConnected: false,
        lastApiSyncAt: null,
        apiLastError: null,
        apiSyncRequestedAt: null,
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
        apiConnected: false,
        lastApiSyncAt: null,
        apiLastError: null,
        apiSyncRequestedAt: null,
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

/**
 * Queue an immediate, merchant-scoped Guepex refresh for the existing Railway worker.
 * The worker claims its normal per-account lease before consuming this request.
 */
export async function requestYalidineApiSync(): Promise<{
  success: boolean;
  requestedAt?: string;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    const existing = await loadIntegration(merchantId);
    if (!existing?.api_sync_enabled || !existing?.credentials_encrypted) {
      throw new Error('اربط Guepex API أولاً قبل طلب تحديث الطرود.');
    }

    const requestedAt = new Date().toISOString();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        api_sync_requested_at: requestedAt,
        api_last_error: null,
        api_last_error_at: null,
        updated_at: requestedAt,
      })
      .eq('merchant_id', merchantId)
      .eq('provider', 'yalidine')
      .eq('api_sync_enabled', true)
      .select('id')
      .maybeSingle();

    if (error) {
      if (isMissingManualRefreshColumn(error)) throw new Error(MANUAL_REFRESH_SCHEMA_ERROR);
      throw new Error('تعذر إرسال طلب تحديث Guepex.');
    }
    if (!data?.id) throw new Error('حساب Guepex غير متصل أو أن المزامنة متوقفة.');

    revalidatePath('/merchant');
    return { success: true, requestedAt };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر طلب تحديث Guepex.' };
  }
}

/** Reserve a stable callback URL before the merchant creates the webhook in the courier dashboard. */
export async function prepareYalidineWebhookEndpoint(proof?: CompanionProof): Promise<{
  success: boolean;
  endpointUrl?: string;
  alreadyConnected?: boolean;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    await requireYalidineCompanionProof(merchantId, proof, 'prepare-webhook');
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
    const previousCredentials = existing?.credentials_encrypted
      ? decryptYalidineWebhookCredentials(existing.credentials_encrypted, merchantId, encryptionKey)
      : { webhookSecret: '' };
    const encryptedPendingSecret = encryptYalidineWebhookCredentials(
      previousCredentials,
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

export async function saveYalidineApiCredentials(
  apiIdInput: string,
  apiTokenInput: string,
  proof?: CompanionProof
): Promise<{
  success: boolean;
  status?: YalidineWebhookStatus;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    await requireYalidineCompanionProof(merchantId, proof, 'save-api');
    const apiId = String(apiIdInput || '').trim();
    const apiToken = String(apiTokenInput || '').trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(apiId)) {
      throw new Error('API ID غير صالح. تحقق من القيمة المنسوخة من لوحة Guepex.');
    }
    if (apiToken.length < 16 || apiToken.length > 512) {
      throw new Error('API Token غير صالح. تحقق من القيمة المنسوخة من لوحة Guepex.');
    }

    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (encryptionKey.length < 32) {
      throw new Error('إعداد التشفير غير مكتمل على الخادم. يرجى التواصل مع الدعم.');
    }

    // Verify the credentials against the read-only parcel endpoint before saving.
    const probeUrl = new URL('parcels/', 'https://api.guepex.app/v1/');
    probeUrl.searchParams.set('page_size', '1');
    let response: Response;
    try {
      response = await fetch(probeUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-ID': apiId,
          'X-API-TOKEN': apiToken,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error('انتهت مهلة الاتصال بـ Guepex أثناء التحقق من بيانات API.');
      }
      throw new Error('تعذر الاتصال بواجهة Guepex API. حاول مجدداً.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('رفضت Guepex بيانات API ID أو API Token. تحقق منهما ثم أعد المحاولة.');
    }
    if (response.status === 429) {
      throw new Error('وصلت Guepex إلى حد الطلبات. انتظر قليلاً ثم أعد المحاولة.');
    }
    if (!response.ok) {
      throw new Error('تعذر التحقق من Guepex API (HTTP ' + response.status + ').');
    }

    let payload: any;
    try { payload = await response.json(); } catch {
      throw new Error('أعادت Guepex استجابة غير صالحة أثناء التحقق من بيانات API.');
    }
    const parcelRows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.body)
        ? payload.body
        : Array.isArray(payload?.data?.data)
          ? payload.data.data
          : null;
    if (!parcelRows || payload?.success === false || payload?.error) {
      throw new Error('لم تتعرف Guepex على استجابة قائمة الطرود. تحقق من صلاحيات API.');
    }

    const existing = await loadIntegration(merchantId);
    const previousCredentials = existing?.credentials_encrypted
      ? decryptYalidineWebhookCredentials(existing.credentials_encrypted, merchantId, encryptionKey)
      : { webhookSecret: '' };
    const encrypted = encryptYalidineWebhookCredentials(
      { ...previousCredentials, apiId, apiToken },
      merchantId,
      encryptionKey
    );

    const now = new Date().toISOString();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('merchant_carrier_integrations')
      .upsert({
        merchant_id: merchantId,
        provider: 'yalidine',
        base_url: 'https://api.guepex.app/v1/',
        credentials_encrypted: encrypted,
        api_sync_enabled: true,
        sync_enabled: Boolean(existing?.sync_enabled),
        last_api_sync_at: null,
        api_last_error: null,
        api_last_error_at: null,
        api_sync_requested_at: now,
        connected_at: existing?.connected_at || now,
        updated_at: now,
      }, { onConflict: 'merchant_id,provider' })
      .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error, api_sync_enabled, last_api_sync_at, api_last_error, api_sync_requested_at')
      .single();

    if (error || !data) throw new Error('تم التحقق من بيانات API لكن تعذر حفظها. حاول مجدداً.');
    revalidatePath('/merchant');
    return { success: true, status: statusFromRow({ ...data, merchant_id: merchantId }) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر ربط حساب Guepex API.' };
  }
}

export async function saveYalidineWebhookSecret(secretInput: string, proof?: CompanionProof): Promise<{
  success: boolean;
  status?: YalidineWebhookStatus;
  error?: string;
}> {
  try {
    const merchantId = await authenticatedMerchantId();
    await requireYalidineCompanionProof(merchantId, proof, 'save-webhook');
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
      {
        ...(existing?.credentials_encrypted
          ? decryptYalidineWebhookCredentials(existing.credentials_encrypted, merchantId, encryptionKey)
          : { webhookSecret: '' }),
        webhookSecret: secret,
      },
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
      .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error, api_sync_enabled, last_api_sync_at, api_last_error, api_sync_requested_at')
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
      .select('id, base_url, credentials_encrypted, webhook_endpoint_token, connected_at, sync_enabled, last_webhook_received_at, last_webhook_processed_at, webhook_test_mode, last_error, api_sync_enabled, last_api_sync_at, api_last_error, api_sync_requested_at')
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
