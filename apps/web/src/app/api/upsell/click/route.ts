import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

async function incrementClicks(id: string) {
  if (!id || typeof id !== 'string') return false;

  const supabase = getSupabaseAdminClient();

  // 1. Try atomic database RPC function first
  try {
    const { error: rpcError } = await supabase.rpc('increment_merchant_upsell_clicks', {
      upsell_id: id,
    });

    if (!rpcError) {
      return true;
    }
  } catch {
    // Continue to fallback if RPC is unavailable
  }

  // 2. Resilient fallback: read current count and increment
  try {
    const { data: item } = await supabase
      .from('merchant_upsells')
      .select('clicks_count')
      .eq('id', id)
      .maybeSingle();

    if (item) {
      await supabase
        .from('merchant_upsells')
        .update({ clicks_count: ((item as any).clicks_count || 0) + 1 })
        .eq('id', id);
      return true;
    }
  } catch (err) {
    console.error('Error incrementing upsell clicks fallback:', err);
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

