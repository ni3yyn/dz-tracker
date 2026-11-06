export interface WorkerHealthStatus {
  workerId: string;
  uptimeSeconds: number;
  memoryUsageMb: number;
  hasActiveLease: boolean;
  totalJobsProcessed: number;
  successfulSends: number;
  skippedJobs: number;
  failedJobs: number;
  lastHeartbeatAt: string;
}

export class WorkerHealthMonitor {
  private startTime = Date.now();
  private jobsProcessed = 0;
  private sendsCount = 0;
  private skippedCount = 0;
  private failedCount = 0;
  private activeLease = false;

  constructor(private readonly workerId: string) {}

  setLeaseStatus(active: boolean): void {
    this.activeLease = active;
  }

  recordJobProcessed(outcome: 'sent' | 'skipped' | 'failed'): void {
    this.jobsProcessed++;
    if (outcome === 'sent') this.sendsCount++;
    if (outcome === 'skipped') this.skippedCount++;
    if (outcome === 'failed') this.failedCount++;
  }

  getStatus(): WorkerHealthStatus {
    const memory = process.memoryUsage();
    return {
      workerId: this.workerId,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsageMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      hasActiveLease: this.activeLease,
      totalJobsProcessed: this.jobsProcessed,
      successfulSends: this.sendsCount,
      skippedJobs: this.skippedCount,
      failedJobs: this.failedCount,
      lastHeartbeatAt: new Date().toISOString(),
    };
  }
}

