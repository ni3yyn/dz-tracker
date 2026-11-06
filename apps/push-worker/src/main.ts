import { loadConfig } from './config.js';
import { PushQueueManager } from './queue.js';
import { WebPushClient } from './web-push-client.js';
import { PushWorkerHealthMonitor } from './health.js';
import { WebPushWorker } from './worker.js';

async function bootstrap(): Promise<void> {
  console.log('====================================================');
  console.log(' TajerTrack Web Push Delivery Worker (VAPID)');
  console.log('====================================================');

  // 1. Load and validate environment configuration
  let config;
  try {
    config = loadConfig();
    console.log(`[Bootstrap]: Configuration loaded. Worker ID: ${config.workerId}`);
    console.log(`[Bootstrap]: Worker feature switch (WEB_PUSH_WORKER_ENABLED): ${config.isEnabled}`);
  } catch (err: any) {
    console.error('[Bootstrap]: Configuration validation failed:', err.message);
    process.exit(1);
  }

  // 2. Initialize Queue Manager & Health Monitor
  const queue = new PushQueueManager(config);
  const health = new PushWorkerHealthMonitor(config.workerId);

  // 3. Standby check if worker disabled via env
  if (!config.isEnabled) {
    console.log('[Bootstrap]: WEB_PUSH_WORKER_ENABLED is false. Worker will remain in standby/health-check mode.');
    await queue.setWorkerEnabled(false);
    setInterval(() => {
      const status = health.getStatus();
      console.log(`[Standby Heartbeat]: Uptime: ${status.uptimeSeconds}s | Standby (Disabled)`);
    }, 60000);
    return;
  }

  // 4. Initialize Web Push VAPID Client
  console.log('[Bootstrap]: Initializing Web Push Client...');
  const pushClient = new WebPushClient(config);

  if (!pushClient.ready) {
    console.warn('[Bootstrap]: Web Push client is not ready (missing or invalid VAPID credentials).');
  } else {
    console.log('[Bootstrap]: Web Push VAPID client configured successfully.');
  }

  // 5. Initialize Worker
  const worker = new WebPushWorker(config, queue, pushClient, health);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n[Bootstrap]: Caught signal ${signal}. Initiating graceful shutdown...`);
    await worker.stop();
    await queue.setWorkerEnabled(false);
    console.log('[Bootstrap]: Teardown complete. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Periodic heartbeat log
  setInterval(() => {
    const status = health.getStatus();
    console.log(
      `[Heartbeat]: Uptime: ${status.uptimeSeconds}s | Mem: ${status.memoryUsageMb}MB | Processed: ${status.totalJobsProcessed} (Sent: ${status.successfulSends}, Expired: ${status.expiredCleanups}, Failed: ${status.failedJobs})`
    );
  }, 30000);

  // 6. Start queue worker loop
  await worker.start();
}

bootstrap().catch((err) => {
  console.error('[Bootstrap]: Unhandled fatal error during startup:', err);
  process.exit(1);
});

