import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

export interface PushWorkerConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  isEnabled: boolean;
  workerId: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  trackingPublicBaseUrl: string;
  pollIntervalMs: number;
  leaseDurationSeconds: number;
  credentialsEncryptionKey: string;
  ecoTrackSyncEnabled: boolean;
  ecoTrackSyncIntervalMs: number;
  zrExpressWebhookWorkerEnabled: boolean;
  zrExpressWebhookPollIntervalMs: number;
  zimouSyncEnabled: boolean;
  zimouSyncIntervalMs: number;
  elogistiaSyncEnabled: boolean;
  elogistiaSyncIntervalMs: number;
}

export function loadConfig(): PushWorkerConfig {
  const localEnvPath = path.resolve(process.cwd(), 'apps/push-worker/.env');
  const rootEnvPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  } else if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  } else {
    dotenv.config();
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error('Missing required environment variable: SUPABASE_URL');
  if (!supabaseSecretKey) throw new Error('Missing required environment variable: SUPABASE_SECRET_KEY');

  const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:support@tajertrack.dz';

  const isEnabled = process.env.WEB_PUSH_WORKER_ENABLED === 'true';

  return {
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
    isEnabled,
    workerId: process.env.WEB_PUSH_WORKER_ID || `push-worker-${Math.random().toString(36).substring(2, 7)}`,
    supabaseUrl,
    supabaseSecretKey,
    trackingPublicBaseUrl: process.env.TRACKING_PUBLIC_BASE_URL || 'https://tajertrack.vercel.app',
    pollIntervalMs: Math.max(1000, parseInt(process.env.POLL_INTERVAL_MS || '3000', 10)),
    leaseDurationSeconds: Math.max(10, parseInt(process.env.LEASE_DURATION_SECONDS || '30', 10)),
    credentialsEncryptionKey: process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '',
    ecoTrackSyncEnabled: process.env.CARRIER_SYNC_ENABLED === 'true' && (process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '').length >= 32,
    ecoTrackSyncIntervalMs: Math.max(60_000, parseInt(process.env.CARRIER_SYNC_INTERVAL_MS || '300000', 10)),
    zrExpressWebhookWorkerEnabled: process.env.ZREXPRESS_WEBHOOK_WORKER_ENABLED === 'true' && (process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '').length >= 32,
    zrExpressWebhookPollIntervalMs: Math.max(1000, parseInt(process.env.ZREXPRESS_WEBHOOK_POLL_INTERVAL_MS || '2000', 10)),
    zimouSyncEnabled: process.env.ZIMOU_SYNC_ENABLED === 'true' && (process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '').length >= 32,
    zimouSyncIntervalMs: Math.max(60_000, parseInt(process.env.ZIMOU_SYNC_INTERVAL_MS || '300000', 10)),
    elogistiaSyncEnabled: process.env.ELOGISTIA_SYNC_ENABLED === 'true' && (process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '').length >= 32,
    elogistiaSyncIntervalMs: Math.max(60_000, parseInt(process.env.ELOGISTIA_SYNC_INTERVAL_MS || '300000', 10)),
  };
}

