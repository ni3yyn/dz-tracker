import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
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

type DatabaseSize = {
  bytes: string;
  pretty: string;
  measuredAt: string;
  source: 'pg_database_size';
};

type UsagePayload = {
  projectRef: string;
  planTier: string | null;
  interval: '1day';
  buckets: UsageBucket[];
  fetchedAt: string;
  databaseSize: DatabaseSize | null;
  databaseSizeError: string | null;
};

type CachedUsage = {
  expiresAt: number;
  payload: UsagePayload;
};

// Analytics endpoint is intentionally cached because this is an admin audit view,
// not a realtime operational screen.
let cachedUsage: CachedUsage | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Supabase reports database-size metrics daily, so a one-hour cache is sufficient.
let cachedDatabaseSize: {
  expiresAt: number;
  value: DatabaseSize | null;
  error: string | null;
} | null = null;
const DATABASE_SIZE_CACHE_MS = 60 * 60 * 1000;

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

async function getDatabaseSize(): Promise<{
  value: DatabaseSize | null;
  error: string | null;
}> {
  if (cachedDatabaseSize && cachedDatabaseSize.expiresAt > Date.now()) {
    return { value: cachedDatabaseSize.value, error: cachedDatabaseSize.error };
  }

  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase.rpc('admin_get_database_size');

    if (error || !data || typeof data !== 'object') {
      console.warn('[SupabaseUsage] Database-size metric unavailable:', error?.message || 'Empty RPC response.');
      const result = {
        value: null,
        error: 'Apply the admin database-size SQL migration to enable this metric.',
      };
      cachedDatabaseSize = { expiresAt: Date.now() + DATABASE_SIZE_CACHE_MS, ...result };
      return result;
    }

    const bytes = String((data as Record<string, unknown>).bytes ?? '');
    const pretty = String((data as Record<string, unknown>).pretty ?? '');
    if (!/^\d+$/.test(bytes) || !pretty) {
      const result = { value: null, error: 'Supabase returned an invalid database-size measurement.' };
      cachedDatabaseSize = { expiresAt: Date.now() + DATABASE_SIZE_CACHE_MS, ...result };
      return result;
    }

    const result = {
      value: {
        bytes,
        pretty,
        measuredAt: new Date().toISOString(),
        source: 'pg_database_size' as const,
      },
      error: null,
    };
    cachedDatabaseSize = { expiresAt: Date.now() + DATABASE_SIZE_CACHE_MS, ...result };
    return result;
  } catch (error: any) {
    console.error('[SupabaseUsage] Database-size query failed:', error?.message || error);
    const result = { value: null, error: 'Could not query PostgreSQL database size.' };
    cachedDatabaseSize = { expiresAt: Date.now() + DATABASE_SIZE_CACHE_MS, ...result };
    return result;
  }
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const token = process.env.SUPABASE_MANAGEMENT_API_TOKEN?.trim();
  const projectRef = getProjectRef();
  const planTier = process.env.SUPABASE_PLAN_TIER?.trim().toLowerCase() || null;
  const databaseSize = await getDatabaseSize();

  if (!token || !projectRef) {
    return NextResponse.json({
      configured: false,
      missing: [
        ...(!token ? ['SUPABASE_MANAGEMENT_API_TOKEN'] : []),
        ...(!projectRef ? ['SUPABASE_PROJECT_REF (or a standard NEXT_PUBLIC_SUPABASE_URL)'] : []),
      ],
      projectRef,
      planTier,
      databaseSize: databaseSize.value,
      databaseSizeError: databaseSize.error,
    }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (
    cachedUsage &&
    cachedUsage.expiresAt > Date.now() &&
    cachedUsage.payload.projectRef === projectRef
  ) {
    return NextResponse.json({
      configured: true,
      ...cachedUsage.payload,
      databaseSize: databaseSize.value,
      databaseSizeError: databaseSize.error,
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
      return NextResponse.json({
        configured: true,
        error: message,
        status,
        projectRef,
        planTier,
        databaseSize: databaseSize.value,
        databaseSizeError: databaseSize.error,
      }, {
        status: 502,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error) {
      return NextResponse.json({
        configured: true,
        error: 'Supabase returned an analytics error.',
        projectRef,
        planTier,
        databaseSize: databaseSize.value,
        databaseSizeError: databaseSize.error,
      }, {
        status: 502,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const payload: UsagePayload = {
      projectRef,
      planTier,
      interval: '1day',
      buckets: normalizeBuckets(body.result),
      fetchedAt: new Date().toISOString(),
      databaseSize: databaseSize.value,
      databaseSizeError: databaseSize.error,
    };
    cachedUsage = { expiresAt: Date.now() + CACHE_TTL_MS, payload };

    return NextResponse.json({ configured: true, ...payload, cached: false }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: any) {
    console.error('[SupabaseUsage] Could not load platform usage:', error?.message || error);
    return NextResponse.json({
      configured: true,
      error: 'Could not reach Supabase Analytics. Try again later.',
      projectRef,
      planTier,
      databaseSize: databaseSize.value,
      databaseSizeError: databaseSize.error,
    }, {
      status: 502,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
