import { NextResponse } from 'next/server';
import { TrackingOrchestrator } from '@saas/orchestrator';
import { getSupabaseAdminClient } from '@saas/database';

export const dynamic = 'force-dynamic'; // 👈 يمنع فحص السيرفر أثناء البناء

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
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing x-api-key header' },
        { status: 401, headers: corsHeaders }
      );
    }

    // استدعاء العملاء فقط عند وصول طلب فعلي
    const supabase = getSupabaseAdminClient();
    const orchestrator = new TrackingOrchestrator();

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

    const body = await req.json();

    const result = await orchestrator.processEvent({
      merchantId: merchant.id,
      externalOrderId: body.order_id || body.id,
      customerName: body.customer_name,
      customerPhone: body.customer_phone,
      statusRaw: body.status,
      description: body.description,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        tracking_uuid: result.trackingUuid,
        tracking_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/t/${result.trackingUuid}`,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}