import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

interface RouteProps {
  params: Promise<{ uuid: string }>;
}

export async function GET(req: Request, { params }: RouteProps) {
  try {
    // دعم Next.js 16 (فك الـ Promise)
    const { uuid } = await params;

    if (!uuid) {
      return NextResponse.json({ error: 'Missing tracking UUID' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // 1. جلب بيانات الطلب والمتجر
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, external_order_id, customer_name, current_status, carrier_name, carrier_tracking_number, created_at, merchants(store_name)')
      .eq('tracking_uuid', uuid)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found or invalid UUID' }, { status: 404 });
    }

    // 2. جلب السجل الزمني
    const { data: history } = await supabase
      .from('order_history')
      .select('id, status_title, description, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false });

    const storeName = Array.isArray(order.merchants)
      ? order.merchants[0]?.store_name
      : (order.merchants as any)?.store_name || 'Store';

    // 3. إرجاع كائن JSON موحد ومعياري للمطور
    return NextResponse.json({
      success: true,
      data: {
        orderId: order.external_order_id,
        customerName: order.customer_name,
        storeName: storeName,
        currentStatus: order.current_status,
        carrier: {
          name: order.carrier_name || null,
          trackingNumber: order.carrier_tracking_number || null,
        },
        createdAt: order.created_at,
        timeline: (history || []).map((h) => ({
          id: h.id,
          status: h.status_title,
          description: h.description,
          timestamp: h.created_at,
        })),
      },
    });

  } catch (error: any) {
    console.error('[SDK API Track Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}