'use client';

import { useFormStatus } from 'react-dom';
import styles from './connect.module.css';

export default function PairingSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.action} type="submit" disabled={pending} aria-busy={pending}>
      <span className={styles.submitContent}>
        {pending && <span className={styles.spinner} aria-hidden="true" />}
        <span>{pending ? 'جارٍ تجهيز الربط...' : 'ربط هذا الهاتف'}</span>
      </span>
    </button>
  );
}
