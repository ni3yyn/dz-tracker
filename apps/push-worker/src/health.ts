export interface PushWorkerHealthStatus {
  workerId: string;
  uptimeSeconds: number;
  memoryUsageMb: number;
  hasActiveLease: boolean;
  totalJobsProcessed: number;
  successfulSends: number;
  expiredCleanups: number;
  failedJobs: number;
  lastHeartbeatAt: string;
}

export class PushWorkerHealthMonitor {
  private startTime = Date.now();
  private jobsProcessed = 0;
  private sendsCount = 0;
  private expiredCleanups = 0;
  private failedCount = 0;
  private activeLease = false;

  constructor(private readonly workerId: string) {}

  setLeaseStatus(active: boolean): void {
    this.activeLease = active;
  }

  recordJobProcessed(outcome: 'sent' | 'expired' | 'failed'): void {
    this.jobsProcessed++;
    if (outcome === 'sent') this.sendsCount++;
    if (outcome === 'expired') this.expiredCleanups++;
    if (outcome === 'failed') this.failedCount++;
  }

  getStatus(): PushWorkerHealthStatus {
    const memory = process.memoryUsage();
    return {
      workerId: this.workerId,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsageMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      hasActiveLease: this.activeLease,
      totalJobsProcessed: this.jobsProcessed,
      successfulSends: this.sendsCount,
      expiredCleanups: this.expiredCleanups,
      failedJobs: this.failedCount,
      lastHeartbeatAt: new Date().toISOString(),
    };
  }
}

