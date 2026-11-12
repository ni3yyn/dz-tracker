import { NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UsageBucket = {
  timestamp: string;
  total_auth_requests: number;
  total_realtime_requests: number;
  total_rest_requests: number;
  total_storage_requests: number;
};

type CachedUsage = {
  expiresAt: number;
  payload: {
    projectRef: string;
    planTier: string | null;
    interval: '1day';
    buckets: UsageBucket[];
    fetchedAt: string;
  };
};

// Per-instance cache prevents dashboard refreshes from repeatedly hitting Supabase Analytics.
// The UI also refreshes slowly; this endpoint is intentionally not a realtime poll.
let cachedUsage: CachedUsage | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getProjectRef(): string | null {
  const configured = process.env.SUPABASE_PROJECT_REF?.trim();
  if (configured && /^[a-z0-9]{20}$/.test(configured)) return configured;

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) return null;

  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.(?:co|in)$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function normalizeBuckets(input: unknown): UsageBucket[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map((row) => ({
      timestamp: typeof row.timestamp === 'string' ? row.timestamp : '',
      total_auth_requests: Number(row.total_auth_requests) || 0,
      total_realtime_requests: Number(row.total_realtime_requests) || 0,
      total_rest_requests: Number(row.total_rest_requests) || 0,
      total_storage_requests: Number(row.total_storage_requests) || 0,
    }))
    .filter((row) => Boolean(row.timestamp) && Number.isFinite(Date.parse(row.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-30);
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const token = process.env.SUPABASE_MANAGEMENT_API_TOKEN?.trim();
  const projectRef = getProjectRef();

  if (!token || !projectRef) {
    return NextResponse.json({
      configured: false,
      missing: [
        ...(!token ? ['SUPABASE_MANAGEMENT_API_TOKEN'] : []),
        ...(!projectRef ? ['SUPABASE_PROJECT_REF (or a standard NEXT_PUBLIC_SUPABASE_URL)'] : []),
      ],
      planTier: process.env.SUPABASE_PLAN_TIER?.trim().toLowerCase() || null,
    }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (cachedUsage && cachedUsage.expiresAt > Date.now() && cachedUsage.payload.projectRef === projectRef) {
    return NextResponse.json({
      configured: true,
      ...cachedUsage.payload,
      cached: true,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const url = new URL(
      `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/usage.api-counts`
    );
    url.searchParams.set('interval', '1day');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const status = response.status;
      const message = status === 401
        ? 'Supabase rejected the Management API token.'
        : status === 403
          ? 'The token needs the analytics_usage_read permission for this project.'
          : status === 429
            ? 'Supabase Analytics rate limit reached. Try again later.'
            : `Supabase Management API returned HTTP ${status}.`;
      return NextResponse.json({ configured: true, error: message, status }, {
        status: 502,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error) {
      return NextResponse.json({ configured: true, error: 'Supabase returned an analytics error.' }, {
        status: 502,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const payload = {
      projectRef,
      planTier: process.env.SUPABASE_PLAN_TIER?.trim().toLowerCase() || null,
      interval: '1day' as const,
      buckets: normalizeBuckets(body.result),
      fetchedAt: new Date().toISOString(),
    };
    cachedUsage = { expiresAt: Date.now() + CACHE_TTL_MS, payload };

    return NextResponse.json({ configured: true, ...payload, cached: false }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: any) {
    console.error('[SupabaseUsage] Could not load platform usage:', error?.message || error);
    return NextResponse.json({ configured: true, error: 'Could not reach Supabase Analytics. Try again later.' }, {
      status: 502,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
