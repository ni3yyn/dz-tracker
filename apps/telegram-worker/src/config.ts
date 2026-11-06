import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Load .env if present from apps/telegram-worker or cwd
const localWorkerEnv = path.resolve(process.cwd(), 'apps/telegram-worker/.env');
if (fs.existsSync(localWorkerEnv)) {
  dotenv.config({ path: localWorkerEnv });
}
dotenv.config();

export interface WorkerConfig {
  workerId: string;
  isEnabled: boolean;
  telegramApiId: number;
  telegramApiHash: string;
  telegramSession: string;
  telegramExpectedUserId?: number;
  supabaseUrl: string;
  supabaseSecretKey: string;
  trackingPublicBaseUrl: string;
  pollIntervalMs: number;
  leaseDurationSeconds: number;
  minResolutionIntervalMs: number;
}

export function loadConfig(): WorkerConfig {
  const isEnabled = process.env.TELEGRAM_WORKER_ENABLED === 'true';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl) {
    throw new Error('[Config Error]: SUPABASE_URL is required.');
  }

  if (!supabaseSecretKey) {
    throw new Error('[Config Error]: SUPABASE_SECRET_KEY (or service_role) is required for telegram-worker.');
  }

  const telegramApiId = Number(process.env.TELEGRAM_API_ID || '0');
  const telegramApiHash = process.env.TELEGRAM_API_HASH || '';
  const telegramSession = process.env.TELEGRAM_SESSION || '';
  const telegramExpectedUserId = process.env.TELEGRAM_EXPECTED_USER_ID
    ? Number(process.env.TELEGRAM_EXPECTED_USER_ID)
    : undefined;

  if (isEnabled) {
    if (!telegramApiId || !telegramApiHash) {
      throw new Error('[Config Error]: TELEGRAM_API_ID and TELEGRAM_API_HASH are required when TELEGRAM_WORKER_ENABLED=true.');
    }
    if (!telegramSession) {
      throw new Error('[Config Error]: TELEGRAM_SESSION is required when TELEGRAM_WORKER_ENABLED=true.');
    }
  }

  const trackingPublicBaseUrl = (
    process.env.TRACKING_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://tajertrack.com'
  ).replace(/\/+$/, '');

  const workerId = process.env.TELEGRAM_WORKER_ID || process.env.WORKER_ID || `worker-${crypto.randomUUID().slice(0, 8)}`;
  const pollIntervalMs = Math.max(1000, Number(process.env.POLL_INTERVAL_MS || '3500'));
  const leaseDurationSeconds = Math.max(15, Number(process.env.LEASE_DURATION_SECONDS || '60'));
  const minResolutionIntervalMs = Math.max(3000, Number(process.env.MIN_RESOLUTION_INTERVAL_MS || '3500'));

  return {
    workerId,
    isEnabled,
    telegramApiId,
    telegramApiHash,
    telegramSession,
    telegramExpectedUserId,
    supabaseUrl,
    supabaseSecretKey,
    trackingPublicBaseUrl,
    pollIntervalMs,
    leaseDurationSeconds,
    minResolutionIntervalMs,
  };
}

