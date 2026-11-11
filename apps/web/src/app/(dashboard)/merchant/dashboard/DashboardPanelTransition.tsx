import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  const measureRef = useRef<HTMLDivElement | null>(null);
  const previousKeyRef = useRef(transitionKey);
  const animationFrameRef = useRef<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');

  const measure = useCallback(() => {
    const content = measureRef.current;
    if (!content) return;
    const nextHeight = Math.ceil(content.getBoundingClientRect().height);
    setHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  useLayoutEffect(() => {
    const content = measureRef.current;
    if (!content) return;

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(content);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

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

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(measure);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [measure, transitionKey]);

  return (
    <div
      className="dz-dashboard-transition-frame"
      style={{ height: height === null ? 'auto' : `${height}px` }}
    >
      <div ref={measureRef} className="dz-dashboard-transition-measure">
        <div
          key={transitionKey}
          className="dz-dashboard-transition-content"
          data-direction={direction}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
