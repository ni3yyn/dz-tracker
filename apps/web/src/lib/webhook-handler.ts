import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import {
  TrackingOrchestrator,
  TrackingEvent,
  IdempotencyEngine,
} from '@saas/orchestrator';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
};

export interface WebhookContext {
  req: Request;
  merchant: {
    id: string;
    store_name: string;
    api_key: string;
  };
  payload: any;
  siteUrl: string;
}

export interface WebhookHandlerOptions {
  source: 'yalidine' | 'ecotrack' | 'shopify' | 'direct' | 'zrexpress' | 'procolis' | 'odoo' | 'maystro';
  transformEvent: (ctx: WebhookContext) => TrackingEvent | Promise<TrackingEvent>;
}

export function handleOptions() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export function createWebhookHandler(options: WebhookHandlerOptions) {
  const orchestrator = new TrackingOrchestrator();

  return async function POST(req: Request) {
    let fingerprint = '';

    try {
      // 1. استخراج مفتاح الـ API من الهيدرز أو من رابط الـ Webhook (مرونة شاملة: Yalidine, Guepex, Odoo, Procolis, Maystro, Shopify)
      const { searchParams } = new URL(req.url);
      const authHeader = req.headers.get('authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
      const djangoToken = authHeader?.startsWith('Token ') ? authHeader.substring(6).trim() : null;

      const apiKey =
        req.headers.get('x-api-key') ||
        req.headers.get('x-yalidine-secret') ||
        req.headers.get('x-yalidine-key') ||
        req.headers.get('x-webhook-secret') ||
        req.headers.get('x-security-token') ||
        req.headers.get('x-api-token') ||
        req.headers.get('x-api-id') ||
        req.headers.get('token') ||
        req.headers.get('key') ||
        searchParams.get('key') ||
        searchParams.get('token') ||
        searchParams.get('secret') ||
        searchParams.get('api_key') ||
        bearerToken ||
        djangoToken;

      if (!apiKey) {
        return NextResponse.json(
          {
            error: 'Missing API key. Provide "x-api-key", "x-yalidine-secret", or "?key=" parameter in webhook URL.',
          },
          { status: 401, headers: corsHeaders }
        );
      }

      // 2. التحقق من صحة التاجر وحالة اشتراكه
      const supabase = getSupabaseAdminClient();
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id, store_name, api_key, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at')
        .eq('api_key', apiKey)
        .maybeSingle();

      if (merchantError || !merchant) {
        return NextResponse.json(
          { error: 'Invalid or inactive API key.' },
          { status: 401, headers: corsHeaders }
        );
      }

      if (merchant.subscription_status === 'suspended') {
        return NextResponse.json(
          {
            error: 'Account suspended',
            code: 'ACCOUNT_SUSPENDED',
            message: 'حساب المتجر موقوف مؤقتاً، يرجى التواصل مع إدارة تاجر تراك.',
          },
          { status: 403, headers: corsHeaders }
        );
      }

      // 3. قراءة البيانات وحمايتها من الـ Malformed JSON
      let payload: any;
      try {
        const text = await req.text();
        if (!text || !text.trim()) {
          return NextResponse.json(
            { error: 'Empty webhook payload body.' },
            { status: 400, headers: corsHeaders }
          );
        }
        payload = JSON.parse(text);
      } catch (parseErr: any) {
        return NextResponse.json(
          { error: 'Malformed JSON payload.', details: parseErr?.message },
          { status: 400, headers: corsHeaders }
        );
      }

      // 4. استخراج الرابط الأساسي للموقع
      const host = req.headers.get('host') || 'localhost:3000';
      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;

      // 5. تحويل الـ Payload للحدث الموحد
      const normalizedEvent = await options.transformEvent({
        req,
        merchant,
        payload,
        siteUrl,
      });

      // 6. التحقق من تطابق الحدث وحمايته من التكرار والازدواجية (Idempotency Engine)
      fingerprint = IdempotencyEngine.generateFingerprint({
        merchantId: merchant.id,
        source: options.source,
        externalOrderId: normalizedEvent.externalOrderId,
        carrierTrackingNumber: normalizedEvent.carrierTrackingNumber,
        statusRaw: normalizedEvent.statusRaw,
        payloadSnippet: payload,
      });

      const idempotencyCheck = IdempotencyEngine.check(fingerprint);
      if (idempotencyCheck.isDuplicate) {
        const cached = idempotencyCheck.cachedResult;
        return NextResponse.json(
          {
            success: true,
            deduplicated: true,
            message: 'Webhook duplicate acknowledged (Idempotency protection active)',
            order: normalizedEvent.externalOrderId,
            status: normalizedEvent.statusRaw,
            tracking_uuid: cached?.trackingUuid,
            tracking_url: cached?.trackingUuid ? `${siteUrl}/t/${cached.trackingUuid}` : undefined,
          },
          { status: 200, headers: corsHeaders }
        );
      }

      // حجز البصمة لمنع المعالجة المتزامنة في نفس اللحظة (Concurreny Lock)
      const acquired = IdempotencyEngine.acquire(fingerprint);
      if (!acquired) {
        return NextResponse.json(
          {
            success: true,
            deduplicated: true,
            message: 'Concurrent webhook payload in-flight (Idempotency locked)',
            order: normalizedEvent.externalOrderId,
            status: normalizedEvent.statusRaw,
          },
          { status: 200, headers: corsHeaders }
        );
      }

      // 7. معالجة الحدث وتحديث قواعد البيانات والخط الزمني مع إطلاق المشغلات الآلية
      const result = await orchestrator.processEvent(normalizedEvent, {
        siteUrl,
        merchantStoreName: merchant.store_name,
      });

      if (!result.success) {
        IdempotencyEngine.release(fingerprint);
        const isPaymentRequired = result.error === 'subscription_limit_reached' || result.error === 'subscription_expired';
        const isSuspended = result.error === 'account_suspended';
        const statusCode = isPaymentRequired ? 402 : isSuspended ? 403 : 500;
        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Failed to orchestrate tracking event.',
            code: typeof result.error === 'string' ? result.error.toUpperCase() : 'ERROR',
            message: result.message || (isPaymentRequired ? 'يرجى ترقية أو تجديد باقة الاشتراك لمتابعة تسجيل الطلبات.' : undefined),
          },
          { status: statusCode, headers: corsHeaders }
        );
      }

      // حفظ النتيجة بنجاح في سجل الـ Idempotency
      IdempotencyEngine.complete(fingerprint, {
        trackingUuid: result.trackingUuid,
        status: normalizedEvent.statusRaw,
      });

      const trackingUrl = `${siteUrl}/t/${result.trackingUuid}`;

      return NextResponse.json(
        {
          success: true,
          deduplicated: result.deduplicated || false,
          isNewOrder: result.isNewOrder || false,
          order: normalizedEvent.externalOrderId,
          status: normalizedEvent.statusRaw,
          carrier: normalizedEvent.carrierName,
          carrier_tracking_number: normalizedEvent.carrierTrackingNumber,
          tracking_uuid: result.trackingUuid,
          tracking_url: trackingUrl,
          triggers: result.triggers || [],
        },
        { status: 200, headers: corsHeaders }
      );
    } catch (err: any) {
      if (fingerprint) {
        IdempotencyEngine.release(fingerprint);
      }
      console.error(`[Webhook Ingestion Error - ${options.source}]:`, err);
      return NextResponse.json(
        { error: 'Internal Server Error', details: err?.message },
        { status: 500, headers: corsHeaders }
      );
    }
  };
}
