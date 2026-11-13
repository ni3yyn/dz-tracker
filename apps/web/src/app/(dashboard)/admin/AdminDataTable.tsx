import type { ReactNode } from 'react';
import styles from './admin.module.css';

interface AdminDataTableProps {
  columns: ReactNode[];
  children: ReactNode;
  header?: ReactNode;
  maxHeight?: string | number;
  footer?: ReactNode;
}

/**
 * Shared admin table frame.
 * Every admin table uses the same container, scroll area, header cells and row styling.
 */
export function AdminDataTable({
  columns,
  children,
  header,
  maxHeight,
  footer,
}: AdminDataTableProps) {
  return (
    <div className={styles.tableContainer}>
      {header}
      <div
        className={styles.tableScrollArea}
        style={maxHeight == null ? undefined : { maxHeight }}
      >
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={index}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
        {footer}
      </div>
    </div>
  );
}
