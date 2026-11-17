import { NextResponse } from 'next/server';
import { authenticateNativeSmsManager } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const STATUS_FILTERS: Record<string, string[]> = {
  pending: ['pending', 'retry', 'processing'],
  submitted: ['submitted'],
  failed: ['failed', 'dead_letter', 'expired', 'skipped'],
  unknown: ['unknown'],
};
const DELIVERY_STATUS_FILTERS: Record<string, string> = {
  delivered: 'delivered',
  awaiting_delivery: 'pending',
  delivery_failed: 'failed',
  delivery_unknown: 'unknown',
};

export async function GET(request: Request) {
  const auth = await authenticateNativeSmsManager(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const rawOffset = Number(url.searchParams.get('offset') || 0);
  const offset = Number.isSafeInteger(rawOffset)
    ? Math.max(0, Math.min(100_000, rawOffset))
    : 0;
  const filter = (url.searchParams.get('status') || 'all').trim().toLowerCase();
  const rawSearch = (url.searchParams.get('q') || '').trim().slice(0, 120);
  // Keep PostgREST's filter grammar out of user input while allowing Arabic and
  // Latin names, Algerian phone numbers, plus signs and spaces.
  const search = rawSearch
    .replace(/[^a-zA-Z0-9\\u0600-\\u06FF\\s+\\-]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const deviceId = (url.searchParams.get('deviceId') || '').trim();

  if (deviceId && !/^[A-Za-z0-9_-]{8,100}$/.test(deviceId)) {
    return NextResponse.json({ error: 'جهاز الإرسال المحدد غير صالح.' }, { status: 400 });
  }

  if (
    filter !== 'all' &&
    !Object.prototype.hasOwnProperty.call(STATUS_FILTERS, filter) &&
    !Object.prototype.hasOwnProperty.call(DELIVERY_STATUS_FILTERS, filter)
  ) {
    return NextResponse.json({ error: 'مرشح سجل الرسائل غير صالح.' }, { status: 400 });
  }

  try {
    let query = auth.supabase
      .from('sms_tracking_outbox')
      .select(
        'id, order_id, status, result_code, attempt_count, created_at, updated_at, submitted_at, last_error, last_device_id, recipient_operator, dispatch_started_at, delivery_status, delivered_at, delivery_reported_at, delivery_status_code, delivery_error, orders!sms_tracking_outbox_order_id_fkey!inner(customer_name, customer_phone, external_order_id)',
      )
      .eq('merchant_id', auth.manager.merchant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE);

    if (Object.prototype.hasOwnProperty.call(DELIVERY_STATUS_FILTERS, filter)) {
      query = query.eq('delivery_status', DELIVERY_STATUS_FILTERS[filter]);
    } else if (filter !== 'all') {
      query = query.in('status', STATUS_FILTERS[filter]);
    }
    if (deviceId) {
      query = query.eq('last_device_id', deviceId);
    }
    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`,
        { referencedTable: 'orders' },
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[NativeSmsGateway] Manager SMS log query failed:', error.message);
      return NextResponse.json({ error: 'تعذر تحميل سجل الرسائل حالياً.' }, { status: 503 });
    }

    const rows = (data || []).slice(0, PAGE_SIZE) as any[];
    const jobIds = rows.map((row) => row.id).filter(Boolean);
    const deviceIds = [...new Set(rows.map((row) => row.last_device_id).filter(Boolean))];

    const [attemptResult, deviceResult] = await Promise.all([
      jobIds.length
        ? auth.supabase
            .from('sms_tracking_attempts')
            .select('job_id, attempt_number, outcome, error_message, created_at')
            .in('job_id', jobIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      deviceIds.length
        ? auth.supabase
            .from('sms_gateway_devices')
            .select('device_id, display_name, operator_code')
            .eq('merchant_id', auth.manager.merchant_id)
            .in('device_id', deviceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (attemptResult.error) {
      console.error('[NativeSmsGateway] Manager SMS log attempt lookup failed:', attemptResult.error.message);
    }
    if (deviceResult.error) {
      console.error('[NativeSmsGateway] Manager SMS log device lookup failed:', deviceResult.error.message);
    }

    const latestAttemptByJob = new Map<string, any>();
    for (const attempt of attemptResult.data || []) {
      if (!latestAttemptByJob.has(attempt.job_id)) latestAttemptByJob.set(attempt.job_id, attempt);
    }

    const deviceById = new Map<string, any>(
      (deviceResult.data || []).map((device: any) => [device.device_id, device]),
    );

    const messages = rows.map((row) => {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      const attempt = latestAttemptByJob.get(row.id);
      const device = row.last_device_id ? deviceById.get(row.last_device_id) : null;
      const status = String(row.status || 'unknown');
      const deliveryStatus = String(row.delivery_status || 'not_requested');
      const eventAt =
        row.delivered_at ||
        row.delivery_reported_at ||
        row.submitted_at ||
        attempt?.created_at ||
        (status === 'processing' ? row.dispatch_started_at : null) ||
        row.updated_at ||
        row.created_at;

      const eventLabel = row.delivered_at
        ? 'وقت استلام تقرير التسليم'
        : row.delivery_reported_at
          ? 'وقت استلام تقرير الشبكة'
          : row.submitted_at
            ? 'وقت الإرسال'
            : attempt?.created_at
          ? 'وقت آخر محاولة'
          : status === 'processing'
            ? 'وقت بدء الإرسال'
            : 'وقت تسجيل الطلب';

      return {
        id: row.id,
        orderReference: String(order?.external_order_id || ''),
        customerName: String(order?.customer_name || '').slice(0, 120),
        customerPhone: String(order?.customer_phone || '').slice(0, 48),
        messageType: 'tracking_link',
        status,
        resultCode: row.result_code || null,
        deliveryStatus,
        deliveredAt: row.delivered_at || null,
        deliveryReportedAt: row.delivery_reported_at || null,
        deliveryStatusCode: row.delivery_status_code ?? null,
        deliveryError: row.delivery_error || null,
        eventAt: eventAt || null,
        eventLabel,
        queuedAt: row.created_at,
        attemptCount: Number(row.attempt_count) || 0,
        senderDeviceName: device?.display_name || null,
        senderDeviceId: row.last_device_id || null,
        operatorCode: device?.operator_code || row.recipient_operator || null,
        errorMessage: row.last_error || attempt?.error_message || null,
      };
    });

    return NextResponse.json(
      {
        messages,
        hasMore: (data || []).length > PAGE_SIZE,
        nextOffset: offset + rows.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (error: any) {
    console.error('[NativeSmsGateway] Manager SMS log endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'تعذر تحميل سجل الرسائل حالياً.' }, { status: 500 });
  }
}
