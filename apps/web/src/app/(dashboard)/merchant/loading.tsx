import React from 'react';
import styles from './merchant.module.css';

type SkeletonProps = {
  width: string;
  height: string;
  className?: string;
};

function Skeleton({ width, height, className = '' }: SkeletonProps) {
  return (
    <span
      className={`${styles.loadingSkeleton} ${styles.loadingShimmer} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

const followUpRows = [1, 2, 3, 4];
const shortcutRows = [1, 2, 3, 4];
const secondaryNavWidths = [74, 58, 82, 66, 78];

export default function MerchantLoading() {
  return (
    <div className={styles.dashboardLoading} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.loadingSrOnly}>جارٍ تحميل لوحة التاجر...</span>

      <div className={styles.loadingFrame} aria-hidden="true">
        <aside className={styles.loadingRail}>
          <div className={styles.loadingProductBrand}>
            <Skeleton width="38px" height="38px" className={styles.loadingBrandMark} />
            <div className={styles.loadingBrandCopy}>
              <Skeleton width="88px" height="13px" />
              <Skeleton width="118px" height="9px" />
            </div>
          </div>

          <div className={styles.loadingStoreIdentity}>
            <Skeleton width="44px" height="44px" className={styles.loadingStoreAvatar} />
            <div className={styles.loadingStoreCopy}>
              <Skeleton width="112px" height="12px" />
              <Skeleton width="74px" height="9px" />
            </div>
          </div>

          <div className={styles.loadingNavGroup}>
            <span className={styles.loadingNavCaption}>المتابعة</span>
            {[72, 58, 84, 67].map((width, index) => (
              <div className={styles.loadingNavRow} key={index}>
                <Skeleton width="18px" height="18px" className={styles.loadingNavIcon} />
                <Skeleton width={`${width}%`} height="10px" />
              </div>
            ))}
          </div>

          <div className={styles.loadingNavGroup}>
            <span className={styles.loadingNavCaption}>إدارة المتجر</span>
            {secondaryNavWidths.map((width, index) => (
              <div className={styles.loadingNavRow} key={index}>
                <Skeleton width="18px" height="18px" className={styles.loadingNavIcon} />
                <Skeleton width={`${width}%`} height="10px" />
              </div>
            ))}
          </div>

          <div className={styles.loadingRailFooter}>
            <Skeleton width="116px" height="10px" />
          </div>
        </aside>

        <main className={styles.loadingMain}>
          <header className={styles.loadingHeader}>
            <div className={styles.loadingMenuIcon}>
              <span />
              <span />
              <span />
            </div>

            <div className={styles.loadingHeading}>
              <Skeleton width="218px" height="27px" className={styles.loadingTitleLine} />
              <Skeleton width="min(100%, 390px)" height="12px" />
            </div>

            <div className={styles.loadingHeaderActions}>
              <div className={styles.loadingSearch}>
                <Skeleton width="17px" height="17px" />
                <Skeleton width="72%" height="10px" />
              </div>
              <Skeleton width="112px" height="40px" className={styles.loadingPrimaryAction} />
            </div>
          </header>

          <section className={styles.loadingMetrics} aria-label="ملخص الشحنات">
            {[1, 2, 3, 4].map((item) => (
              <div className={styles.loadingMetric} key={item}>
                <Skeleton width="46%" height="10px" />
                <Skeleton width="29%" height="34px" className={styles.loadingMetricValue} />
                <Skeleton width="68%" height="9px" />
              </div>
            ))}
          </section>

          <div className={styles.loadingOverview}>
            <section className={styles.loadingActivity}>
              <div className={styles.loadingSectionHead}>
                <div className={styles.loadingSectionTitleGroup}>
                  <Skeleton width="154px" height="15px" />
                  <Skeleton width="min(100%, 310px)" height="10px" />
                </div>
                <Skeleton width="68px" height="10px" />
              </div>

              <div className={styles.loadingActivityList}>
                {followUpRows.map((item, index) => (
                  <div className={styles.loadingActivityRow} key={item}>
                    <span className={styles.loadingStatusDot} />
                    <div className={styles.loadingActivityCopy}>
                      <Skeleton width={index === 1 ? '48%' : '62%'} height="11px" />
                      <Skeleton width={index === 2 ? '54%' : '76%'} height="9px" />
                    </div>
                    <div className={styles.loadingActivityMeta}>
                      <Skeleton width="62px" height="8px" />
                      <Skeleton width="42px" height="8px" />
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.loadingSectionHead}>
                <div className={styles.loadingSectionTitleGroup}>
                  <Skeleton width="176px" height="15px" />
                  <Skeleton width="min(100%, 280px)" height="10px" />
                </div>
                <Skeleton width="64px" height="10px" />
              </div>

              <div className={styles.loadingActivityList}>
                {[1, 2, 3].map((item, index) => (
                  <div className={styles.loadingActivityRow} key={item}>
                    <span className={styles.loadingStatusDot} />
                    <div className={styles.loadingActivityCopy}>
                      <Skeleton width={index === 0 ? '58%' : '43%'} height="11px" />
                      <Skeleton width="72%" height="9px" />
                    </div>
                    <div className={styles.loadingActivityMeta}>
                      <Skeleton width="58px" height="8px" />
                      <Skeleton width="36px" height="8px" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className={styles.loadingAside}>
              <section className={styles.loadingAsideSection}>
                <div className={styles.loadingSectionTitleGroup}>
                  <Skeleton width="86px" height="15px" />
                  <Skeleton width="172px" height="10px" />
                </div>
                <div className={styles.loadingShortcutList}>
                  {shortcutRows.map((item, index) => (
                    <div className={styles.loadingShortcutRow} key={item}>
                      <Skeleton width="34px" height="34px" className={styles.loadingShortcutIcon} />
                      <div className={styles.loadingShortcutCopy}>
                        <Skeleton width={index === 1 ? '76px' : '108px'} height="10px" />
                        <Skeleton width="142px" height="8px" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.loadingAsideSection}>
                <div className={styles.loadingSectionTitleGroup}>
                  <Skeleton width="108px" height="15px" />
                  <Skeleton width="132px" height="10px" />
                </div>
                {[1, 2, 3].map((item) => (
                  <div className={styles.loadingSummaryRow} key={item}>
                    <Skeleton width="76px" height="9px" />
                    <Skeleton width="28px" height="13px" />
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
