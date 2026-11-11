import type { ReactNode } from 'react';

export interface DashboardFilterTabItem {
  value: string;
  label: ReactNode;
  count?: ReactNode;
  active: boolean;
  onSelect: () => void;
}

interface DashboardFilterTabsProps {
  items: DashboardFilterTabItem[];
  ariaLabel: string;
  className?: string;
}

/**
 * Shared status/filter controls for dashboard tabs.
 * Layout and active styling intentionally reuse the Orders/Exceptions toolbar classes.
 */
export function DashboardFilterTabs({
  items,
  ariaLabel,
  className = 'dz-shipment-status-tabs',
}: DashboardFilterTabsProps) {
  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={item.active}
          className={`dz-filter-btn ${item.active ? 'active' : ''}`}
          onClick={item.onSelect}
        >
          {item.label}
          {item.count != null && <span className="dz-filter-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
