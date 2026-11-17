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

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Dispatch endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not authorize SMS dispatch.' }, { status: 500 });
  }
}
