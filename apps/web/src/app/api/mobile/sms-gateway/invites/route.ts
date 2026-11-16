import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../../lib/admin-auth';
import { hashNativeSmsCredential } from '../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPERATORS = new Set(['djezzy', 'mobilis', 'ooredoo']);

export async function POST(request: Request) {
  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'سجّل الدخول إلى حساب التاجر أولاً.' }, { status: 401 });
  }
  if (isAuthorizedAdmin(user)) {
    return NextResponse.json({ error: 'لا يمكن إنشاء دعوة من حساب الإدارة.' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const operatorCode = typeof body?.operatorCode === 'string' ? body.operatorCode.trim().toLowerCase() : '';
  if (!OPERATORS.has(operatorCode)) {
    return NextResponse.json({ error: 'اختر شبكة إرسال صالحة.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as any;
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (merchantError || !merchant?.id) {
    return NextResponse.json({ error: 'لم يتم العثور على متجر مرتبط بهذا الحساب.' }, { status: 404 });
  }

  // Keep invite generation bounded even if a browser repeats a request.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('sms_gateway_device_invites')
    .select('token_hash', { count: 'exact', head: true })
    .eq('merchant_id', merchant.id)
    .gte('created_at', since);

  if (countError) {
    console.error('[NativeSmsGateway] Invite rate check failed:', countError.message);
    return NextResponse.json({ error: 'تعذر إنشاء رابط الربط حالياً.' }, { status: 503 });
  }
  if ((count || 0) >= 12) {
    return NextResponse.json({ error: 'تم إنشاء عدة روابط ربط مؤخراً. حاول لاحقاً.' }, { status: 429 });
  }

  const invite = randomBytes(32).toString('base64url');
  const { error: insertError } = await supabase
    .from('sms_gateway_device_invites')
    .insert({
      token_hash: hashNativeSmsCredential(invite),
      merchant_id: merchant.id,
      created_by: user.id,
      operator_code: operatorCode,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

  if (insertError) {
    console.error('[NativeSmsGateway] Could not create a sender-line invite:', insertError.message);
    return NextResponse.json({ error: 'تعذر إنشاء رابط الربط حالياً.' }, { status: 503 });
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
      'Pragma': 'no-cache',
    },
  });
}
