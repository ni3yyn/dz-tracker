import crypto from 'node:crypto';

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  cachedResult?: any;
  fingerprint: string;
}

export interface IdempotencyRecord {
  fingerprint: string;
  timestamp: number;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
}

export class IdempotencyEngine {
  // Sliding TTL cache to absorb burst retries within the runtime instance
  private static cache: Map<string, IdempotencyRecord> = new Map();
  // Default TTL window: 120 seconds (2 minutes)
  private static readonly TTL_MS = 120 * 1000;
  // Maximum cache size to prevent memory leaks in sustained runtimes
  private static readonly MAX_ENTRIES = 5000;

  /**
   * Generates a deterministic SHA-256 fingerprint for incoming webhook event.
   */
  static generateFingerprint(params: {
    merchantId: string;
    source: string;
    externalOrderId?: string | null;
    carrierTrackingNumber?: string | null;
    statusRaw?: string | null;
    payloadSnippet?: any;
  }): string {
    const normMerchant = (params.merchantId || '').trim();
    const normSource = (params.source || '').trim().toLowerCase();
    const normOrder = (params.externalOrderId || '').trim();
    const normTracking = (params.carrierTrackingNumber || '').trim();
    const normStatus = (params.statusRaw || '').trim().toLowerCase();
    
    // We include payload digest if available, else identity coordinates
    let payloadDigest = '';
    if (params.payloadSnippet) {
      try {
        const rawString = typeof params.payloadSnippet === 'string'
          ? params.payloadSnippet
          : JSON.stringify(params.payloadSnippet);
        payloadDigest = crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 16);
      } catch {
        payloadDigest = 'raw_error';
      }
    }

    const rawKey = `${normMerchant}:${normSource}:${normOrder || normTracking || 'no_id'}:${normStatus}:${payloadDigest}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Checks if an event is currently being processed or was processed recently.
   */
  static check(fingerprint: string): IdempotencyCheckResult {
    this.evictExpired();

    const record = this.cache.get(fingerprint);
    if (!record) {
      return { isDuplicate: false, fingerprint };
    }

    const now = Date.now();
    if (now - record.timestamp > this.TTL_MS) {
      this.cache.delete(fingerprint);
      return { isDuplicate: false, fingerprint };
    }

    return {
      isDuplicate: true,
      cachedResult: record.result,
      fingerprint,
    };
  }

  /**
   * Marks a fingerprint as in-flight / processing.
   */
  static acquire(fingerprint: string): boolean {
    this.evictExpired();

    const existing = this.cache.get(fingerprint);
    if (existing && Date.now() - existing.timestamp <= this.TTL_MS) {
      return false; // Already locked / processed
    }

    // Limit cache size if too large
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(fingerprint, {
      fingerprint,
      timestamp: Date.now(),
      status: 'processing',
    });

    return true;
  }

  /**
   * Finalizes the record with success and caches the response.
   */
  static complete(fingerprint: string, result: any): void {
    const record = this.cache.get(fingerprint);
    if (record) {
      record.status = 'completed';
      record.result = result;
      record.timestamp = Date.now(); // Reset TTL window on completion
    } else {
      this.cache.set(fingerprint, {
        fingerprint,
        timestamp: Date.now(),
        status: 'completed',
        result,
      });
    }
  }

  /**
   * Releases or clears on failure to allow immediate retry if necessary.
   */
  static release(fingerprint: string): void {
    this.cache.delete(fingerprint);
  }

  /**
   * Garbage collects expired keys.
   */
  private static evictExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears entire cache (useful for testing).
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Returns telemetry statistics for monitoring.
   */
  static getStats(): { size: number; maxEntries: number; ttlMs: number } {
    this.evictExpired();
    return {
      size: this.cache.size,
      maxEntries: this.MAX_ENTRIES,
      ttlMs: this.TTL_MS,
    };
  }
}
