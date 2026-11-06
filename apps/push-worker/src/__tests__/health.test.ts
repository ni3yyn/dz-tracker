import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PushWorkerHealthMonitor } from '../health.js';

describe('PushWorkerHealthMonitor', () => {
  it('correctly increments metrics and formats health status', () => {
    const monitor = new PushWorkerHealthMonitor('test-worker-1');
    monitor.setLeaseStatus(true);

    monitor.recordJobProcessed('sent');
    monitor.recordJobProcessed('sent');
    monitor.recordJobProcessed('expired');
    monitor.recordJobProcessed('failed');

    const status = monitor.getStatus();
    assert.strictEqual(status.workerId, 'test-worker-1');
    assert.strictEqual(status.hasActiveLease, true);
    assert.strictEqual(status.totalJobsProcessed, 4);
    assert.strictEqual(status.successfulSends, 2);
    assert.strictEqual(status.expiredCleanups, 1);
    assert.strictEqual(status.failedJobs, 1);
    assert.ok(status.uptimeSeconds >= 0);
    assert.ok(status.memoryUsageMb > 0);
  });
});

