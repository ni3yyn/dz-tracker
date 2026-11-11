import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { EXCHANGE_REQUEST_REASONS, isDeliveredStatus } from '../../../../../lib/exchange';

interface RouteProps { params: Promise<{ uuid: string }> }

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { uuid } = await params;
    if (!uuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
      return NextResponse.json({ error: 'رابط التتبع غير صالح.' }, { status: 400 });
    }
    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'تعذر قراءة بيانات الطلب.' }, { status: 400 }); }
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    if (!EXCHANGE_REQUEST_REASONS.some((item) => item.value === reason)) return NextResponse.json({ error: 'يرجى اختيار سبب صحيح للاستبدال.' }, { status: 400 });
    if (note.length > 500) return NextResponse.json({ error: 'يجب ألا تتجاوز التفاصيل 500 حرف.' }, { status: 400 });

    const supabase = getSupabaseAdminClient();
    const { data: order, error: orderError } = await supabase.from('orders').select('id, merchant_id, current_status').eq('tracking_uuid', uuid).maybeSingle();
    if (orderError || !order) return NextResponse.json({ error: 'لم نتمكن من العثور على الطلب.' }, { status: 404 });
    if (!isDeliveredStatus(order.current_status)) return NextResponse.json({ error: 'يمكن طلب الاستبدال بعد استلام الطلب فقط.' }, { status: 409 });
    const { data: setting, error: settingError } = await supabase.from('status_mappings').select('display_status').eq('merchant_id', order.merchant_id).eq('source_status', '__feature_exchange_requests_enabled__').maybeSingle();
    if (settingError) return NextResponse.json({ error: 'تعذر التحقق من إعدادات المتجر حالياً.' }, { status: 503 });
    if (setting?.display_status !== 'true') return NextResponse.json({ error: 'طلبات الاستبدال غير متاحة لدى هذا المتجر.' }, { status: 403 });

    const { data: active, error: activeError } = await (supabase as any).from('order_exchange_requests').select('id').eq('order_id', order.id).in('status', ['pending', 'awaiting_shipment', 'replacement_in_transit']).limit(1).maybeSingle();
    if (activeError) {
      console.error('[ExchangeRequests] Active request lookup failed:', activeError.message);
      return NextResponse.json({ error: 'خدمة الاستبدال غير جاهزة حالياً. حاول لاحقاً.' }, { status: 503 });
    }
    if (active) return NextResponse.json({ error: 'يوجد طلب استبدال قيد المتابعة لهذا الطلب بالفعل.' }, { status: 409 });

    const { data: created, error: insertError } = await (supabase as any).from('order_exchange_requests').insert({ merchant_id: order.merchant_id, order_id: order.id, reason, customer_note: note || null }).select('id, status, reason, customer_note, merchant_response, created_at').single();
    if (insertError || !created) {
      if (insertError?.code === '23505') return NextResponse.json({ error: 'تم تسجيل طلب استبدال لهذا الطلب بالفعل.' }, { status: 409 });
      console.error('[ExchangeRequests] Could not create request:', insertError?.message);
      return NextResponse.json({ error: 'تعذر إرسال طلب الاستبدال. حاول مجدداً.' }, { status: 503 });
    }
    return NextResponse.json({ success: true, request: created }, { status: 201 });
  } catch (error) {
    console.error('[ExchangeRequests] Request creation failed:', error);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع أثناء إرسال طلب الاستبدال.' }, { status: 500 });
  }
}
