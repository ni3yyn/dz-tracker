'use client';

import React from 'react';
import styles from './merchant.module.css';

interface MerchantErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MerchantError({ error, reset }: MerchantErrorProps) {
  return (
    <div className={styles.container}>
      <div className={styles.errorBoundaryCard}>
        <div className={styles.errorBoundaryIcon} aria-hidden="true">!</div>
        <h2 className={styles.errorBoundaryTitle}>تعذر تحميل لوحة تحكم التاجر</h2>
        <p className={styles.errorBoundaryDesc}>
          {error?.message || 'حدث خطأ غير متوقع أثناء معالجة بيانات الشحنات أو استرداد الجلسة. اضغط أدناه لإعادة المحاولة.'}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className={styles.errorBoundaryRetryBtn}
        >
          إعادة المحاولة وتحديث البيانات ↻
        </button>
      </div>
    </div>
  );
}
