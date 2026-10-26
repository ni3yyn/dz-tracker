'use client';

import React from 'react';
import styles from './t.module.css';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TrackingError({ error, reset }: ErrorProps) {
  return (
    <main className={styles.pageContainer}>
      <div className={styles.errorCard}>
        <div className={styles.errorIcon} aria-hidden="true">!</div>
        <h2 className={styles.errorTitle}>عذراً، حدث خطأ أثناء تحميل تتبع الشحنة</h2>
        <p className={styles.errorDesc}>
          {error?.message || 'تعذر الاتصال بخدمة التتبع المباشر. يرجى المحاولة مرة أخرى أو التأكد من صحة الرابط.'}
        </p>
        <div className={styles.errorActions}>
          <button type="button" onClick={() => reset()} className={styles.retryBtn}>
            إعادة المحاولة ↻
          </button>
          <a href="/" className={styles.homeLink}>
            الصفحة الرئيسية ⌂
          </a>
        </div>
      </div>
    </main>
  );
}
