'use client';

import React, { useState } from 'react';
import { submitCustomPlanRequest } from './custom-plan-actions';
import styles from './home.module.css';

export default function CustomPlanRequest() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
        type="button"
        className={styles.customPlanButton}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
          setFeedback(null);
        }}
      >
        {isOpen ? 'إغلاق الطلب' : 'اطلب عرضاً مخصصاً'}
        <span aria-hidden="true">{isOpen ? '−' : '↗'}</span>
      </button>

      {isOpen && (
        <form className={styles.customPlanForm} onSubmit={handleSubmit}>
          <div className={styles.customPlanFormIntro}>
            <strong>خلّينا نفهم احتياج متجرك</strong>
            <p>أرسل التفاصيل الأساسية، وسنتواصل معك لمناقشة الحجم والسعر والتجهيزات المطلوبة.</p>
          </div>

          <div className={styles.customPlanFields}>
            <label>
              <span>الاسم الكامل</span>
              <input name="full_name" type="text" autoComplete="name" maxLength={100} required placeholder="اسمك" />
            </label>
            <label>
              <span>اسم المتجر</span>
              <input name="store_name" type="text" maxLength={120} required placeholder="اسم نشاطك التجاري" />
            </label>
            <label>
              <span>رقم الهاتف / واتساب</span>
              <input name="contact_phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} required placeholder="+213 ..." />
            </label>
            <label>
              <span>عدد روابط التتبّع المتوقع شهرياً</span>
              <input name="monthly_tracking_urls" type="number" inputMode="numeric" min={1} max={2000000} step={1} required placeholder="مثلاً: 1000" />
            </label>
            <label>
              <span>شركات التوصيل التي تستخدمها</span>
              <input name="carrier_names" type="text" maxLength={300} placeholder="Yalidine، ZR Express..." />
            </label>
            <label>
              <span>طريقة التواصل المفضلة</span>
              <select name="preferred_contact_method" defaultValue="whatsapp">
                <option value="whatsapp">واتساب</option>
                <option value="phone">مكالمة هاتفية</option>
              </select>
            </label>
            <label className={styles.customPlanWideField}>
              <span>ماذا تحتاج من الخطة المخصصة؟ (اختياري)</span>
              <textarea name="requirements" rows={3} maxLength={1500} placeholder="عدد المتاجر، حجم الشحنات، احتياجات خاصة..." />
            </label>
          </div>

          <input className={styles.customPlanHoneypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />

          {feedback && (
            <p className={feedback.type === 'success' ? styles.customPlanSuccess : styles.customPlanError} role="status">
              {feedback.message}
            </p>
          )}

          <button className={styles.customPlanSubmit} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب عرض السعر'}
          </button>
          <p className={styles.customPlanPrivacy}>سيُستخدم رقمك فقط للتواصل معك بشأن هذا العرض.</p>
        </form>
      )}
    </article>
  );
}
