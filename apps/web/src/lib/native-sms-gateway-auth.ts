import { createHash } from 'node:crypto';
import { getSupabaseAdminClient } from '@saas/database';

export type NativeSmsDevice = {
  device_id: string;
  merchant_id: string;
  enabled: boolean;
  revoked_at: string | null;
};

export type NativeSmsDeviceAuth =
  | { ok: true; supabase: any; device: NativeSmsDevice }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Authenticates a native Android phone using a per-device random bearer token.
 * Only the SHA-256 digest is stored in Supabase. The legacy Termux secret and
 * its global worker identity are deliberately not accepted here.
 */
export async function authenticateNativeSmsDevice(
  request: Request,
  metadata?: { appVersion?: string | null }
): Promise<NativeSmsDeviceAuth> {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';

  // A 256-bit base64url token is 43 characters. Reject obviously invalid input
  // before making a database request.
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const supabase = getSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data: device, error } = await supabase
    .from('sms_gateway_devices')
    .update({
      last_seen_at: now,
      updated_at: now,
      ...(metadata?.appVersion
        ? { app_version: metadata.appVersion.slice(0, 32) }
        : {}),
    })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .not('merchant_id', 'is', null)
    .select('device_id, merchant_id, enabled, revoked_at')
    .maybeSingle();

  if (error) {
    console.error('[NativeSmsGateway] Device authentication query failed:', error.message);
    return { ok: false, status: 503, error: 'SMS device authentication is temporarily unavailable.' };
  }

  if (!device?.device_id || !device?.merchant_id) {
    return { ok: false, status: 401, error: 'This phone is no longer connected. Reconnect it from TajerTrack.' };
  }

  return { ok: true, supabase, device: device as NativeSmsDevice };
}

export function hashNativeSmsCredential(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}


export type NativeSmsManager = {
  manager_device_id: string;
  merchant_id: string;
  owner_user_id: string;
  primary_sender_device_id: string | null;
  enabled: boolean;
  revoked_at: string | null;
};

export type NativeSmsManagerAuth =
  | { ok: true; supabase: any; manager: NativeSmsManager }
  | { ok: false; status: 401 | 403 | 503; error: string };

/**
 * Manager credentials are intentionally not accepted by SMS sender endpoints.
 * They authorize device administration only and are checked against the
 * currently owning, non-banned merchant account on every request.
 */
export async function authenticateNativeSmsManager(
  request: Request
): Promise<NativeSmsManagerAuth> {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';

  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  const tokenHash = hashNativeSmsCredential(token);
  const supabase = getSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data: manager, error } = await supabase
    .from('sms_gateway_manager_devices')
    .update({ last_seen_at: now, updated_at: now })
    .eq('token_hash', tokenHash)
    .eq('enabled', true)
    .is('revoked_at', null)
    .select('manager_device_id, merchant_id, owner_user_id, primary_sender_device_id, enabled, revoked_at')
    .maybeSingle();

  if (error) {
    console.error('[NativeSmsGateway] Manager authentication query failed:', error.message);
    return { ok: false, status: 503, error: 'Device management is temporarily unavailable.' };
  }

  if (!manager?.manager_device_id || !manager?.merchant_id || !manager?.owner_user_id) {
    return { ok: false, status: 401, error: 'The main TajerTrack Phone is no longer authorized. Reconnect it from the merchant account.' };
  }

  const [{ data: merchant, error: merchantError }, { data: account, error: accountError }] = await Promise.all([
    supabase
      .from('merchants')
      .select('id, auth_user_id')
      .eq('id', manager.merchant_id)
      .maybeSingle(),
    supabase.auth.admin.getUserById(manager.owner_user_id),
  ]);

  if (merchantError || accountError) {
    console.error('[NativeSmsGateway] Manager owner validation failed:', merchantError?.message || accountError?.message);
    return { ok: false, status: 503, error: 'Merchant account verification is temporarily unavailable.' };
  }

  const accountUser: any = account?.user;
  const bannedUntil = accountUser?.banned_until ? new Date(accountUser.banned_until).getTime() : 0;
  if (
    !merchant ||
    merchant.auth_user_id !== manager.owner_user_id ||
    !accountUser ||
    (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) ||
    accountUser.deleted_at
  ) {
    return { ok: false, status: 403, error: 'The merchant account is no longer eligible to manage sender devices.' };
  }

  return { ok: true, supabase, manager: manager as NativeSmsManager };
}
