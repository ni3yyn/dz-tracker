'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface DashboardBackHandlerOptions<TTab extends string> {
  scope: string;
  activeTab: TTab;
  setActiveTab: Dispatch<SetStateAction<TTab>>;
  hasActiveOverlay: boolean;
  onBack: () => boolean;
}

type DashboardHistoryState = Record<string, unknown> & {
  __tajerDashboardBackScope?: string;
  __tajerDashboardBackPath?: string;
};

const BACK_LAYER_CHANGE_EVENT = 'tajer-dashboard-back-layer-change';

/**
 * Keeps an in-dashboard history guard only while there is something local to
 * dismiss or a previous dashboard tab to revisit. This means the first Back
 * closes the topmost open layer; it doesn't consume an otherwise normal Back
 * press when the dashboard has nothing left to unwind.
 */
export function useDashboardBackHandler<TTab extends string>({
  scope,
  activeTab,
  setActiveTab,
  hasActiveOverlay,
  onBack,
}: DashboardBackHandlerOptions<TTab>) {
  const tabHistoryRef = useRef<TTab[]>([]);
  const activeTabRef = useRef(activeTab);
  const skipNextTabHistoryRef = useRef(false);
  const onBackRef = useRef(onBack);
  const hasActiveOverlayRef = useRef(hasActiveOverlay);
  const guardEntryRef = useRef(false);
  const programmaticPopRef = useRef(false);
  const dashboardUrlRef = useRef('');
  const dashboardStateRef = useRef<DashboardHistoryState>({});

  onBackRef.current = onBack;
  hasActiveOverlayRef.current = hasActiveOverlay;

  const markerPath = useCallback(() => (
    typeof window === 'undefined' ? '' : window.location.pathname + window.location.search
  ), []);

  const reconcileHistoryGuard = useCallback(() => {
    if (typeof window === 'undefined') return;

    const currentState = (window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {}) as DashboardHistoryState;
    const currentPath = markerPath();
    const markerMatches = currentState.__tajerDashboardBackScope === scope
      && currentState.__tajerDashboardBackPath === currentPath;
    const hasOpenBackLayer = typeof document !== 'undefined'
      && document.querySelector('[data-dashboard-back-dismiss]') !== null;
    const hasBackTarget = hasActiveOverlayRef.current
      || hasOpenBackLayer
      || tabHistoryRef.current.length > 0;

    if (hasBackTarget) {
      if (!markerMatches) {
        window.history.pushState(
          {
            ...currentState,
            __tajerDashboardBackScope: scope,
            __tajerDashboardBackPath: currentPath,
          },
          '',
          window.location.href
        );
      }
      guardEntryRef.current = true;
      return;
    }

    if (guardEntryRef.current && markerMatches) {
      guardEntryRef.current = false;
      programmaticPopRef.current = true;
      window.history.back();
      return;
    }

    guardEntryRef.current = false;
  }, [markerPath, scope]);

  useLayoutEffect(() => {
    const previousTab = activeTabRef.current;
    if (previousTab !== activeTab) {
      activeTabRef.current = activeTab;
      if (skipNextTabHistoryRef.current) {
        skipNextTabHistoryRef.current = false;
      } else {
        tabHistoryRef.current.push(previousTab);
        if (tabHistoryRef.current.length > 40) tabHistoryRef.current.shift();
      }
    }

    reconcileHistoryGuard();
  }, [activeTab, hasActiveOverlay, reconcileHistoryGuard]);

  useEffect(() => {
    const currentState = (window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {}) as DashboardHistoryState;
    dashboardUrlRef.current = window.location.href;
    dashboardStateRef.current = { ...currentState };
    guardEntryRef.current = currentState.__tajerDashboardBackScope === scope
      && currentState.__tajerDashboardBackPath === markerPath();

    const handleBackLayerChange = () => reconcileHistoryGuard();
    const handlePopState = (event: PopStateEvent) => {
      if (programmaticPopRef.current) {
        programmaticPopRef.current = false;
        guardEntryRef.current = false;
        event.stopImmediatePropagation();
        return;
      }

      const hadGuardEntry = guardEntryRef.current;
      guardEntryRef.current = false;

      let handled = onBackRef.current();
      if (!handled && tabHistoryRef.current.length > 0) {
        const previousTab = tabHistoryRef.current.pop();
        if (previousTab !== undefined) {
          skipNextTabHistoryRef.current = true;
          setActiveTab(previousTab);
          handled = true;
        }
      }

      if (!handled) return;

      // Prevent Next.js from processing the same pop and routing to "/".
      event.stopImmediatePropagation();

      // Defensive recovery for a platform that emits Back before the guard was
      // committed: restore the dashboard entry before reconciling its open layer.
      if (!hadGuardEntry && window.location.href !== dashboardUrlRef.current) {
        window.history.pushState(
          dashboardStateRef.current,
          '',
          dashboardUrlRef.current
        );
      }

      reconcileHistoryGuard();
      window.requestAnimationFrame(reconcileHistoryGuard);
    };

    window.addEventListener('popstate', handlePopState, true);
    window.addEventListener(BACK_LAYER_CHANGE_EVENT, handleBackLayerChange);
    reconcileHistoryGuard();

    return () => {
      window.removeEventListener('popstate', handlePopState, true);
      window.removeEventListener(BACK_LAYER_CHANGE_EVENT, handleBackLayerChange);
    };
  }, [markerPath, reconcileHistoryGuard, scope, setActiveTab]);
}
