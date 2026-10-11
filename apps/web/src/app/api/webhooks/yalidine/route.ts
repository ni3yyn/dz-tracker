import { NextResponse } from 'next/server';
import { TrackingOrchestrator, YalidineAdapter } from '@saas/orchestrator';
import { getSupabaseAdminClient } from '@saas/database';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get('key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing ?key= parameter in webhook URL' },
        { status: 401, headers: corsHeaders }
      );
    }

    const supabase = getSupabaseAdminClient();
    const orchestrator = new TrackingOrchestrator();

    // 1. التحقق من التاجر صاحب المفتاح
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, store_name')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (merchantError || !merchant) {
      return NextResponse.json(
        { error: 'Invalid API Key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. قراءة بيانات الـ Webhook القادمة من ياليدين
    const payload = await req.json();

    // 3. تحويل بيانات ياليدين عبر الـ Adapter الذكي
    const normalizedEvent = YalidineAdapter.normalize(merchant.id, payload);

    // 4. معالجة الحدث وتحديث الخط الزمني للعميل
    const result = await orchestrator.processEvent(normalizedEvent);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        order: normalizedEvent.externalOrderId,
        status: normalizedEvent.statusRaw,
        tracking_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/t/${result.trackingUuid}`,
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[Yalidine Webhook Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}