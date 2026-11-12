import { createHash, timingSafeEqual } from 'node:crypto';

export type SmsGatewayAuthResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'unauthorized' };

/**
 * The Android device is the only SMS sender in this first deployment.
 * Keep this secret only in Vercel and the dedicated Termux device.
 */
export function authorizeSmsGatewayRequest(request: Request): SmsGatewayAuthResult {
  const expected = process.env.SMS_GATEWAY_DEVICE_TOKEN?.trim();
  if (!expected || expected.length < 32) {
    return { ok: false, reason: 'not_configured' };
  }

  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const expectedDigest = createHash('sha256').update(expected).digest();
  const suppliedDigest = createHash('sha256').update(supplied).digest();

  return timingSafeEqual(expectedDigest, suppliedDigest)
    ? { ok: true }
    : { ok: false, reason: 'unauthorized' };
}

export const SMS_GATEWAY_WORKER_ID = 'android-sms-gateway';
