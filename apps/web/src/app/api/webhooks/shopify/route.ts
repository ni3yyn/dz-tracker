import { NextResponse } from 'next/server';
import { TrackingOrchestrator, ShopifyAdapter } from '@saas/orchestrator';
import { getSupabaseAdminClient } from '@saas/database';

const orchestrator = new TrackingOrchestrator();
const supabase = getSupabaseAdminClient();

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get('key');

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing ?key= parameter in webhook URL' }, { status: 401 });
    }

    // 1. التحقق من التاجر
    const { data: merchant } = await supabase
      .from('merchants')
      .select('id, store_name')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (!merchant) {
      return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
    }

    // 2. قراءة بيانات طلب شوبيفاي
    const payload = await req.json();

    // 3. تحويل بيانات شوبيفاي إلى التنسيق الموحد
    const normalizedEvent = ShopifyAdapter.normalize(merchant.id, payload);

    // 4. معالجة الحدث عبر الـ Orchestrator وتحديث خط الزمن
    const result = await orchestrator.processEvent(normalizedEvent);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      order: normalizedEvent.externalOrderId,
      tracking_uuid: result.trackingUuid,
      tracking_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/t/${result.trackingUuid}`,
    });

  } catch (error: any) {
    console.error('[Shopify Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}