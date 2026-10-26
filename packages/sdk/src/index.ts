/**
 * DZ Tracking SDK - Official Client Library
 * Post-purchase order tracking & COD return mitigation infrastructure
 */

import { DZTrackerClient } from './client';
import { setupAutoCapture } from './autocapture';
import { DZTrackerConfig, TrackOrderParams, TrackOrderResult, AutoCaptureOptions } from './types';

export { DZTrackerClient } from './client';
export { setupAutoCapture } from './autocapture';
export { OfflineQueue } from './queue';
export { normalizeAlgerianPhone, formatAlgerianPhoneDisplay } from './utils/phone';
export { useTracker } from './react';
export type { UseTrackerReturn } from './react';
export * from './types';

// Browser Global Singleton
let singletonClient: DZTrackerClient | null = null;
let autoCaptureCleanup: (() => void) | null = null;

/**
 * Initializes the global DZ Tracking client in browser environments.
 * Automatically activates declarative zero-code HTML Form auto-capture unless disabled.
 */
export function initTracker(config: DZTrackerConfig, options?: AutoCaptureOptions): DZTrackerClient {
  singletonClient = new DZTrackerClient(config);

  // Expose to window for debug / CDN users
  if (typeof window !== 'undefined') {
    (window as any).DZTracker = singletonClient;
  }

  // Setup Declarative HTML Form Auto-Capture
  if (config.autoCapture !== false) {
    if (autoCaptureCleanup) {
      autoCaptureCleanup();
    }
    autoCaptureCleanup = setupAutoCapture(singletonClient, options);
  }

  return singletonClient;
}

/**
 * Returns the currently initialized global DZTrackerClient instance.
 */
export function getTrackerClient(): DZTrackerClient {
  if (!singletonClient) {
    throw new Error(
      '[DZ Tracking SDK]: Tracker not initialized. Please call initTracker({ apiKey: "..." }) in your app root.'
    );
  }
  return singletonClient;
}

/**
 * Programmatically tracks an order using the initialized global client.
 */
export async function trackOrder(params: TrackOrderParams): Promise<TrackOrderResult> {
  const client = getTrackerClient();
  return client.trackOrder(params);
}

/**
 * Updates an order status (backward compatible signature).
 */
export async function updateStatus(orderId: string, status: string, description?: string): Promise<any> {
  const client = getTrackerClient();
  return client.updateStatus({ orderId, status, description });
}

/**
 * Tracks an order and automatically navigates the browser to the public tracking URL.
 */
export async function trackAndRedirect(params: TrackOrderParams): Promise<void> {
  const result = await trackOrder(params);
  if (typeof window !== 'undefined' && result.trackingUrl) {
    window.location.href = result.trackingUrl;
  }
}