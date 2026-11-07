import { NextResponse } from 'next/server';

// Cache for 1 year — product images are immutable once uploaded
const CACHE_MAX_AGE = 31_536_000; // seconds (1 year)
// Stale-while-revalidate: serve stale for extra 7 days while refreshing in background
const SWR = 604_800; // 7 days

const ALLOWED_HOSTS = [
  // Supabase storage
  '.supabase.co',
  '.supabase.in',
];

function isAllowedHost(url: URL): boolean {
  return ALLOWED_HOSTS.some((h) => url.hostname.endsWith(h));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Security: only proxy from our own storage
  if (!isAllowedHost(parsed)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const upstream = await fetch(rawUrl, {
      // Next.js fetch cache: only hit Supabase once per unique URL, then serve from cache
      next: { revalidate: CACHE_MAX_AGE },
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // ── Aggressive browser + CDN caching ──────────────────────────────
        // "public"               → CDN (Vercel Edge, Cloudflare) can cache it
        // "max-age=31536000"     → browser keeps it 1 year
        // "stale-while-revalidate" → serve stale while silently refreshing
        // "immutable"            → browser won't revalidate until max-age expires
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${SWR}, immutable`,
        // Vercel Edge Cache TTL (separate from browser cache)
        'CDN-Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        'Vercel-CDN-Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        // Prevent CORS issues if images are used cross-origin
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[api/img] fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
  }
}

