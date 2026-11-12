import type { ReactNode } from 'react';

interface DashboardMetricCardProps {
  as: 'button' | 'div';
  label: ReactNode;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
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
  labelClassName = 'dz-overview-kpi-label',
  valueClassName = 'dz-overview-kpi-value',
  description,
  descriptionClassName = 'dz-overview-kpi-description',
  onClick,
}: DashboardMetricCardProps) {
  const content = (
    <>
      <span className={labelClassName}>{label}</span>
      <strong className={valueClassName}>{value}</strong>
      {description != null && <span className={descriptionClassName}>{description}</span>}
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
