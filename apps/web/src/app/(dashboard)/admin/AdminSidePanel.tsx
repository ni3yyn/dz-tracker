'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './admin-side-panel.module.css';

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

type DashboardBackKeyboardEvent = KeyboardEvent & {
  __tajerDashboardBackLayer?: string;
};

export default function AdminSidePanel({
  eyebrow,
  title,
  description,
  onClose,
  children,
  footer,
}: Props) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const notifyBackLayerChange = () => {
      window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const backLayer = (event as DashboardBackKeyboardEvent).__tajerDashboardBackLayer;
      if (backLayer && backLayer !== 'admin-side-panel') return;

      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };

    notifyBackLayerChange();
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      notifyBackLayerChange();
    };
  }, []);

  return (
    <div
      className={styles.backdrop}
      data-dashboard-back-dismiss="admin-side-panel"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} dir="rtl">
        <header className={styles.header}>
          <div className={styles.heading}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className={styles.closeButton} onClick={() => onCloseRef.current()} aria-label="إغلاق اللوحة">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </aside>
    </div>
  );
}
