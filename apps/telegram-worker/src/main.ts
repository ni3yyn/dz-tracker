import { loadConfig } from './config.js';
import { MtcuteTelegramSender } from './telegram-client.js';
import { TelegramQueueManager } from './queue.js';
import { WorkerHealthMonitor } from './health.js';
import { TelegramTrackingWorker } from './worker.js';

async function bootstrap(): Promise<void> {
  console.log('====================================================');
  console.log(' TajerTrack Telegram Tracking Delivery Worker (MTProto)');
  console.log('====================================================');

  // 1. Load and validate environment configuration
  let config;
  try {
    config = loadConfig();
    console.log(`[Bootstrap]: Configuration loaded. Worker ID: ${config.workerId}`);
    console.log(`[Bootstrap]: Worker feature switch (TELEGRAM_WORKER_ENABLED): ${config.isEnabled}`);
  } catch (err: any) {
    console.error('[Bootstrap]: Configuration validation failed:', err.message);
    process.exit(1);
  }

  // 2. Initialize Queue Manager & Health Monitor
  const queue = new TelegramQueueManager(config);
  const health = new WorkerHealthMonitor(config.workerId);

  // 3. Check if worker is enabled
  if (!config.isEnabled) {
    console.log('[Bootstrap]: TELEGRAM_WORKER_ENABLED is false. Worker will remain in standby/health-check mode.');
    // Keep alive in standby mode
    setInterval(() => {
      const status = health.getStatus();
      console.log(`[Standby Heartbeat]: Uptime: ${status.uptimeSeconds}s | Standby (Disabled)`);
    }, 60000);
    return;
  }

  // 4. Initialize and authenticate Telegram client
  console.log('[Bootstrap]: Initializing MTProto Telegram Client...');
  const sender = new MtcuteTelegramSender(config);

  try {
    await sender.connect();
    const sessionValid = await sender.checkSession();
    if (!sessionValid) {
      console.error('[Bootstrap]: FATAL: Provided Telegram session is invalid or not logged in.');
      process.exit(1);
    }
    console.log('[Bootstrap]: Telegram MTProto authenticated successfully.');
  } catch (err: any) {
    console.error('[Bootstrap]: Telegram connection failed:', err.message);
    process.exit(1);
  }

  // 5. Initialize and launch Worker
  const worker = new TelegramTrackingWorker(config, queue, sender, health);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n[Bootstrap]: Caught signal ${signal}. Initiating graceful shutdown...`);
    worker.stop();
    await sender.close();
    console.log('[Bootstrap]: Teardown complete. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Periodic heartbeat log
  setInterval(() => {
    const status = health.getStatus();
    console.log(
      `[Heartbeat]: Uptime: ${status.uptimeSeconds}s | Mem: ${status.memoryUsageMb}MB | Processed: ${status.totalJobsProcessed} (Sent: ${status.successfulSends}, Skipped: ${status.skippedJobs}, Failed: ${status.failedJobs})`
    );
  }, 30000);

  // 6. Ensure database worker state is active and start queue processing
  await queue.setWorkerEnabled(true);
  await worker.start();
}

bootstrap().catch((err) => {
  console.error('[Bootstrap]: Unhandled fatal error during startup:', err);
  process.exit(1);
});
