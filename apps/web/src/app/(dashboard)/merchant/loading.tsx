import React from 'react';
import styles from './merchant.module.css';

export default function MerchantLoading() {
  return (
    <div className={styles.container}>
      {/* Top Header Skeleton */}
      <header className={styles.topHeader}>
        <div className={styles.brandInfo}>
          <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '48px', height: '48px', borderRadius: '12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '160px', height: '26px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '240px', height: '14px' }} />
          </div>
        </div>

        <div className={styles.headerActions}>
          <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '140px', height: '36px' }} />
          <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '220px', height: '36px' }} />
        </div>
      </header>

      {/* KPI Grid Skeleton */}
      <section className={styles.kpiGrid}>
        {[1, 2, 3, 4, 5].map((kpi) => (
          <div key={kpi} className={styles.kpiCard} style={{ gap: '10px' }}>
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '50%', height: '14px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '35%', height: '32px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '70%', height: '12px' }} />
          </div>
        ))}
      </section>

      {/* Tabs Skeleton */}
      <nav className={styles.tabsNav} style={{ gap: '12px' }}>
        {[120, 150, 140, 130, 160].map((w, idx) => (
          <div key={idx} className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: `${w}px`, height: '40px', borderRadius: '6px 6px 0 0' }} />
        ))}
      </nav>

      {/* Filter Toolbar Skeleton */}
      <div className={styles.filterToolbar}>
        <div className={styles.filterChips}>
          {[70, 90, 85, 110, 80].map((w, i) => (
            <div key={i} className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: `${w}px`, height: '32px', borderRadius: '9999px' }} />
          ))}
        </div>
        <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '280px', height: '36px' }} />
      </div>

      {/* Table Skeleton */}
      <div className={styles.tableWrapper}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
          <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '100%', height: '24px' }} />
        </div>
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className={styles.skeletonRow}>
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '15%', height: '18px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '20%', height: '18px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '15%', height: '18px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '18%', height: '18px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '12%', height: '18px' }} />
            <div className={`${styles.skeletonBox} ${styles.shimmer}`} style={{ width: '20%', height: '28px', borderRadius: '6px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
