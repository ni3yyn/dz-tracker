import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function incrementClicks(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;

  const supabase = getSupabaseAdminClient();

  // Only count clicks for products currently published on a tracking page.
  const { data: activeItem, error: lookupError } = await supabase
    .from('merchant_upsells')
    .select('id')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (lookupError || !activeItem) return false;

  // Try the atomic, server-privileged RPC first.
  try {
    const { error } = await supabase.rpc('increment_merchant_upsell_clicks', { upsell_id: id });
    if (!error) return true;
    console.warn('[upsell/click] RPC error:', error.message);
  } catch (e) {
    console.warn('[upsell/click] RPC threw:', e);
  }

  // Fallback for installations where the RPC migration is not yet applied.
  try {
    const { data: row } = await supabase
      .from('merchant_upsells')
      .select('clicks_count')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (row) {
      const { error } = await supabase
        .from('merchant_upsells')
        .update({ clicks_count: ((row as any).clicks_count || 0) + 1 })
        .eq('id', id)
        .eq('is_active', true);
      return !error;
    }
  } catch (err) {
    console.error('[upsell/click] fallback error:', err);
  }
  return false;
}

export async function POST(req: Request) {
  try {
    let id: string | null = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      id = body?.id || null;
    } else {
      // Handles sendBeacon text/plain or blob payloads
      const text = await req.text();
      try {
        const parsed = JSON.parse(text);
        id = parsed?.id || null;
      } catch {
        id = text.trim() || null;
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing product ID' }, { status: 400 });
    }

    await incrementClicks(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/upsell/click error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const requestedRedirect = searchParams.get('redirect');

    // Never redirect to a caller-supplied URL. When legacy callers request a
    // redirect, resolve the destination from the merchant's active product row.
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Valid product ID is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: item, error } = await supabase
      .from('merchant_upsells')
      .select('product_url')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !item?.product_url) {
      return NextResponse.json({ error: 'Product is unavailable.' }, { status: 404 });
    }

    let destination: URL;
    try {
      destination = new URL(item.product_url);
    } catch {
      return NextResponse.json({ error: 'Product destination is invalid.' }, { status: 409 });
    }
    if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
      return NextResponse.json({ error: 'Product destination is invalid.' }, { status: 409 });
    }

    await incrementClicks(id);

    if (requestedRedirect !== null) {
      return NextResponse.redirect(destination.toString(), 302);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('GET /api/upsell/click error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

