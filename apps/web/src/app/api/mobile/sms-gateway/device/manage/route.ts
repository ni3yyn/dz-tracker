import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../../../lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: 'Origin validation failed.' }, { status: 403 });
  }
  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'سجّل الدخول إلى حساب التاجر أولاً.' }, { status: 401 });
  }
  if (isAuthorizedAdmin(user)) {
    return NextResponse.json({ error: 'هذا الإجراء متاح من حساب التاجر فقط.' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  if (!/^[0-9a-f-]{30,40}$/i.test(deviceId) || !['enable', 'disable', 'revoke'].includes(action)) {
    return NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 });
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

  const { data, error } = action === 'revoke'
    ? await supabase.rpc('revoke_native_sms_gateway_device', {
        p_merchant_id: merchant.id,
        p_device_id: deviceId,
      })
    : await supabase.rpc('set_native_sms_gateway_device_enabled', {
        p_merchant_id: merchant.id,
        p_device_id: deviceId,
        p_enabled: action === 'enable',
      });

  if (error) {
    console.error('[NativeSmsGateway] Sender-line management failed:', error.message);
    return NextResponse.json({ error: 'تعذر تحديث خط الإرسال حالياً.' }, { status: 503 });
  }
  if (data !== true) {
    return NextResponse.json({
      error: action === 'enable'
        ? 'لا يمكن تفعيل هذا الخط؛ يوجد جهاز نشط آخر للشبكة نفسها أو أن الخط لم يعد متاحاً.'
        : 'لم يتم العثور على خط إرسال نشط لهذا المتجر.',
    }, { status: 409 });
  }

  return NextResponse.json({ success: true, action }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
