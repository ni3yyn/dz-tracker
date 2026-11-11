'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './site-header.module.css';

type HeaderVariant = 'site' | 'dashboard';

type Props = {
  isAuthenticated?: boolean;
  compact?: boolean;
  variant?: HeaderVariant;
  /** Used by the dashboard variant to control the existing workspace navigation drawer. */
  menuOpen?: boolean;
  onMenuToggle?: () => void;
  menuId?: string;
  /** In dashboard mode, className styles the contextual header content slot. */
  className?: string;
  children?: ReactNode;
};

function Mark() {
  // Animated brand mark (public/tajertrack-animated.svg): intro plays once, then the delivery loop repeats.
  // Loaded as an <img> so the SVG's own animation runs and it respects prefers-reduced-motion.
  return (
    <span className={styles.mark} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tajertrack-animated.svg" alt="" width={42} height={42} decoding="async" />
    </span>
  );
}

function Hamburger() {
  return (
    <>
      <span />
      <span />
      <span />
    </>
  );
}

export default function SiteHeader({
  isAuthenticated = false,
  compact = false,
  variant = 'site',
  menuOpen = false,
  onMenuToggle,
  menuId = 'dz-site-mobile-menu',
  className = '',
  children,
}: Props) {
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [menuPortalTarget, setMenuPortalTarget] = useState<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const isDashboard = variant === 'dashboard';
  const effectiveMenuOpen = isDashboard ? menuOpen : siteMenuOpen;
  const accountHref = isAuthenticated ? '/merchant' : '/login';
  const primaryHref = isAuthenticated ? '/merchant' : '/register';
  const closeSiteMenu = () => setSiteMenuOpen(false);

  useEffect(() => {
    if (!isDashboard) setMenuPortalTarget(document.body);
  }, [isDashboard]);

  useEffect(() => {
    if (!effectiveMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isDashboard) onMenuToggle?.();
      else setSiteMenuOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inHeader = headerRef.current?.contains(target) ?? false;
      const inDashboardMenu = isDashboard && (document.getElementById(menuId)?.contains(target) ?? false);
      const inSiteMenu = !isDashboard && (document.getElementById(menuId)?.contains(target) ?? false);
      if (inHeader || inDashboardMenu || inSiteMenu) return;
      if (isDashboard) onMenuToggle?.();
      else setSiteMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [effectiveMenuOpen, isDashboard, menuId, onMenuToggle]);

  // Mobile Back Button Handler for public site menu: pressing back closes menu instead of leaving page
  useEffect(() => {
    if (isDashboard || !siteMenuOpen) return;

    window.history.pushState({ tajerSiteMobileMenu: true }, '');

    const handlePopState = () => {
      setSiteMenuOpen(false);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.tajerSiteMobileMenu) {
        window.history.back();
      }
    };
  }, [siteMenuOpen, isDashboard]);

  if (isDashboard) {
    return (
      <header
        ref={headerRef}
        className={styles.dashboardHeader}
        data-dashboard-back-dismiss={effectiveMenuOpen ? 'header-menu' : undefined}
      >
        <button
          type="button"
          className={`${styles.dashboardMenuToggle} ${menuOpen ? styles.menuToggleOpen : ''}`}
          aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={onMenuToggle}
        >
          <Hamburger />
        </button>
        <div className={`${styles.dashboardContent} ${className}`}>{children}</div>
      </header>
    );
  }

  return (
    <>
      <header ref={headerRef} className={`${styles.header} ${compact ? styles.compact : ''}`}>
      <a href="/" className={styles.brand} aria-label="تاجر تراك | الصفحة الرئيسية">
        <Mark />
        <span className={styles.wordmark}>
          <strong>تاجر تراك </strong>
        </span>
      </a>

      <nav className={styles.desktopNav} aria-label="التنقل الرئيسي">
        <a href="/#how-it-works">كيف يعمل</a>
        <a href="/#features">المزايا</a>
        <a href="/#pricing">الأسعار</a>
        <a href="/#faq">الأسئلة الشائعة</a>
        <a href="/privacy">سياسة الخصوصية</a>
        <a href="/terms">شروط الاستخدام</a>
        {!isAuthenticated && <a className={styles.loginLink} href={accountHref}>تسجيل الدخول</a>}
      </nav>

      <div className={styles.actions}>
        <a className={styles.primaryLink} href={primaryHref}>
          {isAuthenticated ? 'لوحة التاجر' : 'إنشاء حساب'}
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      <button
        type="button"
        className={`${styles.menuToggle} ${siteMenuOpen ? styles.menuToggleOpen : ''}`}
        aria-label={siteMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
        aria-expanded={siteMenuOpen}
        aria-controls={menuId}
        onClick={() => setSiteMenuOpen((open) => !open)}
      >
        <Hamburger />
      </button>


    </header>
      {menuPortalTarget
        ? createPortal(
            <div id={menuId} className={`${styles.mobileMenu} ${siteMenuOpen ? styles.mobileMenuOpen : ''}`} aria-hidden={!siteMenuOpen}>
              <div className={styles.mobileMenuInner}>
                <nav aria-label="التنقل على الهاتف">
                  <a href="/#how-it-works" onClick={closeSiteMenu}>كيف يعمل</a>
                  <a href="/#features" onClick={closeSiteMenu}>المزايا</a>
                  <a href="/#pricing" onClick={closeSiteMenu}>الأسعار</a>
                  <a href="/#faq" onClick={closeSiteMenu}>الأسئلة الشائعة</a>
                  <a href="/privacy" onClick={closeSiteMenu}>سياسة الخصوصية</a>
                  <a href="/terms" onClick={closeSiteMenu}>شروط الاستخدام</a>
                </nav>
                <div className={styles.mobileActions}>
                  {!isAuthenticated && <a href={accountHref} onClick={closeSiteMenu}>تسجيل الدخول</a>}
                  <a className={styles.mobilePrimary} href={primaryHref} onClick={closeSiteMenu}>
                    {isAuthenticated ? 'لوحة التاجر' : 'إنشاء حساب'}
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>
            </div>,
            menuPortalTarget
          )
        : null}
    </>
  );
}