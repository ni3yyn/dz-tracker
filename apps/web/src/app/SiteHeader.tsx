'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 36 36" fill="none">
        <path d="M5.5 9.5H23c10 0 10 13 0 13H13c-9 0-9 10 0 10h16" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5.5" cy="9.5" r="2.1" fill="#D57955" />
        <circle cx="29" cy="32.5" r="2.1" fill="currentColor" />
      </svg>
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
  const headerRef = useRef<HTMLElement | null>(null);
  const isDashboard = variant === 'dashboard';
  const effectiveMenuOpen = isDashboard ? menuOpen : siteMenuOpen;
  const accountHref = isAuthenticated ? '/merchant' : '/login';
  const primaryHref = isAuthenticated ? '/merchant' : '/register';
  const closeSiteMenu = () => setSiteMenuOpen(false);

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
      if (inHeader || inDashboardMenu) return;
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

  if (isDashboard) {
    return (
      <header ref={headerRef} className={styles.dashboardHeader}>
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

      <div id={menuId} className={`${styles.mobileMenu} ${siteMenuOpen ? styles.mobileMenuOpen : ''}`} aria-hidden={!siteMenuOpen}>
        <div className={styles.mobileMenuInner}>
          <nav aria-label="التنقل على الهاتف">
            <a href="/#how-it-works" onClick={closeSiteMenu}>كيف يعمل</a>
            <a href="/#features" onClick={closeSiteMenu}>المزايا</a>
            <a href="/#pricing" onClick={closeSiteMenu}>الأسعار</a>
            <a href="/#faq" onClick={closeSiteMenu}>الأسئلة الشائعة</a>
          </nav>
          <div className={styles.mobileActions}>
            {!isAuthenticated && <a href={accountHref} onClick={closeSiteMenu}>تسجيل الدخول</a>}
            <a className={styles.mobilePrimary} href={primaryHref} onClick={closeSiteMenu}>
              {isAuthenticated ? 'لوحة التاجر' : 'إنشاء حساب'}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
