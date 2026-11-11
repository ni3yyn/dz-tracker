'use client';

import SiteHeader from '../../../SiteHeader';
import { Icons } from '../components/DashboardIcons';
import type { MerchantDashboardTab } from './DashboardSidebar';

interface DashboardHeaderProps {
  activeTab: MerchantDashboardTab;
  displayStoreName: string;
  menuOpen: boolean;
  searchTerm: string;
  onMenuToggle: () => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onAddOrder: () => void;
}

export function DashboardHeader({
  activeTab,
  displayStoreName,
  menuOpen,
  searchTerm,
  onMenuToggle,
  onSearchChange,
  onSearchSubmit,
  onAddOrder,
}: DashboardHeaderProps) {
  return (
          <SiteHeader
            variant="dashboard"
            className="dz-header"
            menuOpen={menuOpen}
            onMenuToggle={onMenuToggle}
            menuId="dz-merchant-sidebar"
          >
            <div key={activeTab} className="dz-header-titles dz-header-titles-enter">
              <h1>
                {activeTab === 'overview' && 'نظرة عامة'}
                {activeTab === 'orders' && 'الشحنات'}
                {activeTab === 'exceptions' && 'مركز استثناءات الشحن'}
                {activeTab === 'analytics' && 'تحليلات الشحنات'}
                {activeTab === 'branding' && 'تخصيص صفحة الزبون'}
                {activeTab === 'upsells' && 'زيادة المبيعات (قد يعجبك أيضاً)'}
                {activeTab === 'integrations' && 'التكاملات'}
                {activeTab === 'mappings' && 'مطابقة الحالات والترجمة'}
                {activeTab === 'settings' && 'الإعدادات'}
              </h1>
              <p>
                {activeTab === 'overview' && `مرحباً ${displayStoreName}، إليك ملخص الشحنات وما يحتاج إلى متابعة.`}
                {activeTab === 'orders' && 'ابحث عن شحنة، حدّد الحالة، واتخذ الإجراء من مكان واحد.'}
                {activeTab === 'exceptions' && 'الشحنات التي خرجت عن المسار المتوقع وتحتاج إلى تدخلك.'}
                {activeTab === 'analytics' && 'مؤشرات مبنية على الشحنات المسجلة والحالات الحالية، دون تقديرات غير متاحة.'}
                {activeTab === 'branding' && 'عزز ولاء زبائنك بصفحة تتبع تحمل هويتك البصرية.'}
                {activeTab === 'upsells' && 'اعرض منتجات إضافية للزبون في أسفل صفحة التتبع لزيادة متوسط قيمة الطلب بدون إعلانات مدفوعة.'}
                {activeTab === 'integrations' && 'إدارة مصدر الطلبات وشركات التوصيل من مكان واحد. يمكنك ربط عدة شركات دون إعادة الإعداد.'}
                {activeTab === 'mappings' && 'حدد ما يراه الزبون لكل حالة برمجية معقدة.'}
                {activeTab === 'settings' && 'إدارة معلومات المتجر وخدمات تيليجرام والاشتراك من مكان واحد.'}
              </p>
            </div>

            {(activeTab === 'overview' || activeTab === 'orders' || activeTab === 'exceptions') && (
              <div className="dz-header-actions">
                {activeTab === 'overview' && (
                  <div className="dz-search-box" role="search">
                    <Icons.Search />
                    <input
                      type="text"
                      aria-label="البحث في الشحنات برقم الطلب أو الهاتف أو اسم العميل"
                      placeholder="رقم الطلب، الهاتف، العميل..."
                      value={searchTerm}
                      onChange={(e) => onSearchChange(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          onSearchSubmit();
                        }
                      }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="dz-add-order-btn"
                  onClick={onAddOrder}
                  title="إضافة طلب يدوي لاختبار التتبع وتيليجرام"
                >
                  <Icons.Plus />
                  <span>طلب جديد</span>
                </button>
              </div>
            )}
          </SiteHeader>
  );
}
