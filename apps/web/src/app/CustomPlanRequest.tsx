'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitCustomPlanRequest } from './custom-plan-actions';
import authStyles from './(auth)/auth.module.css';
import { BrandedSelect } from './(dashboard)/merchant/BrandedSelect';
import styles from './home.module.css';

export default function CustomPlanRequest() {
  const fullNameId = useId();
  const storeNameId = useId();
  const phoneId = useId();
  const volumeId = useId();
  const carriersId = useId();
  const contactMethodId = useId();
  const requirementsId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isPanelMounted, setIsPanelMounted] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const backGuardActiveRef = useRef(false);
  const ignoreProgrammaticPopRef = useRef(false);
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const pushBackGuard = () => {
    const currentState = window.history.state && typeof window.history.state === 'object'
      ? window.history.state as Record<string, unknown>
      : {};
    window.history.pushState(
      { ...currentState, __tajerCustomPlanRequestDrawer: true },
      '',
      window.location.href
    );
    backGuardActiveRef.current = true;
  };

  const closeOpenBrandedSelect = () => {
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-dashboard-back-dismiss="dropdown"] button[aria-haspopup="listbox"][aria-expanded="true"]'
    );
    if (!trigger) return false;
    trigger.click();
    return true;
  };

  useEffect(() => {
    if (!isPanelMounted) return;
    const frame = window.requestAnimationFrame(() => setIsPanelOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [isPanelMounted]);

  useEffect(() => {
    if (!isPanelOpen) return;

    firstFieldRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      // BrandedSelect handles Escape first while its menu is open.
      if (event.key === 'Escape' && !event.defaultPrevented && !isSubmittingRef.current) {
        closePanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (ignoreProgrammaticPopRef.current) {
        ignoreProgrammaticPopRef.current = false;
        event.stopImmediatePropagation();
        return;
      }

      if (!backGuardActiveRef.current) return;
      backGuardActiveRef.current = false;

      // Dismiss the topmost control first; the drawer remains the next Back target.
      if (closeOpenBrandedSelect() || isSubmittingRef.current) {
        pushBackGuard();
        event.stopImmediatePropagation();
        return;
      }

      // Keep Next.js from interpreting this drawer dismissal as route navigation.
      event.stopImmediatePropagation();
      setIsPanelOpen(false);
    };

    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, []);

  const openPanel = () => {
    setFeedback(null);
    if (typeof window !== 'undefined' && !backGuardActiveRef.current) {
      pushBackGuard();
    }
    if (isPanelMounted) {
      setIsPanelOpen(true);
    } else {
      setIsPanelMounted(true);
    }
  };

  const closePanel = () => {
    if (isSubmittingRef.current) return;
    closeOpenBrandedSelect();
    setIsPanelOpen(false);

    if (backGuardActiveRef.current) {
      const currentState = window.history.state && typeof window.history.state === 'object'
        ? window.history.state as Record<string, unknown>
        : {};
      backGuardActiveRef.current = false;
      if (currentState.__tajerCustomPlanRequestDrawer === true) {
        ignoreProgrammaticPopRef.current = true;
        window.history.back();
      }
    }
  };

  const finishPanelClose = () => {
    if (isPanelOpen) return;
    setIsPanelMounted(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await submitCustomPlanRequest(formData);
      if (result.error) {
        setFeedback({ type: 'error', message: result.error });
      } else {
        form.reset();
        setFeedback({
          type: 'success',
          message: 'تم استلام طلبك. سيتواصل معك فريق تاجر تراك عبر الطريقة التي اخترتها لمناقشة احتياجك والاتفاق على عرض مناسب.',
        });
      }
    } catch {
      setFeedback({ type: 'error', message: 'تعذر إرسال طلبك حالياً. يرجى المحاولة بعد قليل.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <article className={styles.customPlan}>
        <div className={styles.customPlanTop}>
          <div>
            <span className={styles.priceOrders}>أكثر من 500 رابط تتبّع / شهر</span>
            <h3>خطة مخصصة</h3>
            <p>حجم أكبر، احتياجات خاصة، أو أكثر من متجر؟ نتفق معك على السقف والسعر المناسبين.</p>
          </div>
          <strong className={styles.customPlanPrice}>حسب الاتفاق</strong>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className={styles.customPlanButton}
          aria-expanded={isPanelMounted && isPanelOpen}
          aria-controls="custom-plan-request-panel"
          onClick={openPanel}
        >
          اطلب عرضاً مخصصاً
          <span aria-hidden="true">↗</span>
        </button>
      </article>

      {isPanelMounted && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.customPlanDrawerBackdrop}
          data-open={isPanelOpen ? 'true' : 'false'}
          aria-hidden={!isPanelOpen}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && isPanelOpen && !isSubmitting) {
              closePanel();
            }
          }}
        >
          <aside
            id="custom-plan-request-panel"
            className={styles.customPlanDrawer}
            data-open={isPanelOpen ? 'true' : 'false'}
            role="dialog"
            aria-modal="true"
            aria-hidden={!isPanelOpen}
            aria-labelledby="custom-plan-request-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
            onTransitionEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === 'flex-basis' &&
                !isPanelOpen
              ) {
                finishPanelClose();
              }
            }}
          >
            <div className={styles.customPlanDrawerInner}>
              <header className={styles.customPlanDrawerHeader}>
                <div>
                  <span className={styles.customPlanDrawerKicker}>الباقات المخصصة</span>
                  <h2 id="custom-plan-request-title">اطلب عرضاً مخصصاً</h2>
                  <p>أخبرنا عن حجم متجرك واحتياجاتك، وسنتواصل معك لمناقشة العرض المناسب.</p>
                </div>
                <button
                  type="button"
                  className={styles.customPlanDrawerClose}
                  aria-label="إغلاق النافذة"
                  onClick={closePanel}
                  disabled={isSubmitting}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </header>

              <form onSubmit={handleSubmit} className={`${authStyles.form} ${styles.customPlanDrawerForm}`}>
                <div className={authStyles.field}>
                  <label htmlFor={fullNameId}>الاسم الكامل</label>
                  <input
                    ref={firstFieldRef}
                    id={fullNameId}
                    name="full_name"
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    required
                    placeholder="اسمك"
                    className={authStyles.input}
                    disabled={isSubmitting}
                  />
                </div>

                <div className={authStyles.field}>
                  <label htmlFor={storeNameId}>اسم المتجر</label>
                  <input
                    id={storeNameId}
                    name="store_name"
                    type="text"
                    autoComplete="organization"
                    maxLength={120}
                    required
                    placeholder="اسم نشاطك التجاري"
                    className={authStyles.input}
                    disabled={isSubmitting}
                  />
                </div>

                <div className={authStyles.field}>
                  <label htmlFor={phoneId}>رقم الهاتف / واتساب</label>
                  <input
                    id={phoneId}
                    name="contact_phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={24}
                    required
                    placeholder="+213 ..."
                    dir="ltr"
                    className={authStyles.input}
                    disabled={isSubmitting}
                  />
                </div>

                <div className={authStyles.field}>
                  <label htmlFor={volumeId}>عدد روابط التتبّع المتوقع شهرياً</label>
                  <input
                    id={volumeId}
                    name="monthly_tracking_urls"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={2000000}
                    step={1}
                    required
                    placeholder="مثلاً: 1000"
                    dir="ltr"
                    className={authStyles.input}
                    disabled={isSubmitting}
                  />
                </div>

                <div className={authStyles.field}>
                  <label htmlFor={carriersId}>شركات التوصيل التي تستخدمها</label>
                  <input
                    id={carriersId}
                    name="carrier_names"
                    type="text"
                    maxLength={300}
                    placeholder="Yalidine، ZR Express..."
                    className={authStyles.input}
                    disabled={isSubmitting}
                  />
                </div>

                <div className={authStyles.field}>
                  <label htmlFor={contactMethodId}>طريقة التواصل المفضلة</label>
                  <BrandedSelect
                    id={contactMethodId}
                    name="preferred_contact_method"
                    defaultValue="whatsapp"
                    options={[
                      { value: 'whatsapp', label: 'واتساب' },
                      { value: 'phone', label: 'مكالمة هاتفية' },
                    ]}
                    placeholder="اختر طريقة التواصل"
                    ariaLabel="طريقة التواصل المفضلة"
                    variant="field"
                    disabled={isSubmitting}
                  />
                </div>

                <div className={authStyles.field}>
                  <label htmlFor={requirementsId}>ماذا تحتاج من الخطة المخصصة؟ (اختياري)</label>
                  <textarea
                    id={requirementsId}
                    name="requirements"
                    rows={3}
                    maxLength={1500}
                    placeholder="عدد المتاجر، حجم الشحنات، احتياجات خاصة..."
                    className={`${authStyles.input} ${styles.customPlanDrawerTextarea}`}
                    disabled={isSubmitting}
                  />
                </div>

                <input
                  className={styles.customPlanHoneypot}
                  type="text"
                  name="__tt_quote_trap_7f3a"
                  tabIndex={-1}
                  autoComplete="new-password"
                  aria-hidden="true"
                />

                {feedback && (
                  <p className={feedback.type === 'success' ? styles.customPlanSuccess : styles.customPlanError} role={feedback.type === 'success' ? 'status' : 'alert'}>
                    {feedback.message}
                  </p>
                )}

                <div className={styles.customPlanDrawerActions}>
                  <button className={styles.customPlanDrawerSubmit} type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب عرض السعر'}
                  </button>
                  <button className={styles.customPlanDrawerCancel} type="button" onClick={closePanel} disabled={isSubmitting}>
                    إلغاء
                  </button>
                </div>
                <p className={styles.customPlanPrivacy}>سيُستخدم رقمك فقط للتواصل معك بشأن هذا العرض.</p>
              </form>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
