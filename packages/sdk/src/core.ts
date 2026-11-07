/**
 * Framework-neutral DZ Tracking SDK entry point.
 * Import from "dz-tracking-sdk/core" in server-side and non-React projects.
 */
import { DZTrackerClient } from './client';
import { setupAutoCapture } from './autocapture';
import { DZTrackerConfig, TrackOrderParams, TrackOrderResult, AutoCaptureOptions } from './types';

export { DZTrackerClient } from './client';
export { setupAutoCapture } from './autocapture';
export { OfflineQueue } from './queue';
export { normalizeAlgerianPhone, formatAlgerianPhoneDisplay } from './utils/phone';
export * from './types';

let singletonClient: DZTrackerClient | null = null;
let autoCaptureCleanup: (() => void) | null = null;

export function initTracker(config: DZTrackerConfig, options?: AutoCaptureOptions): DZTrackerClient {
  singletonClient = new DZTrackerClient(config);
  if (typeof window !== 'undefined') (window as any).DZTracker = singletonClient;

  autoCaptureCleanup?.();
  autoCaptureCleanup = null;
  if (config.autoCapture !== false) {
    autoCaptureCleanup = setupAutoCapture(singletonClient, options);
  }
  return singletonClient;
}

export function getTrackerClient(): DZTrackerClient {
  if (!singletonClient) {
    throw new Error('[DZ Tracking SDK]: Tracker not initialized. Call initTracker({ apiKey: "..." }) first.');
  }
  return singletonClient;
}

export async function trackOrder(params: TrackOrderParams): Promise<TrackOrderResult> {
  return getTrackerClient().trackOrder(params);
}

export async function updateStatus(orderId: string, status: string, description?: string): Promise<any> {
  return getTrackerClient().updateStatus({ orderId, status, description });
}

export async function trackAndRedirect(params: TrackOrderParams): Promise<void> {
  const result = await trackOrder(params);
  if (!result.success || !result.trackingUrl) {
    throw new Error(result.error || 'DZ Tracker could not confirm this order; no tracking page is available.');
  }
  if (typeof window !== 'undefined') window.location.href = result.trackingUrl;
}
