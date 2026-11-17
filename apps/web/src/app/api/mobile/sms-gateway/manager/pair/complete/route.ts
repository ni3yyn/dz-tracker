import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { hashNativeSmsCredential } from '../../../../../../../lib/native-sms-gateway-auth';

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
  const platform = typeof body?.platform === 'string' ? body.platform.trim().slice(0, 24) : 'android';
  const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.trim().slice(0, 32) : 'unknown';

  if (!/^[A-Za-z0-9_-]{30,100}$/.test(code)) {
    return NextResponse.json({ error: 'This manager pairing code is invalid or expired.' }, { status: 400 });
  }

  const managerDeviceId = randomUUID();
  const managerToken = randomBytes(32).toString('base64url');
  const senderDeviceId = randomUUID();
  const senderToken = randomBytes(32).toString('base64url');
  const supabase = getSupabaseAdminClient() as any;

  try {
    const { data, error } = await supabase.rpc('complete_native_sms_gateway_manager_pairing', {
      p_code_hash: hashNativeSmsCredential(code),
      p_manager_device_id: managerDeviceId,
      p_manager_token_hash: hashNativeSmsCredential(managerToken),
      p_manager_token_last_four: managerToken.slice(-4),
      p_sender_device_id: senderDeviceId,
      p_sender_token_hash: hashNativeSmsCredential(senderToken),
      p_token_last_four: senderToken.slice(-4),
      p_device_name: deviceName || 'Android phone',
      p_platform: platform || 'android',
      p_app_version: appVersion || 'unknown',
    });

    if (error) {
      console.error('[NativeSmsGateway] Manager pairing transaction failed:', error.message);
      return NextResponse.json({ error: 'تعذر إكمال ربط الهاتف الرئيسي حالياً.' }, { status: 503 });
    }

    const pairing = Array.isArray(data) ? data[0] : data;
    if (pairing?.blocked === true) {
      return NextResponse.json({
        error: 'لم يكتمل الربط. قد يكون هناك هاتف رئيسي آخر أو أن خط الإرسال موقوف من الإدارة. راجع حسابك أو دعم تاجر تراك.',
        errorCode: 'manager_or_sender_slot_blocked',
      }, { status: 409 });
    }

    if (
      !pairing?.manager_device_id ||
      !pairing?.sender_device_id ||
      !pairing?.merchant_id ||
      !pairing?.operator_code
    ) {
      return NextResponse.json({
        error: 'This manager pairing code has expired, was already used, or no longer belongs to this merchant account.',
      }, { status: 400 });
    }

    return NextResponse.json({
      managerDeviceId: pairing.manager_device_id,
      managerToken,
      senderDeviceId: pairing.sender_device_id,
      deviceToken: senderToken,
      storeName: pairing.store_name || 'متجرك',
      operatorCode: pairing.operator_code,
      role: 'manager',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Manager pairing endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'تعذر إكمال ربط الهاتف الرئيسي حالياً.' }, { status: 500 });
  }
}
