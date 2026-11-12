import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { hashNativeSmsCredential } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const deviceName = typeof body?.deviceName === 'string'
    ? body.deviceName.trim().slice(0, 80)
    : 'Android phone';
  const appVersion = typeof body?.appVersion === 'string'
    ? body.appVersion.trim().slice(0, 32)
    : 'unknown';

  if (!/^[A-Za-z0-9_-]{30,100}$/.test(code)) {
    return NextResponse.json({ error: 'This pairing link is invalid or expired. Start again from TajerTrack.' }, { status: 400 });
  }

  const deviceId = randomUUID();
  const deviceToken = randomBytes(32).toString('base64url');
  const supabase = getSupabaseAdminClient() as any;

  try {
    const { data, error } = await supabase.rpc('complete_native_sms_gateway_pairing', {
      p_code_hash: hashNativeSmsCredential(code),
      p_device_id: deviceId,
      p_token_hash: hashNativeSmsCredential(deviceToken),
      p_token_last_four: deviceToken.slice(-4),
      p_device_name: deviceName || 'Android phone',
      p_platform: 'android',
      p_app_version: appVersion || 'unknown',
    });

    if (error) {
      console.error('[NativeSmsGateway] Pairing transaction failed:', error.message);
      return NextResponse.json({ error: 'Could not connect this phone right now. Please try again.' }, { status: 503 });
    }

    const pairing = Array.isArray(data) ? data[0] : data;
    if (pairing?.blocked === true) {
      return NextResponse.json({
        error: 'تم إيقاف هذا الهاتف من إدارة تاجر تراك. تواصل مع الدعم قبل ربط هاتف بديل.',
      }, { status: 403 });
    }
    if (!pairing?.device_id || !pairing?.merchant_id) {
      return NextResponse.json({ error: 'This pairing link has expired or has already been used. Start again from TajerTrack.' }, { status: 400 });
    }

    // The plaintext credential is returned exactly once and is never persisted.
    return NextResponse.json({
      deviceId: pairing.device_id,
      deviceToken,
      storeName: pairing.store_name || 'متجرك',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Pairing endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not connect this phone right now. Please try again.' }, { status: 500 });
  }
}
