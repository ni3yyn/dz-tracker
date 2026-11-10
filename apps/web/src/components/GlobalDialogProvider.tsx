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
  const dialogRef = useRef<HTMLElement>(null);
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
    window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
  }, [activeDialog]);

  useEffect(() => {
    if (!activeDialog) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        activeDialog.resolve(false);
        setActiveDialog(null);
        return;
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
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
          data-dashboard-back-dismiss="global-dialog"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              finishDialog(false);
            }
          }}
        >
          <section
            ref={dialogRef}
            className={styles.dialog}
            data-tone={activeDialog.tone || 'info'}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`global-dialog-title-${activeDialog.id}`}
            aria-describedby={`global-dialog-message-${activeDialog.id}`}
            dir="rtl"
          >
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
                className={styles.confirmButton}
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
