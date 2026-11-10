'use client';

import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface DashboardBackHandlerOptions<TTab extends string> {
  scope: string;
  activeTab: TTab;
  setActiveTab: Dispatch<SetStateAction<TTab>>;
  onBack: () => boolean;
}

/**
 * Gives dashboard-local UI priority over leaving the route with the browser or
 * Android system Back action. Transient surfaces close first; then tab changes
 * unwind in reverse order. Once the dashboard has nothing to unwind, Back is
 * allowed to leave the route normally.
 */
export function useDashboardBackHandler<TTab extends string>({
  scope,
  activeTab,
  setActiveTab,
  onBack,
}: DashboardBackHandlerOptions<TTab>) {
  const tabHistoryRef = useRef<TTab[]>([]);
  const activeTabRef = useRef(activeTab);
  const skipNextTabHistoryRef = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const previousTab = activeTabRef.current;
    if (previousTab === activeTab) return;

    activeTabRef.current = activeTab;
    if (skipNextTabHistoryRef.current) {
      skipNextTabHistoryRef.current = false;
      return;
    }

    tabHistoryRef.current.push(previousTab);
    if (tabHistoryRef.current.length > 40) {
      tabHistoryRef.current.shift();
    }
  }, [activeTab]);

  useEffect(() => {
    const dashboardUrl = window.location.href;
    const dashboardHistoryState = window.history.state;

    const handlePopState = (event: PopStateEvent) => {
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

      // Next.js also listens for popstate. Stop this traversal from navigating
      // away while an in-dashboard surface or previous tab is being restored.
      event.stopImmediatePropagation();
      const state = dashboardHistoryState && typeof dashboardHistoryState === 'object'
        ? { ...dashboardHistoryState as Record<string, unknown> }
        : {};
      window.history.pushState(
        { ...state, __tajerDashboardBackScope: scope },
        '',
        dashboardUrl
      );
    };

    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, [scope, setActiveTab]);
}
