import type { ReactNode } from 'react';
import styles from './admin.module.css';

interface AdminDataTableProps {
  columns: ReactNode[];
  children: ReactNode;
  header?: ReactNode;
  maxHeight?: string | number;
  footer?: ReactNode;
  container?: boolean;
  scrollArea?: boolean;
}

/**
 * Shared admin table markup and styling.
 * Use the full frame by default, or render only the table inside an existing
 * table container/scroll area when composing it with an existing admin header.
 */
export function AdminDataTable({
  columns,
  children,
  header,
  maxHeight,
  footer,
  container = true,
  scrollArea = true,
}: AdminDataTableProps) {
  const table = (
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
  );

  const content = scrollArea ? (
    <div
      className={styles.tableScrollArea}
      style={maxHeight == null ? undefined : { maxHeight }}
    >
      {table}
      {footer}
    </div>
  ) : (
    <>
      {table}
      {footer}
    </>
  );

  if (!container) return content;

  return (
    <div className={styles.tableContainer}>
      {header}
      {content}
    </div>
  );
}
