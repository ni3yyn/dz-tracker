import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { isCurrentUserAdmin } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SMS_STATUSES = ['pending', 'processing', 'retry', 'submitted', 'failed', 'unknown', 'skipped', 'dead_letter'];

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient() as any;
    const [
      jobsResult,
      attemptsResult,
      controlResult,
      deviceResult,
      nativeDevicesResult,
      eventsResult,
      ...countResults
    ] = await Promise.all([
      supabase
        .from('sms_tracking_outbox')
        .select('id, order_id, merchant_id, status, attempt_count, max_attempts, available_at, locked_by, locked_at, lease_expires_at, last_error, result_code, created_at, updated_at, submitted_at, orders(external_order_id, customer_name, customer_phone), merchants(store_name)')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase
        .from('sms_tracking_attempts')
        .select('id, job_id, attempt_number, outcome, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('sms_gateway_control')
        .select('id, enabled, updated_at')
        .eq('id', 'primary')
        .maybeSingle(),
      supabase
        .from('sms_gateway_devices')
        .select('device_id, display_name, merchant_id, enabled, platform, app_version, device_model, revoked_at, last_seen_at, last_claim_at, last_result_at, last_status, last_error, merchants(store_name)')
        .not('merchant_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('sms_tracking_admin_events')
        .from('sms_tracking_admin_events')
        .select('id, job_id, action, previous_status, new_status, details, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      ...SMS_STATUSES.map((status) =>
        supabase
          .from('sms_tracking_outbox')
          .select('id', { count: 'exact', head: true })
          .eq('status', status)
      ),
    ]);

    const firstError = [
      jobsResult.error,
      attemptsResult.error,
      controlResult.error,
      deviceResult.error,
      nativeDevicesResult.error,
      eventsResult.error,
      ...countResults.map((result: any) => result.error),
    ].find(Boolean);

    if (firstError || !controlResult.data || !deviceResult.data) {
      console.error('[SmsGatewayAdmin] Snapshot query failed:', firstError?.message || 'Missing gateway configuration.');
      return NextResponse.json({ error: 'SMS manager data is not ready. Apply the SMS admin migration.' }, { status: 503 });
    }

    return NextResponse.json({
      ready: true,
      control: {
        enabled: Boolean(controlResult.data.enabled),
        updated_at: controlResult.data.updated_at || null,
      },
      device: deviceResult.data,
      nativeDevices: nativeDevicesResult.data || [],
      jobs: jobsResult.data || [],
      attempts: attemptsResult.data || [],
      events: eventsResult.data || [],
      counts: Object.fromEntries(
        SMS_STATUSES.map((status, index) => [status, countResults[index]?.count || 0])
      ),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    console.error('[SmsGatewayAdmin] Snapshot endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not load SMS manager data.' }, { status: 500 });
  }
}
