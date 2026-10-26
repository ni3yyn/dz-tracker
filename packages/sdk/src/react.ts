/**
 * React & Next.js Hooks & Component Bindings for DZ Tracking SDK
 */

import React, { useState, useCallback } from 'react';
import { DZTrackerClient } from './client';
import { DZTrackerConfig, TrackOrderParams, TrackOrderResult, UpdateStatusParams } from './types';
import { getTrackerClient } from './index';

export interface UseTrackerReturn {
  track: (params: TrackOrderParams) => Promise<TrackOrderResult>;
  updateStatus: (params: UpdateStatusParams) => Promise<any>;
  isLoading: boolean;
  lastResult: TrackOrderResult | null;
  error: Error | null;
}

/**
 * React Hook for programmatic order tracking and state updates
 */
export function useTracker(config?: DZTrackerConfig): UseTrackerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<TrackOrderResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback(() => {
    if (config) {
      return new DZTrackerClient(config);
    }
    return getTrackerClient();
  }, [config]);

  const track = useCallback(
    async (params: TrackOrderParams): Promise<TrackOrderResult> => {
      setIsLoading(true);
      setError(null);
      try {
        const client = getClient();
        const result = await client.trackOrder(params);
        setLastResult(result);
        return result;
      } catch (err: any) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [getClient]
  );

  const updateStatus = useCallback(
    async (params: UpdateStatusParams): Promise<any> => {
      setIsLoading(true);
      setError(null);
      try {
        const client = getClient();
        return await client.updateStatus(params);
      } catch (err: any) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [getClient]
  );

  return {
    track,
    updateStatus,
    isLoading,
    lastResult,
    error,
  };
}
