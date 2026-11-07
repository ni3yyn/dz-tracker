import { loadConfig } from './config.js';
import { MtcuteTelegramSender } from './telegram-client.js';
import { TelegramQueueManager } from './queue.js';
import { WorkerHealthMonitor } from './health.js';
import { TelegramTrackingWorker } from './worker.js';
import { TelegramConfirmationWorker } from './confirmation-worker.js';
import { classifyTelegramError } from './error-classifier.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function bootstrap(): Promise<void> {
  console.log('====================================================');
  console.log(' TajerTrack Telegram Delivery Worker (single-session guard)');
  console.log('====================================================');

  const config = loadConfig();
  console.log('[Bootstrap]: Configuration loaded. Service ID: ' + config.workerId);
  console.log('[Bootstrap]: Unique process instance: ' + config.instanceId);
  console.log('[Bootstrap]: Worker feature switch (TELEGRAM_WORKER_ENABLED): ' + config.isEnabled);

  const queue = new TelegramQueueManager(config);
  const health = new WorkerHealthMonitor(config.workerId);

  if (!config.isEnabled) {
    console.log('[Bootstrap]: TELEGRAM_WORKER_ENABLED is false. Staying in standby mode.');
    setInterval(() => {
      const status = health.getStatus();
      console.log('[Standby Heartbeat]: Uptime: ' + status.uptimeSeconds + 's | Standby (Disabled)');
    }, 60000);
    return;
  }

  let sender: MtcuteTelegramSender | null = null;
  let trackingWorker: TelegramTrackingWorker | null = null;
  let confirmationWorker: TelegramConfirmationWorker | null = null;
  let trackingLoop: Promise<void> | null = null;
  let confirmationLoop: Promise<void> | null = null;
  let acquireInFlight: Promise<boolean> | null = null;
  let heartbeatInFlight: Promise<boolean> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let haltedLogTimer: ReturnType<typeof setInterval> | null = null;
  let leaseHeld = false;
  let leaseLost = false;
  let halted = false;
  let stopping = false;
  let shutdownPromise: Promise<void> | null = null;

  const heartbeatIntervalMs = Math.max(
    5000,
    Math.floor((config.leaseDurationSeconds * 1000) / 3)
  );

  const clearHeartbeatTimer = (): void => {
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const haltProcessing = async (reason: string, lostLease = false): Promise<void> => {
    if (lostLease) {
      leaseLost = true;
      leaseHeld = false;
      health.setLeaseStatus(false);
      clearHeartbeatTimer();
    }

    const wasAlreadyHalted = halted;
    halted = true;

    if (!wasAlreadyHalted) {
      console.error('[CRITICAL]: ' + reason);
      trackingWorker?.stop();
      confirmationWorker?.stop();
      await sender?.close();
      console.error('[CRITICAL]: Telegram sender closed. No further jobs will be claimed or sent.');
    } else if (lostLease) {
      console.error('[CRITICAL]: Process lease was lost after the worker had already halted.');
    }

    if (!haltedLogTimer) {
      haltedLogTimer = setInterval(() => {
        console.error('[CRITICAL]: Telegram delivery remains halted. Reason: ' + reason);
      }, 60000);
    }
  };

  const scheduleHeartbeat = (): void => {
    if (stopping || leaseLost || !leaseHeld) return;
    clearHeartbeatTimer();
    heartbeatTimer = setTimeout(() => {
      void renewLease();
    }, heartbeatIntervalMs);
  };

  const renewLease = async (): Promise<void> => {
    if (stopping || leaseLost || !leaseHeld) return;

    const renewal = queue.acquireLease(config.instanceId, config.leaseDurationSeconds);
    heartbeatInFlight = renewal;
    const renewed = await renewal;
    heartbeatInFlight = null;

    if (stopping) return;

    if (!renewed) {
      await haltProcessing(
        'Exclusive Telegram process lease renewal failed. This process is fenced off and has closed its MTProto connection.',
        true
      );
      return;
    }

    scheduleHeartbeat();
  };

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;

    stopping = true;
    clearHeartbeatTimer();
    if (haltedLogTimer) {
      clearInterval(haltedLogTimer);
      haltedLogTimer = null;
    }

    trackingWorker?.stop();
    confirmationWorker?.stop();

    shutdownPromise = (async () => {
      // Finish any in-flight lock request before releasing; never renew after release.
      if (acquireInFlight) {
        await acquireInFlight;
      }
      if (heartbeatInFlight) {
        await heartbeatInFlight;
      }

      // Close the MTProto transport before releasing the lock so a replacement
      // process cannot authenticate while this process still owns a live socket.
      await sender?.close();

      const loops: Promise<void>[] = [];
      if (trackingLoop) loops.push(trackingLoop);
      if (confirmationLoop) loops.push(confirmationLoop);
      await Promise.allSettled(loops);

      if (leaseHeld) {
        const released = await queue.releaseLease(config.instanceId);
        if (!released) {
          console.warn('[Bootstrap]: Lease was not released by this process; it will expire naturally.');
        }
      }

      leaseHeld = false;
      health.setLeaseStatus(false);
      console.log('[Bootstrap]: Graceful shutdown complete (' + signal + ').');
      process.exit(0);
    })();

    return shutdownPromise;
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Acquire the singleton lease BEFORE creating any Telegram connection.
  // Each process has a cryptographically unique instanceId, unlike the old
  // shared TELEGRAM_WORKER_ID which allowed two replicas to impersonate one owner.
  console.log('[Bootstrap]: Requesting exclusive Telegram process lease...');
  while (!stopping && !leaseHeld) {
    const acquisition = queue.acquireLease(config.instanceId, config.leaseDurationSeconds).then((acquired) => {
      if (acquired) {
        leaseHeld = true;
        health.setLeaseStatus(true);
      }
      return acquired;
    });
    acquireInFlight = acquisition;
    const acquired = await acquisition;
    acquireInFlight = null;

    if (!acquired && !stopping) {
      console.log('[Bootstrap]: Another process owns the Telegram session lock. This instance will wait without connecting to Telegram.');
      await sleep(Math.max(5000, config.pollIntervalMs));
    }
  }

  if (stopping || !leaseHeld) return;

  const workerStateEnabled = await queue.setWorkerEnabled(true);
  if (!workerStateEnabled) {
    await queue.releaseLease(config.instanceId);
    leaseHeld = false;
    health.setLeaseStatus(false);
    throw new Error('[Bootstrap]: Could not enable the Telegram worker state in Supabase; refusing to connect.');
  }

  // Renew independently of queue activity. An idle queue must not lose its lock.
  scheduleHeartbeat();

  sender = new MtcuteTelegramSender(config);

  // Retry transient network failures with bounded backoff while retaining the
  // exclusive lease. Fatal session/duplicate-key errors stop permanently and
  // retain the lease until this process is deliberately stopped or redeployed.
  let startupAttempt = 0;
  let authenticated = false;

  while (!stopping && !halted && !authenticated) {
    try {
      console.log('[Bootstrap]: Initializing MTProto client under exclusive lease...');
      await sender.connect();

      const sessionValid = await sender.checkSession();
      if (!sessionValid) {
        throw new Error('AUTH_KEY_UNREGISTERED: Telegram session did not authenticate as an account.');
      }

      authenticated = true;
      console.log('[Bootstrap]: Telegram MTProto authenticated successfully.');
    } catch (err: any) {
      if (stopping) return;

      const classified = classifyTelegramError(err);
      if (classified.category === 'fatal_auth') {
        await haltProcessing(
          'Fatal Telegram authorization error (' + classified.code + '): ' + classified.message +
          ' The worker will not reconnect or retry this session automatically.',
          false
        );
        return;
      }

      const delayMs = Math.min(60000, 5000 * Math.pow(2, Math.min(startupAttempt, 4)));
      startupAttempt += 1;
      console.error(
        '[Bootstrap]: Telegram connection failed (' + classified.code + '). Retrying in ' +
        Math.round(delayMs / 1000) + 's while retaining the exclusive lease: ' + classified.message
      );
      await sender.close();
      await sleep(delayMs);
    }
  }

  if (stopping || halted || !authenticated) return;

  const onFatalAuth = (error: { code: string; message: string }): void => {
    void haltProcessing(
      'Fatal Telegram authorization error (' + error.code + '): ' + error.message +
      ' All Telegram queues are now halted until the session/process is repaired.',
      false
    );
  };

  trackingWorker = new TelegramTrackingWorker(config, queue, sender, health, onFatalAuth);
  confirmationWorker = new TelegramConfirmationWorker(config, queue, sender, onFatalAuth);

  console.log('[Bootstrap]: Starting tracking and confirmation consumers under the same exclusive session lease.');
  trackingLoop = trackingWorker.start();
  confirmationLoop = confirmationWorker.start();

  await Promise.all([trackingLoop, confirmationLoop]);
}

bootstrap().catch((err) => {
  console.error('[Bootstrap]: Unhandled fatal error:', err?.message || err);
  process.exit(1);
});
