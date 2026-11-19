import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MerchantDashboardTab } from './DashboardSidebar';

interface DashboardPanelTransitionProps {
  transitionKey: string;
  children: ReactNode;
  tabOrder: Record<MerchantDashboardTab, number>;
}

export function DashboardPanelTransition({
  transitionKey,
  children,
  tabOrder,
}: DashboardPanelTransitionProps) {
  const previousKeyRef = useRef(transitionKey);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const [hasTabTransitioned, setHasTabTransitioned] = useState(false);

  useLayoutEffect(() => {
    const previousKey = previousKeyRef.current;
    if (previousKey === transitionKey) return;

    const previousIndex = tabOrder[previousKey as MerchantDashboardTab];
    const nextIndex = tabOrder[transitionKey as MerchantDashboardTab];
    setDirection(
      previousIndex !== undefined && nextIndex !== undefined && nextIndex < previousIndex
        ? 'previous'
        : 'next'
    );
    previousKeyRef.current = transitionKey;
    setHasTabTransitioned(true);
  }, [tabOrder, transitionKey]);

  return (
    <div className="dz-dashboard-transition-frame">
      <div className="dz-dashboard-transition-measure">
        <div
          key={transitionKey}
          className={'dz-dashboard-transition-content' + (hasTabTransitioned ? ' is-animated' : '')}
          data-direction={direction}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
