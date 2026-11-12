import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { authorizeSmsGatewayRequest, SMS_GATEWAY_WORKER_ID } from '../../../../../lib/sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeAlgerianMobilePhone(input: string | null): string | null {
  if (!input) return null;
  let value = input.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('213')) value = `+${value}`;
  if (/^0[5-7]\d{8}$/.test(value)) value = `+213${value.slice(1)}`;
  return /^\+213[5-7]\d{8}$/.test(value) ? value : null;
}

async function skipJob(supabase: any, jobId: string, reason: string): Promise<void> {
  await supabase
    .from('sms_tracking_outbox')
    .update({
      status: 'skipped',
      result_code: reason,
      last_error: reason,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .eq('locked_by', SMS_GATEWAY_WORKER_ID);
}

export async function POST(request: Request) {
  const auth = authorizeSmsGatewayRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === 'not_configured' ? 'SMS gateway is not configured.' : 'Unauthorized.' },
      { status: auth.reason === 'not_configured' ? 503 : 401 }
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any).rpc('claim_next_sms_tracking_job', {
      p_worker_id: SMS_GATEWAY_WORKER_ID,
      p_lease_seconds: 180,
    });

    if (error) {
      console.error('[SmsGateway] Could not claim an SMS job:', error.message);
      return NextResponse.json({ error: 'Could not claim an SMS job.' }, { status: 503 });
    }

    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });

    const { data: order, error: orderError } = await (supabase as any)
      .from('orders')
      .select('id, merchant_id, customer_phone, tracking_uuid')
      .eq('id', job.order_id)
      .maybeSingle();

    if (orderError || !order?.tracking_uuid) {
      await skipJob(supabase, job.id, 'order_or_tracking_link_missing');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: merchant, error: merchantError } = await (supabase as any)
      .from('merchants')
      .select('store_name, sms_tracking_enabled')
      .eq('id', order.merchant_id)
      .maybeSingle();

    if (merchantError || !merchant || merchant.sms_tracking_enabled !== true) {
      await skipJob(supabase, job.id, 'merchant_sms_disabled');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const phone = normalizeAlgerianMobilePhone(order.customer_phone);
    if (!phone) {
      await skipJob(supabase, job.id, 'invalid_algerian_mobile_number');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const baseUrl = (
      process.env.TRACKING_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://tajertrack.vercel.app'
    ).replace(/\/+$/, '');
    const trackingUrl = `${baseUrl}/t/${encodeURIComponent(order.tracking_uuid)}`;

    // GSM-7-only text keeps a normal TajerTrack URL comfortably inside one
    // 160-character SMS segment, avoiding the 70-character Unicode limit.
    const message = `TajerTrack - Suivez votre commande: ${trackingUrl}`;

    return NextResponse.json({
      job: {
        id: job.id,
        phone,
        message,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[SmsGateway] Claim endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'SMS gateway claim failed.' }, { status: 500 });
  }
}
