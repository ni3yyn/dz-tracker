'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './global-dialog.module.css';

export type GlobalDialogTone = 'danger' | 'warning' | 'info';

export interface GlobalDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: GlobalDialogTone;
}

type DialogType = 'alert' | 'confirm';

interface DialogRequest extends GlobalDialogOptions {
  id: number;
  type: DialogType;
  resolve: (confirmed: boolean) => void;
}

interface GlobalDialogContextValue {
  alert: (options: GlobalDialogOptions) => Promise<void>;
  confirm: (options: GlobalDialogOptions) => Promise<boolean>;
}

const GlobalDialogContext = createContext<GlobalDialogContextValue | null>(null);

export function GlobalDialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [activeDialog, setActiveDialog] = useState<DialogRequest | null>(null);
  const nextId = useRef(0);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const enqueue = useCallback(
    (type: DialogType, options: GlobalDialogOptions) =>
      new Promise<boolean>((resolve) => {
        const request: DialogRequest = {
          id: ++nextId.current,
          type,
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          tone: options.tone || 'info',
          resolve,
        };

        setQueue((current) => [...current, request]);
      }),
    []
  );

  const alert = useCallback(
    async (options: GlobalDialogOptions) => {
      await enqueue('alert', options);
    },
    [enqueue]
  );

  const confirm = useCallback(
    (options: GlobalDialogOptions) => enqueue('confirm', options),
    [enqueue]
  );

  useEffect(() => {
    if (!activeDialog && queue.length > 0) {
      setActiveDialog(queue[0]);
      setQueue((current) => current.slice(1));
    }
  }, [activeDialog, queue]);

  useEffect(() => {
    if (!activeDialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        activeDialog.resolve(false);
        setActiveDialog(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDialog]);

  const finishDialog = (confirmed: boolean) => {
    if (!activeDialog) return;
    activeDialog.resolve(confirmed);
    setActiveDialog(null);
  };

  const value: GlobalDialogContextValue = { alert, confirm };

  return (
    <GlobalDialogContext.Provider value={value}>
      {children}

      {activeDialog && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              finishDialog(false);
            }
          }}
        >
          <section
            className={styles.dialog}
            role={activeDialog.type === 'confirm' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={`global-dialog-title-${activeDialog.id}`}
            aria-describedby={`global-dialog-message-${activeDialog.id}`}
            dir="rtl"
          >
            <div
              className={`${styles.icon} ${
                activeDialog.tone === 'danger'
                  ? styles.iconDanger
                  : activeDialog.tone === 'warning'
                    ? styles.iconWarning
                    : styles.iconInfo
              }`}
              aria-hidden="true"
            >
              {activeDialog.tone === 'danger' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
              ) : activeDialog.tone === 'warning' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5" />
                  <path d="M12 8h.01" />
                </svg>
              )}
            </div>

            <h2 id={`global-dialog-title-${activeDialog.id}`} className={styles.title}>
              {activeDialog.title || (activeDialog.type === 'confirm' ? 'تأكيد الإجراء' : 'تنبيه')}
            </h2>
            <p id={`global-dialog-message-${activeDialog.id}`} className={styles.message}>
              {activeDialog.message}
            </p>

            <div className={styles.actions}>
              {activeDialog.type === 'confirm' && (
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => finishDialog(false)}
                >
                  {activeDialog.cancelLabel || 'إلغاء'}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                type="button"
                className={`${styles.confirmButton} ${
                  activeDialog.tone === 'danger' ? styles.confirmDanger : ''
                }`}
                onClick={() => finishDialog(true)}
              >
                {activeDialog.confirmLabel || (activeDialog.type === 'confirm' ? 'تأكيد' : 'حسناً')}
              </button>
            </div>
          </section>
        </div>
      )}
    </GlobalDialogContext.Provider>
  );
}

export function useGlobalDialog(): GlobalDialogContextValue {
  const context = useContext(GlobalDialogContext);
  if (!context) {
    throw new Error('useGlobalDialog must be used within GlobalDialogProvider');
  }
  return context;
}
