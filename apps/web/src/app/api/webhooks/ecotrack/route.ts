import { NextResponse } from 'next/server';
import { TrackingOrchestrator, EcoTrackAdapter } from '@saas/orchestrator';
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

    // 1. التحقق من التاجر
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

    // 2. قراءة بيانات الـ Webhook
    const payload = await req.json();

    // 3. تحويل بيانات إيكوتراك عبر الـ Adapter
    const normalizedEvent = EcoTrackAdapter.normalize(merchant.id, payload);

    // 4. معالجة وتحديث حالة الطلب
    const result = await orchestrator.processEvent(normalizedEvent);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500, headers: corsHeaders }
      );
    }

    // كشف الرابط تلقائياً ليعمل على Vercel أو Localhost بدون مشاكل
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const fullTrackingUrl = `${protocol}://${host}/t/${result.trackingUuid}`;

    return NextResponse.json(
      {
        success: true,
        order: normalizedEvent.externalOrderId,
        status: normalizedEvent.statusRaw,
        carrier: normalizedEvent.carrierName,
        tracking_url: fullTrackingUrl,
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[EcoTrack Webhook Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}