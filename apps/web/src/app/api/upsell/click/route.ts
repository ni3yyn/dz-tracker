import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

async function incrementClicks(id: string): Promise<boolean> {
  if (!id || typeof id !== 'string') return false;

  const supabase = getSupabaseAdminClient();

  // 1. Try atomic RPC first (requires migration applied in Supabase)
  try {
    const { error } = await supabase.rpc('increment_merchant_upsell_clicks', { upsell_id: id });
    if (!error) return true;
    console.warn('[upsell/click] RPC error:', error.message);
  } catch (e) {
    console.warn('[upsell/click] RPC threw:', e);
  }

  // 2. Fallback: read-then-write increment
  try {
    const { data: row } = await supabase
      .from('merchant_upsells')
      .select('clicks_count')
      .eq('id', id)
      .maybeSingle();

    if (row) {
      await supabase
        .from('merchant_upsells')
        .update({ clicks_count: ((row as any).clicks_count || 0) + 1 })
        .eq('id', id);
      return true;
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
    const redirectUrl = searchParams.get('redirect');

    if (id) {
      await incrementClicks(id);
    }

    if (redirectUrl) {
      try {
        const parsedUrl = new URL(redirectUrl);
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
          return NextResponse.redirect(parsedUrl.toString(), 302);
        }
      } catch {
        // Fall through if URL is invalid
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('GET /api/upsell/click error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

