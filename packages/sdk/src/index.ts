/**
 * DZ Tracking SDK main entry point, including the optional React hook.
 * Import "dz-tracking-sdk/core" in server-side projects that do not use React.
 */
export * from './core';
export { useTracker } from './react';
export type { UseTrackerReturn } from './react';
