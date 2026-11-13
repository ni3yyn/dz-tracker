'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
  const [isClosing, setIsClosing] = useState(false);
  const closeStartedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const beginClose = () => {
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;
    setIsClosing(true);
  };

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
      beginClose();
    };

    const handleRequestedClose = () => beginClose();
    notifyBackLayerChange();
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('tajer-dashboard-side-panel-close', handleRequestedClose);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('tajer-dashboard-side-panel-close', handleRequestedClose);
      notifyBackLayerChange();
    };
  }, []);

  return (
    <div
      className={isClosing ? styles.backdropClosing : styles.backdrop}
      data-dashboard-back-dismiss="admin-side-panel"
      aria-hidden={isClosing}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) beginClose();
      }}
    >
      <aside
        className={isClosing ? styles.panelClosing : styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && isClosing) {
            onCloseRef.current();
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className={styles.closeButton} onClick={beginClose} aria-label="إغلاق اللوحة" disabled={isClosing}>
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
