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
    .eq('enabled', true)
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
