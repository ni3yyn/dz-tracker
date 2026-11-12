import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeviceReportStatus = 'submitted' | 'failed' | 'unknown';

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const status = body?.status as DeviceReportStatus;
  const errorMessage = typeof body?.error === 'string' ? body.error.slice(0, 500) : null;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId) ||
      !['submitted', 'failed', 'unknown'].includes(status)) {
    return NextResponse.json({ error: 'Invalid SMS result.' }, { status: 400 });
  }

  const auth = await authenticateNativeSmsDevice(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { supabase, device } = auth;
    const { data: job, error: readError } = await supabase
      .from('sms_tracking_outbox')
      .select('id, merchant_id, status, attempt_count, max_attempts, locked_by, last_device_id, last_error')
      .eq('id', jobId)
      .eq('merchant_id', device.merchant_id)
      .maybeSingle();

    if (readError || !job) {
      return NextResponse.json({ error: 'SMS job not found for this phone.' }, { status: 404 });
    }

    if (job.status === 'submitted') {
      return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'submitted' });
    }
    if (status === 'unknown' && job.status === 'unknown' && job.last_device_id === device.device_id) {
      return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'unknown' });
    }
    if (!['processing', 'unknown'].includes(job.status) ||
        job.last_device_id !== device.device_id ||
        (job.status === 'processing' && job.locked_by !== device.device_id)) {
      return NextResponse.json({ error: 'This SMS job is no longer assigned to this phone.' }, { status: 409 });
    }

    const now = new Date();
    let updates: Record<string, any>;
    if (status === 'submitted') {
      updates = {
        status: 'submitted',
        result_code: 'android_sms_manager_accepted',
        submitted_at: now.toISOString(),
        last_error: null,
      };
    } else if (status === 'unknown') {
      updates = {
        status: 'unknown',
        result_code: 'device_send_result_unknown',
        last_error: errorMessage || 'The phone could not determine whether Android submitted the SMS. It was not automatically resent.',
      };
    } else {
      const terminal = Number(job.attempt_count) >= Number(job.max_attempts);
      const retrySeconds = Math.min(15 * 60, Math.max(60, Number(job.attempt_count) * 60));
      updates = {
        status: terminal ? 'dead_letter' : 'retry',
        available_at: terminal ? now.toISOString() : new Date(now.getTime() + retrySeconds * 1000).toISOString(),
        result_code: terminal ? 'device_send_failed_max_attempts' : 'device_send_failed_retry_scheduled',
        last_error: errorMessage || 'Android SMS command returned a failure.',
      };
    }

    const { data: updatedJob, error: updateError } = await supabase
      .from('sms_tracking_outbox')
      .update({
        ...updates,
        locked_by: null,
        locked_at: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', jobId)
      .eq('merchant_id', device.merchant_id)
      .eq('last_device_id', device.device_id)
      .in('status', ['processing', 'unknown'])
      .select('id')
      .maybeSingle();

    if (updateError || !updatedJob) {
      console.error('[NativeSmsGateway] Could not save the SMS result:', updateError?.message || 'Job state changed concurrently.');
      return NextResponse.json({ error: 'Could not save the SMS result.' }, { status: 409 });
    }

    await supabase.from('sms_tracking_attempts').upsert({
      job_id: jobId,
      attempt_number: job.attempt_count,
      outcome: status,
      error_message: errorMessage,
    }, { onConflict: 'job_id,attempt_number,outcome', ignoreDuplicates: true });

    const { error: deviceUpdateError } = await supabase
      .from('sms_gateway_devices')
      .update({
        last_result_at: now.toISOString(),
        last_status: status,
        last_error: errorMessage,
        updated_at: now.toISOString(),
      })
      .eq('device_id', device.device_id)
      .eq('merchant_id', device.merchant_id);

    if (deviceUpdateError) {
      console.error('[NativeSmsGateway] Could not update device telemetry:', deviceUpdateError.message);
    }

    return NextResponse.json({ success: true, resultingStatus: updates.status });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Report endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not save the SMS result.' }, { status: 500 });
  }
}
