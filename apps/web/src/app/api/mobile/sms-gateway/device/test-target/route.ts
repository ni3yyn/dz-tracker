import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeAlgerianMobileNumber(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('213')) value = `+${value}`;
  if (/^0[5-7]\d{8}$/.test(value)) value = `+213${value.slice(1)}`;
  return /^\+213[5-7]\d{8}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const auth = await authenticateNativeSmsDevice(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.device.enabled !== true) {
    return NextResponse.json({ error: 'تم إيقاف هذا الهاتف من إدارة تاجر تراك.' }, { status: 403 });
  }

  try {
    const { data: merchant, error: merchantError } = await auth.supabase
      .from('merchants')
      .select('auth_user_id')
      .eq('id', auth.device.merchant_id)
      .maybeSingle();

    if (merchantError || !merchant?.auth_user_id) {
      console.error('[NativeSmsGateway] Could not resolve merchant account for test SMS:', merchantError?.message);
      return NextResponse.json({ error: 'تعذر الوصول إلى رقم الهاتف المسجل في حساب المتجر.' }, { status: 503 });
    }

    const { data: userData, error: userError } = await auth.supabase.auth.admin.getUserById(merchant.auth_user_id);
    if (userError || !userData?.user) {
      console.error('[NativeSmsGateway] Could not load registered merchant phone:', userError?.message);
      return NextResponse.json({ error: 'تعذر قراءة رقم الهاتف المسجل في الحساب.' }, { status: 503 });
    }

    const phone = normalizeAlgerianMobileNumber(userData.user.user_metadata?.merchant_phone);
    if (!phone) {
      return NextResponse.json({
        error: 'لم يتم العثور على رقم هاتف صالح في حسابك. افتح صفحة ربط الهاتف في تاجر تراك وأضف رقمك ثم أعد الاختبار.',
      }, { status: 409 });
    }

    return NextResponse.json({
      phone,
      message: 'تاجر تراك: تم إعداد إرسال الرسائل بنجاح.',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Registered-phone test destination failed:', error?.message || error);
    return NextResponse.json({ error: 'تعذر تجهيز رسالة الاختبار الآن.' }, { status: 500 });
  }
}
