import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeviceReportStatus = 'submitted' | 'failed' | 'unknown' | 'not_sent';

function retryDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(4, attemptCount - 1));
  return Math.min(30 * 60_000, 2 * 60_000 * (2 ** exponent));
}

function expiredResultCode(status: string, retryable: boolean, failureCode: string | null): string | null {
  if (status === 'expired') return 'order_sms_window_expired_after_send_failure';
  return failureCode || (retryable
    ? 'device_send_failed_retry_scheduled'
    : 'device_send_permanent_failure');
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const status = body?.status as DeviceReportStatus;
  const claimToken = typeof body?.claimToken === 'string' ? body.claimToken : null;
  const retryable = body?.retryable === true;
  const errorMessage = typeof body?.error === 'string' ? body.error.slice(0, 500) : null;
  const failureCode = typeof body?.failureCode === 'string'
    ? body.failureCode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
    : null;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId) ||
      !['submitted', 'failed', 'unknown', 'not_sent'].includes(status)) {
    return NextResponse.json({ error: 'Invalid SMS result.' }, { status: 400 });
  }
  if (claimToken && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimToken)) {
    return NextResponse.json({ error: 'Invalid SMS claim token.' }, { status: 400 });
  }

  const auth = await authenticateNativeSmsDevice(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { supabase, device } = auth;
    const { data: job, error: readError } = await supabase
      .from('sms_tracking_outbox')
      .select('id, merchant_id, status, result_code, attempt_count, locked_by, last_device_id, last_error, claim_token, last_claim_token, dispatch_started_at, expires_at')
      .eq('id', jobId)
      .eq('merchant_id', device.merchant_id)
      .maybeSingle();

    if (readError || !job) {
      return NextResponse.json({ error: 'SMS job not found for this phone.' }, { status: 404 });
    }

    const sameDevice = job.last_device_id === device.device_id;
    const sameClaim = claimToken
      ? job.claim_token === claimToken || job.last_claim_token === claimToken
      : job.status === 'processing' && job.locked_by === device.device_id ||
        job.status === 'unknown' && job.last_claim_token != null;

    // The server may have saved a result and lost its HTTP response. Confirm
    // that same claim idempotently before requiring the active lease token.
    if (sameDevice && sameClaim) {
      if (status === 'submitted' && job.status === 'submitted') {
        return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'submitted' });
      }
      if (status === 'unknown' && job.status === 'unknown') {
        return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'unknown' });
      }
      if (status === 'not_sent' && job.status === 'retry' &&
          [
            'sms_not_dispatched',
            'claim_lease_expired_before_dispatch',
            'sender_line_disabled_before_dispatch',
            'sender_line_revoked_before_dispatch',
          ].includes(job.result_code || '')) {
        return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'retry' });
      }
      if (status === 'not_sent' && job.status === 'pending' &&
          job.result_code === 'recipient_phone_corrected') {
        return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'pending' });
      }
      if (status === 'not_sent' && job.status === 'skipped' &&
          ['unsupported_recipient_network', 'invalid_algerian_mobile_number', 'recipient_carrier_mismatch'].includes(job.result_code || '')) {
        return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'skipped' });
      }
      if (status === 'not_sent' && job.status === 'expired' &&
          ['order_sms_window_expired_before_dispatch', 'order_sms_window_expired'].includes(job.result_code || '')) {
        return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: 'expired' });
      }
      if (status === 'failed' && ['retry', 'failed', 'expired'].includes(job.status)) {
        const expectedResultCode = expiredResultCode(job.status, retryable, failureCode);
        const alreadyExpired = job.status === 'expired' &&
          (job.result_code || '').startsWith('order_sms_window_expired');
        if (
          alreadyExpired ||
          (expectedResultCode && job.result_code === expectedResultCode) ||
          ['device_send_failed_retry_scheduled', 'device_send_permanent_failure', 'order_sms_window_expired'].includes(job.result_code || '')
        ) {
          return NextResponse.json({ success: true, alreadyRecorded: true, resultingStatus: job.status });
        }
      }
    }

    const claimMatches = claimToken
      ? (job.status === 'processing' || job.status === 'unknown') &&
        job.claim_token === claimToken
      : job.status === 'processing' && job.locked_by === device.device_id ||
        job.status === 'unknown' && job.last_claim_token != null;
    if (!sameDevice || !claimMatches) {
      // Older installed TTP versions do not send a claim token. They are
      // accepted only while their exact device still owns the active lease.
      return NextResponse.json({ error: 'This SMS claim is no longer assigned to this phone.' }, { status: 409 });
    }

    if (!['processing', 'unknown'].includes(job.status)) {
      return NextResponse.json({ error: 'This SMS job has already moved to another state.' }, { status: 409 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expired = !job.expires_at || new Date(job.expires_at).getTime() <= now.getTime();
    let updates: Record<string, any>;

    if (status === 'submitted') {
      // Android accepted the SMS. Keep that result even if the 72-hour
      // enqueue window passed while the device was reconnecting.
      updates = {
        status: 'submitted',
        result_code: 'android_sms_manager_accepted',
        submitted_at: nowIso,
        last_error: null,
      };
    } else if (status === 'unknown') {
      updates = {
        status: 'unknown',
        result_code: failureCode || 'device_send_result_unknown',
        last_error: errorMessage || 'The phone could not determine whether Android submitted the SMS. It was not automatically resent.',
      };
    } else if (status === 'not_sent') {
      updates = expired
        ? {
            status: 'expired',
            result_code: 'order_sms_window_expired_before_dispatch',
            last_error: 'The phone confirmed that Android was not called, but the 72-hour order window has elapsed.',
          }
        : {
            status: 'retry',
            available_at: new Date(now.getTime() + 15_000).toISOString(),
            attempt_count: job.dispatch_started_at
              ? Math.max(0, Number(job.attempt_count) - 1)
              : Number(job.attempt_count) || 0,
            result_code: 'sms_not_dispatched',
            last_error: errorMessage || 'The phone recovered a claimed job before calling Android. It was safely returned to the queue.',
          };
    } else if (expired) {
      updates = {
        status: 'expired',
        result_code: 'order_sms_window_expired_after_send_failure',
        last_error: errorMessage || 'Android reported a send failure after the 72-hour order window elapsed.',
      };
    } else if (retryable) {
      const delayMs = retryDelayMs(Math.max(1, Number(job.attempt_count) || 1));
      updates = {
        status: 'retry',
        available_at: new Date(now.getTime() + delayMs).toISOString(),
        result_code: failureCode || 'device_send_failed_retry_scheduled',
        last_error: errorMessage || 'Android reported a temporary SMS submission failure. The job remains queued for another attempt.',
      };
    } else {
      updates = {
        status: 'failed',
        result_code: failureCode || 'device_send_permanent_failure',
        last_error: errorMessage || 'Android reported a non-retryable SMS submission failure. Correct the cause before a manual retry.',
      };
    }

    // No carrier delivery report is expected when Android confirms that the
    // message was not submitted. Unknown submission outcomes keep tracking
    // open because a late positive delivery report is still possible.
    if (status === 'failed' || status === 'not_sent') {
      Object.assign(updates, {
        delivery_status: 'not_requested',
        delivered_at: null,
        delivery_reported_at: null,
        delivery_status_code: null,
        delivery_error: null,
      });
    }

    const clearsClaim = ['retry', 'expired'].includes(updates.status);
    const { data: updatedJob, error: updateError } = await supabase
      .from('sms_tracking_outbox')
      .update({
        ...updates,
        locked_by: null,
        locked_at: null,
        lease_expires_at: null,
        ...(clearsClaim ? { claim_token: null, dispatch_started_at: null } : {}),
        updated_at: nowIso,
      })
      .eq('id', jobId)
      .eq('merchant_id', device.merchant_id)
      .eq('last_device_id', device.device_id)
      .eq('claim_token', job.claim_token)
      .eq('last_claim_token', job.last_claim_token)
      .in('status', ['processing', 'unknown'])
      .select('id')
      .maybeSingle();

    if (updateError || !updatedJob) {
      console.error('[NativeSmsGateway] Could not save the SMS result:', updateError?.message || 'Job state changed concurrently.');
      return NextResponse.json({ error: 'Could not save the SMS result.' }, { status: 409 });
    }

    const attemptOutcome = status === 'not_sent' ? 'not_sent' : status;
    const { error: attemptError } = await supabase.from('sms_tracking_attempts').upsert({
      job_id: jobId,
      attempt_number: Math.max(0, Number(job.attempt_count) || 0),
      outcome: attemptOutcome,
      error_message: errorMessage,
    }, { onConflict: 'job_id,attempt_number,outcome', ignoreDuplicates: true });
    if (attemptError) {
      console.error('[NativeSmsGateway] Could not record SMS attempt telemetry:', attemptError.message);
    }

    const { error: deviceUpdateError } = await supabase
      .from('sms_gateway_devices')
      .update({
        last_result_at: nowIso,
        last_status: status,
        last_error: errorMessage,
        updated_at: nowIso,
      })
      .eq('device_id', device.device_id)
      .eq('merchant_id', device.merchant_id);

    if (deviceUpdateError) {
      console.error('[NativeSmsGateway] Could not update device telemetry:', deviceUpdateError.message);
    }

    return NextResponse.json({
      success: true,
      resultingStatus: updates.status,
      retryAfterSeconds: updates.status === 'retry' && updates.available_at
        ? Math.max(0, Math.ceil((new Date(updates.available_at).getTime() - now.getTime()) / 1000))
        : null,
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Report endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not save the SMS result.' }, { status: 500 });
  }
}
