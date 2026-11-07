import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { createWebhookHandler, handleOptions } from '../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';
export const OPTIONS = handleOptions;

/**
 * Read-only credential check for the SDK CLI.
 * Does not create an order, consume quota, or enqueue customer notifications.
 */
export async function GET(req: Request) {
  const apiKey = req.headers.get('x-api-key')?.trim();
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    'Cache-Control': 'no-store',
  };

  if (!apiKey) {
    return NextResponse.json({ success: false, valid: false, error: 'Missing x-api-key header.' }, { status: 401, headers });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: merchant, error } = await supabase
      .from('merchants')
      .select('id, subscription_status')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (error) {
      console.error('[Webhook credential check] Database lookup failed:', error.message);
      return NextResponse.json({ success: false, valid: false, error: 'Credential check is temporarily unavailable.' }, { status: 500, headers });
    }
    if (!merchant) {
      return NextResponse.json({ success: false, valid: false, error: 'Invalid API key.' }, { status: 401, headers });
    }

    return NextResponse.json({
      success: true,
      valid: true,
      accountStatus: merchant.subscription_status || 'unknown',
    }, { status: 200, headers });
  } catch (error) {
    console.error('[Webhook credential check] Unexpected error:', error);
    return NextResponse.json({ success: false, valid: false, error: 'Credential check is temporarily unavailable.' }, { status: 500, headers });
  }
}

export const POST = createWebhookHandler({
  source: 'direct',
  transformEvent: ({ merchant, payload }) => {
    const hasTelegramConsent = payload.telegram_consent === true || payload.telegramConsent === true;
    return {
      merchantId: merchant.id,
      externalOrderId: String(payload.order_id || payload.id || 'DIRECT_ORDER'),
      customerName: payload.customer_name || payload.name,
      customerPhone: payload.customer_phone || payload.phone,
      statusRaw: payload.status || 'order_placed',
      description: payload.description,
      productName: payload.product_name || payload.productName,
      productImage: payload.product_image || payload.productImage,
      carrierName: payload.carrier_name || payload.carrier,
      carrierTrackingNumber: payload.carrier_tracking_number || payload.tracking_number,
      customerTelegramConsent: hasTelegramConsent,
      telegramConsentSource: hasTelegramConsent ? (payload.telegram_consent_source || payload.telegramConsentSource || 'direct_api') : undefined,
      telegramConsentVersion: hasTelegramConsent ? (payload.telegram_consent_version || payload.telegramConsentVersion || 'v1') : undefined,
    };
  },
});
