import { useEffect, useRef, useState } from 'react';
import type { MerchantDashboardTab } from '../../dashboard/DashboardSidebar';

interface UseDashboardNavigationOptions {
  storeName: string;
}

export function useDashboardNavigation({ storeName }: UseDashboardNavigationOptions) {
  const [activeTab, setActiveTab] = useState<MerchantDashboardTab>('overview');
  const dashboardMainRef = useRef<HTMLElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigateDashboard = (
    tab: MerchantDashboardTab,
    beforeMenuClose?: () => void
  ) => {
    setActiveTab(tab);
    beforeMenuClose?.();
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
    dashboardMainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useEffect(() => {
    const tabTitles: Record<MerchantDashboardTab, string> = {
      overview: 'نظرة عامة',
      orders: 'الشحنات',
      exceptions: 'استثناءات الشحن',
      analytics: 'تحليلات الشحنات',
      branding: 'تخصيص صفحة التتبّع',
      upsells: 'زيادة المبيعات',
      integrations: 'التكاملات',
      mappings: 'مطابقة الحالات',
      settings: 'الإعدادات',
    };
    document.title = tabTitles[activeTab] + ' — ' + storeName + ' | تاجر تراك';
  }, [activeTab, storeName]);

  return {
    activeTab,
    setActiveTab,
    dashboardMainRef,
    mobileMenuOpen,
    setMobileMenuOpen,
    navigateDashboard,
  };
}
