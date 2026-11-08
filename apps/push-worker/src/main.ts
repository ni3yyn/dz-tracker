import { loadConfig } from './config.js';
import { PushQueueManager } from './queue.js';
import { WebPushClient } from './web-push-client.js';
import { PushWorkerHealthMonitor } from './health.js';
import { WebPushWorker } from './worker.js';
import { EcoTrackSyncWorker } from './ecotrack-sync.js';
import { ZRExpressWebhookWorker } from './zrexpress-webhook-worker.js';
import { ZimouSyncWorker } from './zimou-sync.js';
import { ElogistiaSyncWorker } from './elogistia-sync.js';
import { EcomV2SyncWorker } from './ecom-v2-sync.js';

async function bootstrap(): Promise<void> {
  console.log('====================================================');
  console.log(' TajerTrack Background Workers (Web Push + EcoTrack + ZR Express + Zimou + Elogistia + E-com v2)');
  console.log('====================================================');

  let config;
  try {
    config = loadConfig();
    console.log(`[Bootstrap]: Configuration loaded. Worker ID: ${config.workerId}`);
    console.log(`[Bootstrap]: Web Push enabled: ${config.isEnabled}`);
    console.log(`[Bootstrap]: EcoTrack read-only sync enabled: ${config.ecoTrackSyncEnabled}`);
    console.log(`[Bootstrap]: ZR Express webhook worker enabled: ${config.zrExpressWebhookWorkerEnabled}`);
    console.log(`[Bootstrap]: Zimou read-only status sync enabled: ${config.zimouSyncEnabled}`);
    console.log(`[Bootstrap]: Elogistia status polling enabled: ${config.elogistiaSyncEnabled}`);
    console.log(`[Bootstrap]: E-com Delivery v2 status polling enabled: ${config.ecomV2SyncEnabled}`);
    if (process.env.ZREXPRESS_WEBHOOK_WORKER_ENABLED === 'true' && !config.zrExpressWebhookWorkerEnabled) {
      console.warn('[Bootstrap]: ZR Express webhook processing was requested but is disabled because CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing or shorter than 32 characters.');
    }
    if (process.env.ECOM_V2_SYNC_ENABLED === 'true' && !config.ecomV2SyncEnabled) {
      console.warn('[Bootstrap]: E-com Delivery v2 sync was requested but is disabled because CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing or shorter than 32 characters.');
    }
    if (process.env.ELOGISTIA_SYNC_ENABLED === 'true' && !config.elogistiaSyncEnabled) {
      console.warn('[Bootstrap]: Elogistia sync was requested but is disabled because CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing or shorter than 32 characters.');
    }
    if (process.env.ZIMOU_SYNC_ENABLED === 'true' && !config.zimouSyncEnabled) {
      console.warn('[Bootstrap]: Zimou sync was requested but is disabled because CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing or shorter than 32 characters.');
    }
    if (process.env.CARRIER_SYNC_ENABLED === 'true' && !config.ecoTrackSyncEnabled) {
      console.warn('[Bootstrap]: EcoTrack sync was requested but is disabled because CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing or shorter than 32 characters.');
    }
  } catch (err: any) {
    console.error('[Bootstrap]: Configuration validation failed:', err.message);
    process.exit(1);
    return;
  }

  const queue = new PushQueueManager(config);
  const health = new PushWorkerHealthMonitor(config.workerId);
  const ecoTrackSync = config.ecoTrackSyncEnabled ? new EcoTrackSyncWorker(config) : null;
  const zrExpressWebhookWorker = config.zrExpressWebhookWorkerEnabled ? new ZRExpressWebhookWorker(config) : null;
  const zimouSync = config.zimouSyncEnabled ? new ZimouSyncWorker(config) : null;
  const elogistiaSync = config.elogistiaSyncEnabled ? new ElogistiaSyncWorker(config) : null;
  const ecomV2Sync = config.ecomV2SyncEnabled ? new EcomV2SyncWorker(config) : null;

  let pushWorker: WebPushWorker | null = null;
  let pushLoop: Promise<void> | null = null;
  let ecoTrackLoop: Promise<void> | null = null;
  let zrExpressWebhookLoop: Promise<void> | null = null;
  let zimouSyncLoop: Promise<void> | null = null;
  let elogistiaSyncLoop: Promise<void> | null = null;
  let ecomV2SyncLoop: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;

  if (config.isEnabled) {
    console.log('[Bootstrap]: Initializing Web Push Client...');
    const pushClient = new WebPushClient(config);
    if (!pushClient.ready) {
      console.warn('[Bootstrap]: Web Push client is not ready (missing or invalid VAPID credentials).');
    } else {
      console.log('[Bootstrap]: Web Push VAPID client configured successfully.');
    }
    pushWorker = new WebPushWorker(config, queue, pushClient, health);
    pushLoop = pushWorker.start();
  } else {
    console.log('[Bootstrap]: Web Push is disabled. Its queue will remain in standby; EcoTrack sync can still run.');
    await queue.setWorkerEnabled(false);
  }

  if (ecoTrackSync) {
    ecoTrackLoop = ecoTrackSync.start();
  } else {
    console.log('[Bootstrap]: CARRIER_SYNC_ENABLED=false; EcoTrack account synchronization is disabled.');
  }

  if (zrExpressWebhookWorker) {
    zrExpressWebhookLoop = zrExpressWebhookWorker.start();
  } else {
    console.log('[Bootstrap]: ZREXPRESS_WEBHOOK_WORKER_ENABLED=false; ZR Express webhook processing is disabled.');
  }

  if (zimouSync) {
    zimouSyncLoop = zimouSync.start();
  } else {
    console.log('[Bootstrap]: ZIMOU_SYNC_ENABLED=false; Zimou read-only polling is disabled.');
  }

  if (elogistiaSync) {
    elogistiaSyncLoop = elogistiaSync.start();
  } else {
    console.log('[Bootstrap]: ELOGISTIA_SYNC_ENABLED=false; Elogistia status polling is disabled.');
  }

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    console.log(`\n[Bootstrap]: Caught signal ${signal}. Shutting down background workers...`);

    shutdownPromise = (async () => {
      ecoTrackSync?.stop();
      zimouSync?.stop();
      elogistiaSync?.stop();\n      ecomV2Sync?.stop();
      await zrExpressWebhookWorker?.stop();
      await pushWorker?.stop();
      const loops = [pushLoop, ecoTrackLoop, zrExpressWebhookLoop, zimouSyncLoop, elogistiaSyncLoop, ecomV2SyncLoop].filter((loop): loop is Promise<void> => Boolean(loop));
      await Promise.allSettled(loops);
      console.log('[Bootstrap]: Graceful shutdown complete.');
      process.exit(0);
    })();
    return shutdownPromise;
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  const heartbeat = setInterval(() => {
    const status = health.getStatus();
    console.log(
      `[Heartbeat]: Uptime: ${status.uptimeSeconds}s | Mem: ${status.memoryUsageMb}MB | Push processed: ${status.totalJobsProcessed} (Sent: ${status.successfulSends}, Expired: ${status.expiredCleanups}, Failed: ${status.failedJobs}) | EcoTrack sync: ${ecoTrackSync ? 'enabled' : 'disabled'} | ZR Express webhooks: ${zrExpressWebhookWorker ? 'enabled' : 'disabled'} | Zimou sync: ${zimouSync ? 'enabled' : 'disabled'} | Elogistia sync: ${elogistiaSync ? 'enabled' : 'disabled'} | E-com v2 sync: ${ecomV2Sync ? 'enabled' : 'disabled'}`
    );
  }, 30000);

  const loops = [pushLoop, ecoTrackLoop, zrExpressWebhookLoop, zimouSyncLoop, elogistiaSyncLoop].filter((loop): loop is Promise<void> => Boolean(loop));
  if (loops.length === 0) {
    console.log('[Bootstrap]: No background consumers are enabled. Remaining in standby mode.');
    return; // Keep the heartbeat interval alive; SIGTERM/SIGINT handlers still shut down cleanly.
  }

  try {
    await Promise.all(loops);
  } finally {
    clearInterval(heartbeat);
  }
}

bootstrap().catch((err) => {
  console.error('[Bootstrap]: Unhandled fatal error during startup:', err);
  process.exit(1);
});
