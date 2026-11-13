import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeAlgerianMobilePhone(input: string | null): string | null {
  if (!input) return null;
  let value = input.trim().replace(/[\\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('213')) value = `+${value}`;
  if (/^0[5-7]\\d{8}$/.test(value)) value = `+213${value.slice(1)}`;
  return /^\\+213[5-7]\\d{8}$/.test(value) ? value : null;
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
    const { supabase, device } = auth;
    const { data: brandRow, error: brandError } = await supabase
      .from('status_mappings')
      .select('display_status')
      .eq('merchant_id', device.merchant_id)
      .eq('source_status', '__brand_settings_json__')
      .maybeSingle();

    if (brandError) {
      console.error('[NativeSmsGateway] Could not load merchant test destination:', brandError.message);
      return NextResponse.json({ error: 'تعذر قراءة رقم الاختبار من إعدادات المتجر.' }, { status: 503 });
    }

    let brandSettings: Record<string, unknown> = {};
    if (typeof brandRow?.display_status === 'string' && brandRow.display_status.trim()) {
      try {
        const parsed = JSON.parse(brandRow.display_status);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          brandSettings = parsed as Record<string, unknown>;
        }
      } catch {
        return NextResponse.json({ error: 'إعدادات رقم المتجر غير صالحة. احفظ رقم الدعم مجدداً من لوحة التحكم.' }, { status: 503 });
      }
    }

    const savedPhone = typeof brandSettings.supportPhone === 'string'
      ? brandSettings.supportPhone
      : null;
    const phone = normalizeAlgerianMobilePhone(savedPhone);

    if (!phone) {
      return NextResponse.json({
        error: 'أضف رقم هاتفك في إعدادات العلامة التجارية ← تجربة الزبون والدعم، ضمن «رقم واتساب خدمة العملاء»، ثم احفظ التغييرات لتتمكن من إرسال رسالة الاختبار.',
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
    console.error('[NativeSmsGateway] Test destination lookup failed:', error?.message || error);
    return NextResponse.json({ error: 'تعذر تجهيز رسالة الاختبار الآن.' }, { status: 500 });
  }
}
