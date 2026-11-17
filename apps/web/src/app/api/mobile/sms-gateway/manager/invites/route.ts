import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticateNativeSmsManager, hashNativeSmsCredential } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPERATORS = new Set(['djezzy', 'mobilis', 'ooredoo']);

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const operatorCode = typeof body?.operatorCode === 'string'
    ? body.operatorCode.trim().toLowerCase()
    : '';
  if (!OPERATORS.has(operatorCode)) {
    return NextResponse.json({ error: 'اختر شبكة إرسال صالحة.' }, { status: 400 });
  }

  const auth = await authenticateNativeSmsManager(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await auth.supabase
    .from('sms_gateway_device_invites')
    .select('token_hash', { count: 'exact', head: true })
    .eq('merchant_id', auth.manager.merchant_id)
    .gte('created_at', since);

  if (countError) {
    console.error('[NativeSmsGateway] Manager invite rate check failed:', countError.message);
    return NextResponse.json({ error: 'تعذر إنشاء رابط الدعوة حالياً.' }, { status: 503 });
  }
  if ((count || 0) >= 12) {
    return NextResponse.json({ error: 'تم إنشاء عدة روابط دعوة مؤخراً. حاول لاحقاً.' }, { status: 429 });
  }

  const { error: rotationError } = await auth.supabase
    .from('sms_gateway_device_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('merchant_id', auth.manager.merchant_id)
    .eq('operator_code', operatorCode)
    .is('consumed_at', null);

  if (rotationError) {
    console.error('[NativeSmsGateway] Could not rotate an existing manager invitation:', rotationError.message);
    return NextResponse.json({ error: 'تعذر إنشاء رابط الدعوة حالياً.' }, { status: 503 });
  }

  const invite = randomBytes(32).toString('base64url');
  const { error: insertError } = await auth.supabase
    .from('sms_gateway_device_invites')
    .insert({
      token_hash: hashNativeSmsCredential(invite),
      merchant_id: auth.manager.merchant_id,
      created_by: auth.manager.owner_user_id,
      manager_device_id: auth.manager.manager_device_id,
      operator_code: operatorCode,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

  if (insertError) {
    console.error('[NativeSmsGateway] Could not create a manager invitation:', insertError.message);
    return NextResponse.json({ error: 'تعذر إنشاء رابط الدعوة حالياً.' }, { status: 503 });
  }

  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.TRACKING_PUBLIC_BASE_URL ||
    'https://tajertrack.vercel.app'
  ).replace(/\/+$/, '');

  return NextResponse.json({
    inviteUrl: `${baseUrl}/mobile/sms-gateway/connect?invite=${encodeURIComponent(invite)}`,
    expiresInSeconds: 1800,
    operatorCode,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}
