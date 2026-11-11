'use client';

import { useEffect, useState } from 'react';
import { logout } from '../actions';
import { Icons } from '../components/DashboardIcons';

export type MerchantDashboardTab =
  | 'overview'
  | 'orders'
  | 'exceptions'
  | 'analytics'
  | 'branding'
  | 'exchangeRequests'
  | 'upsells'
  | 'integrations'
  | 'mappings'
  | 'settings';

interface DashboardSidebarProps {
  activeTab: MerchantDashboardTab;
  mobileMenuOpen: boolean;
  brandColor: string;
  brandLogoUrl?: string | null;
  logoSrc: string;
  displayStoreName: string;
  exceptionCount: number;
  activeUpsellsCount: number;
  getReadableOnBrand: (color: string) => string;
  onNavigate: (tab: MerchantDashboardTab, resetOrdersFilter?: boolean) => void;
  onCloseMobileMenu: () => void;
}

export function DashboardSidebar({
  activeTab,
  mobileMenuOpen,
  brandColor,
  brandLogoUrl,
  logoSrc,
  displayStoreName,
  exceptionCount,
  activeUpsellsCount,
  getReadableOnBrand,
  onNavigate,
  onCloseMobileMenu,
}: DashboardSidebarProps) {
  const [afterSalesOpen, setAfterSalesOpen] = useState(activeTab === 'branding' || activeTab === 'exchangeRequests');
  useEffect(() => {
    if (activeTab === 'branding' || activeTab === 'exchangeRequests') setAfterSalesOpen(true);
  }, [activeTab]);

  return (
    <>
        <aside id="dz-merchant-sidebar" className={`dz-sidebar ${mobileMenuOpen ? 'dz-mobile-nav-open' : ''}`}>
          <div className="dz-product-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tajertrack-animated.svg" alt="" aria-hidden="true" width="38" height="38" />
            <div className="dz-product-brand-copy">
              <strong>تاجر تراك</strong>
              <span>إدارة الشحنات بوضوح</span>
            </div>
          </div>

          <div className="dz-brand">
            <div className="dz-avatar-box" style={{ background: brandColor, color: getReadableOnBrand(brandColor), overflow: 'hidden', padding: brandLogoUrl ? '0' : undefined }}>
              {brandLogoUrl ? (
                <img
                  src={logoSrc}
                  alt={displayStoreName}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    (e.currentTarget.parentElement as HTMLElement).textContent = displayStoreName.charAt(0);
                  }}
                />
              ) : (
                displayStoreName.charAt(0)
              )}
            </div>
            <div className="dz-brand-text">
              <span className="dz-brand-title">{displayStoreName}</span>
              <span className="dz-brand-badge">المتجر الحالي</span>
            </div>
          </div>

          <nav className="dz-nav" aria-label="أقسام لوحة التاجر">
            <div className="dz-nav-caption">المتابعة</div>
            <button className={`dz-nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => onNavigate('overview')}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Dashboard /></span> نظرة عامة</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => onNavigate('orders', true)}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Box /></span> الطلبات</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => onNavigate('analytics')}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Chart /></span> التحليلات</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'exceptions' ? 'active' : ''}`} onClick={() => onNavigate('exceptions', true)}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.AlertTriangle /></span> استثناءات الشحن</span>
              {exceptionCount > 0 && <span className="dz-alert-badge">{exceptionCount}</span>}
            </button>
            <div className="dz-nav-caption dz-nav-caption-secondary">إدارة المتجر</div>
            <div className="dz-nav-group">
              <button type="button" className={`dz-nav-item dz-nav-group-trigger ${activeTab === 'branding' || activeTab === 'exchangeRequests' ? 'active' : ''}`} aria-expanded={afterSalesOpen} aria-controls="dz-after-sales-submenu" onClick={() => setAfterSalesOpen((open) => !open)}>
                <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Palette /></span> خدمات ما بعد البيع</span>
                <svg className={`dz-nav-group-chevron ${afterSalesOpen ? 'is-open' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div id="dz-after-sales-submenu" className={`dz-nav-submenu ${afterSalesOpen ? 'is-open' : ''}`} aria-hidden={!afterSalesOpen}>
                <div className="dz-nav-submenu-inner">
                  <button type="button" tabIndex={afterSalesOpen ? 0 : -1} className={`dz-nav-item dz-nav-subitem ${activeTab === 'branding' ? 'active' : ''}`} onClick={() => onNavigate('branding')}><span className="dz-nav-subitem-mark" aria-hidden="true" /> محرر الهوية</button>
                  <button type="button" tabIndex={afterSalesOpen ? 0 : -1} className={`dz-nav-item dz-nav-subitem ${activeTab === 'exchangeRequests' ? 'active' : ''}`} onClick={() => onNavigate('exchangeRequests')}><span className="dz-nav-subitem-mark" aria-hidden="true" /> طلبات الاستبدال</button>
                  <button type="button" tabIndex={afterSalesOpen ? 0 : -1} className="dz-nav-item dz-nav-subitem dz-nav-subitem-disabled" disabled title="ستتوفر لاحقاً"><span className="dz-nav-subitem-mark" aria-hidden="true" /><span>إرشادات المنتجات</span><small>لاحقاً</small></button>
                </div>
              </div>
            </div>
            <button className={`dz-nav-item ${activeTab === 'upsells' ? 'active' : ''}`} onClick={() => onNavigate('upsells')}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.ShoppingBag /></span> زيادة المبيعات (Upsells)</span>
              {activeUpsellsCount > 0 && (
                <span className="dz-alert-badge" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                  {activeUpsellsCount}
                </span>
              )}
            </button>
            <button className={`dz-nav-item ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => onNavigate('integrations')}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Plug /></span> بوابات الربط</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => onNavigate('mappings')}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Tag /></span> مسميات الحالات</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Settings /></span> الإعدادات</span>
            </button>
          </nav>

          <div className="dz-sidebar-footer">
            <form action={logout}>
              <button type="submit" className="dz-nav-item" style={{ width: '100%', justifyContent: 'center', background: 'var(--bg-base)' }}>
                <Icons.LogOut /> <span style={{ marginRight: '8px' }}>تسجيل الخروج</span>
              </button>
            </form>
          </div>
        </aside>

        {/* MOBILE MENU BACKDROP */}
        <div
          className={`dz-mobile-backdrop ${mobileMenuOpen ? 'is-visible' : ''}`}
          onClick={onCloseMobileMenu}
          aria-hidden={!mobileMenuOpen}
        />


    </>
  );
}
