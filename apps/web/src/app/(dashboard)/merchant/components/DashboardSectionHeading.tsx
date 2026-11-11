import type { ReactNode } from 'react';

interface DashboardSectionHeadingProps {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/**
 * Shared heading used by Overview and Analytics sections. Keep the existing DOM
 * hierarchy and dashboard class names; presentation continues to live in the
 * merchant dashboard stylesheet.
 */
export function DashboardSectionHeading({
  id,
  title,
  description,
  action,
}: DashboardSectionHeadingProps) {
  return (
    <div className="dz-overview-section-head">
      <div>
        <h2 id={id} className="dz-overview-section-title">{title}</h2>
        {description != null && (
          <span className="dz-overview-section-subtitle">{description}</span>
        )}
      </div>
      {action}
    </div>
  );
}
