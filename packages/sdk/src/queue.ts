/**
 * Resilient Offline Queue & Beacon Dispatcher for Algerian Mobile Connectivity
 */

const STORAGE_KEY = '__dz_pending_events__';
const MAX_QUEUE_SIZE = 50;

export interface QueuedEvent {
  id: string;
  url: string;
  apiKey: string;
  payload: any;
  timestamp: number;
  retries: number;
}

export class OfflineQueue {
  private static isInitialized = false;

  /**
   * Initializes network listeners in browser environments
   */
  static init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    window.addEventListener('online', () => {
      this.flush();
    });

    // Flush whenever page loads
    if (document.readyState === 'complete') {
      this.flush();
    } else {
      window.addEventListener('load', () => this.flush());
    }
  }

  /**
   * Dispatches payload using standard fetch with timeout, falling back to beacon and offline storage
   */
  static async send(url: string, apiKey: string, payload: any, timeoutMs = 3500): Promise<{ ok: boolean; data?: any; error?: any }> {
    // 1. In browser, if offline, queue immediately
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.enqueue(url, apiKey, payload);
      return { ok: false, error: new Error('Device is offline. Event queued for retry.') };
    }

    // 2. Attempt fetch with AbortController timeout
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
        keepalive: true, // Allows request to outlive page unload
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: true, data };
      } else {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        return { ok: false, error: err };
      }
    } catch (networkErr: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // Try sendBeacon as fallback if page is unloading
      const beaconSent = this.sendViaBeacon(url, apiKey, payload);
      if (!beaconSent) {
        this.enqueue(url, apiKey, payload);
      }

      return { ok: false, error: networkErr };
    }
  }

  /**
   * Sends using navigator.sendBeacon during page exit/redirect
   */
  static sendViaBeacon(url: string, apiKey: string, payload: any): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return false;
    }

    try {
      // Pass apiKey in query parameter so beacon doesn't need custom headers
      const targetUrl = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      targetUrl.searchParams.set('key', apiKey);

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return navigator.sendBeacon(targetUrl.toString(), blob);
    } catch {
      return false;
    }
  }

  /**
   * Enqueues an event to LocalStorage
   */
  static enqueue(url: string, apiKey: string, payload: any) {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

    try {
      const queue = this.getQueue();
      if (queue.length >= MAX_QUEUE_SIZE) {
        queue.shift(); // Evict oldest
      }

      queue.push({
        id: Math.random().toString(36).substring(2, 10),
        url,
        apiKey,
        payload,
        timestamp: Date.now(),
        retries: 0,
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // Storage quota exceeded or disabled
    }
  }

  /**
   * Flushes queued events
   */
  static async flush() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

    const queue = this.getQueue();
    if (queue.length === 0) return;

    const remaining: QueuedEvent[] = [];

    for (const item of queue) {
      try {
        const res = await fetch(item.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': item.apiKey,
          },
          body: JSON.stringify(item.payload),
        });

        if (!res.ok && res.status >= 500 && item.retries < 3) {
          item.retries += 1;
          remaining.push(item);
        }
      } catch {
        if (item.retries < 3) {
          item.retries += 1;
          remaining.push(item);
        }
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch {}
  }

  private static getQueue(): QueuedEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}
