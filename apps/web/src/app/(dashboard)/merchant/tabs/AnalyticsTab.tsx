import { DashboardMetricCard } from '../components/DashboardMetricCard';
import { DashboardSectionHeading } from '../components/DashboardSectionHeading';

type AnalyticsDay = {
  label: string;
  dateLabel: string;
  count: number;
};

type StatusBreakdownItem = {
  key: string;
  label: string;
  count: number;
  color: string;
};

interface AnalyticsTabProps {
  orderCount: number;
  successRate: number;
  exceptionCount: number;
  ordersCreatedLastSevenDays: number;
  lastSevenDays: AnalyticsDay[];
  maxDailyOrders: number;
  statusBreakdown: StatusBreakdownItem[];
  onOpenOrders: () => void;
  onOpenExceptions: () => void;
}

export function AnalyticsTab({
  orderCount,
  successRate,
  exceptionCount,
  ordersCreatedLastSevenDays,
  lastSevenDays,
  maxDailyOrders,
  statusBreakdown,
  onOpenOrders,
  onOpenExceptions,
}: AnalyticsTabProps) {
  return (
            <section className="dz-analytics" aria-label="تحليلات الشحنات">
              <div className="dz-overview-kpis dz-analytics-kpis">
                <DashboardMetricCard as="div" label="إجمالي الشحنات" value={orderCount} />
                <DashboardMetricCard as="div" label="نسبة التسليم" value={<>{successRate}%</>} />
                <DashboardMetricCard as="div" className={`dz-overview-kpi ${exceptionCount ? 'is-alert' : ''}`} label="تحتاج إلى متابعة" value={exceptionCount} />
              </div>
              <div className="dz-analytics-grid">
                <section className="dz-overview-section dz-analytics-section" aria-labelledby="analytics-volume-title">
                  <DashboardSectionHeading
                    id="analytics-volume-title"
                    title="حجم تسجيل الطلبات"
                    description="عدد الطلبات التي تم تسجيلها في كل يوم من آخر 7 أيام"
                    action={<span className="dz-analytics-total">{ordersCreatedLastSevenDays} طلباً</span>}
                  />
                  <div className="dz-analytics-bars">
                    {lastSevenDays.map((day) => (
                      <div className="dz-analytics-bar-row" key={`${day.label}-${day.dateLabel}`}>
                        <span className="dz-analytics-day">{day.label} <small>{day.dateLabel}</small></span>
                        <div className="dz-analytics-bar-track"><div className="dz-analytics-bar-fill" style={{ width: `${Math.round((day.count / maxDailyOrders) * 100)}%` }} /></div>
                        <strong className="dz-analytics-bar-count">{day.count}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="dz-overview-section dz-analytics-section" aria-labelledby="analytics-status-title">
                  <DashboardSectionHeading
                    id="analytics-status-title"
                    title="توزيع الحالات"
                    description="حسب الحالة الحالية لكل شحنة"
                  />
                  <div className="dz-analytics-status-list">
                    {statusBreakdown.map((item) => {
                      const percent = orderCount ? Math.round((item.count / orderCount) * 100) : 0;
                      return <div className="dz-analytics-status-item" key={item.key}>
                        <div className="dz-analytics-status-heading"><span><i style={{ background: item.color }} />{item.label}</span><strong>{item.count} <small>({percent}%)</small></strong></div>
                        <div className="dz-analytics-bar-track"><div className="dz-analytics-bar-fill" style={{ width: `${percent}%`, background: item.color }} /></div>
                      </div>;
                    })}
                  </div>
                </section>
              </div>
              <div className="dz-analytics-footnote">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px', color: '#416B52' }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                <div>
                  <strong style={{ display: 'inline-block', marginInlineEnd: '6px', color: 'var(--ink-main)' }}>ملاحظة تحليلية:</strong>
                  هذه الشاشة تعتمد على تاريخ تسجيل الطلب والحالة الحالية في قاعدة البيانات. لا تعرض متوسط مدة التوصيل أو نسبة الالتزام بموعد التسليم لأن بيانات بداية ونهاية النقل اللازمة لحسابهما غير متاحة في هذا العرض.
                </div>
              </div>
              <div className="dz-analytics-action-row"><button type="button" className="dz-btn dz-btn-outline" onClick={() => onOpenOrders()}>عرض الشحنات</button><button type="button" className="dz-btn" onClick={() => onOpenExceptions()}>مراجعة التنبيهات ({exceptionCount})</button></div>
            </section>
  );
}
