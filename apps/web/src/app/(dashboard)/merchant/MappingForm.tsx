'use client';

import React, { useState } from 'react';
import { saveStatusMapping } from './actions';
import styles from './merchant.module.css';

export function MappingForm({ merchantId }: { merchantId: string }) {
  const [sourceStatus, setSourceStatus] = useState('');
  const [displayStatus, setDisplayStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('merchant_id', merchantId);
    formData.append('source_status', sourceStatus);
    formData.append('display_status', displayStatus);

    const res = await saveStatusMapping(formData);

    if (res?.error) {
      setFeedback({ message: res.error, isError: true });
    } else {
      setFeedback({ message: 'تم حفظ المطابقة بنجاح! ✅', isError: false });
      setSourceStatus('');
      setDisplayStatus('');
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <div className={styles.formGrid}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>الحالة في متجرك (الكود الخام):</label>
          <input
            type="text"
            placeholder="مثال: wc-processing أو shipped"
            value={sourceStatus}
            onChange={(e) => setSourceStatus(e.target.value)}
            required
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>ما يظهر للعميل في الرابط:</label>
          <input
            type="text"
            placeholder="مثال: قيد التجهيز في المستودع 📦"
            value={displayStatus}
            onChange={(e) => setDisplayStatus(e.target.value)}
            required
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.formActions}>
        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading ? 'جاري الحفظ...' : 'حفظ المطابقة'}
        </button>

        {feedback && (
          <span className={feedback.isError ? styles.feedbackError : styles.feedbackSuccess}>
            {feedback.message}
          </span>
        )}
      </div>
    </form>
  );
}