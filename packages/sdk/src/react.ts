/**
 * React & Next.js hook for client-side tracking.
 * Browser hooks expose the configured merchant API key to visitors; a server route
 * or Server Action is preferred for production integrations.
 */
import React, { useState, useCallback } from 'react';
import { DZTrackerClient } from './client';
import { DZTrackerConfig, TrackOrderParams, TrackOrderResult, UpdateStatusParams } from './types';
import { getTrackerClient } from './core';

export interface UseTrackerReturn {
  track: (params: TrackOrderParams) => Promise<TrackOrderResult>;
  updateStatus: (params: UpdateStatusParams) => Promise<any>;
  isLoading: boolean;
  lastResult: TrackOrderResult | null;
  error: Error | null;
}

export function useTracker(config?: DZTrackerConfig): UseTrackerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<TrackOrderResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback(() => config ? new DZTrackerClient(config) : getTrackerClient(), [config]);

  const track = useCallback(async (params: TrackOrderParams): Promise<TrackOrderResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getClient().trackOrder(params);
      setLastResult(result);
      if (!result.success) setError(new Error(result.error || 'Tracking registration was not confirmed.'));
      return result;
    } catch (err: any) {
      const trackingError = err instanceof Error ? err : new Error(String(err));
      setError(trackingError);
      throw trackingError;
    } finally {
      setIsLoading(false);
    }
  }, [getClient]);

  const updateStatus = useCallback(async (params: UpdateStatusParams): Promise<any> => {
    setIsLoading(true);
    setError(null);
    try {
      return await getClient().updateStatus(params);
    } catch (err: any) {
      const trackingError = err instanceof Error ? err : new Error(String(err));
      setError(trackingError);
      throw trackingError;
    } finally {
      setIsLoading(false);
    }
  }, [getClient]);

  return { track, updateStatus, isLoading, lastResult, error };
}
