import React from 'react';
import styles from './t.module.css';

export default function TrackingLoading() {
  return (
    <main className={`${styles.pageContainer} ${styles.bgAurora}`} aria-label="جاري تحميل تفاصيل الشحنة">
      <div className={`${styles.card} ${styles.cardSolid} ${styles.radiusModern} ${styles.widthStandard}`}>
        <div className={`${styles.brandAccentBar} ${styles.shimmer}`} />
        <header className={styles.header}>
          <div className={styles.topStatusRow}>
            <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '105px', height: '16px' }} />
            <div className={`${styles.skeletonBadge} ${styles.shimmer}`} style={{ width: '105px', height: '30px' }} />
          </div>
          <div className={styles.brandHeaderRow}>
            <div className={`${styles.skeletonAvatar} ${styles.shimmer}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '46%', height: '20px' }} />
              <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '31%', height: '13px' }} />
            </div>
          </div>
        </header>

        <section className={styles.trackingSection}>
          <div className={styles.currentStatusPanel}>
            <div className={styles.currentStatusTop}>
              <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '100px', height: '14px' }} />
              <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '145px', height: '13px' }} />
            </div>
            <div className={styles.currentStatusBody}>
              <div className={`${styles.skeletonAvatar} ${styles.shimmer}`} style={{ width: '42px', height: '42px' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '3px' }}>
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '79%', height: '23px' }} />
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '94%', height: '13px' }} />
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '61%', height: '13px' }} />
              </div>
            </div>
          </div>
          <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '100%', height: '58px', marginTop: '20px', borderRadius: '12px' }} />
          <div className={styles.timelineHeading}>
            <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '155px', height: '23px' }} />
          </div>
          {[1, 2, 3].map((index) => (
            <div key={index} className={styles.eventItem}>
              <span className={`${styles.skeletonTimelineDot} ${styles.shimmer}`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', paddingTop: '4px' }}>
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: index === 2 ? '52%' : '74%', height: '18px' }} />
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '33%', height: '13px' }} />
                <div className={`${styles.skeletonLine} ${styles.shimmer}`} style={{ width: '88%', maxWidth: '65vw', height: '13px' }} />
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
