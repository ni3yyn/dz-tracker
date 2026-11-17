import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const claimToken = typeof body?.claimToken === 'string' ? body.claimToken : '';
  const deliveryReportRequested = body?.deliveryReportRequested === true;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimToken)) {
    return NextResponse.json({ error: 'Invalid SMS dispatch claim.' }, { status: 400 });
  }

  const auth = await authenticateNativeSmsDevice(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!auth.device.enabled) {
    return NextResponse.json({ error: 'Sender line is paused.' }, { status: 409 });
  }

  try {
    const { data, error } = await auth.supabase.rpc('begin_native_sms_job_dispatch', {
      p_job_id: jobId,
      p_merchant_id: auth.device.merchant_id,
      p_device_id: auth.device.device_id,
      p_claim_token: claimToken,
    });

    if (error) {
      console.error('[NativeSmsGateway] Dispatch handshake failed:', error.message);
      return NextResponse.json({ error: 'Could not authorize SMS dispatch.' }, { status: 503 });
    }
    if (data !== true) {
      return NextResponse.json({
        error: 'This SMS claim expired or is no longer assigned to this phone.',
      }, { status: 409 });
    }

    if (deliveryReportRequested) {
      // Persist this before allowing the app to call SmsManager. A very fast
      // carrier callback can then never race ahead of the pending state.
      const { data: deliveryJob, error: deliveryInitError } = await auth.supabase
        .from('sms_tracking_outbox')
        .update({
          delivery_status: 'pending',
          delivered_at: null,
          delivery_reported_at: null,
          delivery_status_code: null,
          delivery_error: null,
        })
        .eq('id', jobId)
        .eq('merchant_id', auth.device.merchant_id)
        .eq('last_device_id', auth.device.device_id)
        .eq('claim_token', claimToken)
        .eq('status', 'processing')
        .select('id')
        .maybeSingle();

      if (deliveryInitError || !deliveryJob) {
        console.error('[NativeSmsGateway] Could not initialize SMS delivery tracking:', deliveryInitError?.message || 'Claim changed.');
        return NextResponse.json({ error: 'Could not initialize SMS delivery tracking.' }, { status: 503 });
      }
    }

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Dispatch endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not authorize SMS dispatch.' }, { status: 500 });
  }
}
