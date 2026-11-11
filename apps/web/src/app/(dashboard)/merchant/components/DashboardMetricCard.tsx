import type { ReactNode } from 'react';

interface DashboardMetricCardProps {
  as: 'button' | 'div';
  label: ReactNode;
  value: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Shared KPI markup with an explicit element mode. Overview metrics remain buttons
 * and Analytics metrics remain static divs, preserving their original semantics.
 */
export function DashboardMetricCard({
  as,
  label,
  value,
  className = 'dz-overview-kpi',
  onClick,
}: DashboardMetricCardProps) {
  const content = (
    <>
      <span className="dz-overview-kpi-label">{label}</span>
      <strong className="dz-overview-kpi-value">{value}</strong>
    </>
  );

  if (as === 'button') {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
