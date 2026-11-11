import type { CSSProperties, ReactNode } from 'react';

interface OrderDetailFieldProps {
  label: ReactNode;
  children: ReactNode;
  dir?: 'ltr' | 'rtl' | 'auto';
  style?: CSSProperties;
  valueStyle?: CSSProperties;
}

/**
 * Shared order metadata field. The class names and element hierarchy intentionally
 * match the original inline markup so the existing dashboard CSS remains authoritative.
 */
export function OrderDetailField({
  label,
  children,
  dir,
  style,
  valueStyle,
}: OrderDetailFieldProps) {
  return (
    <div className="dz-order-detail-field" style={style}>
      <span>{label}</span>
      <strong dir={dir} style={valueStyle}>{children}</strong>
    </div>
  );
}
