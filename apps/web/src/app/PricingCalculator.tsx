'use client';

import React, { useState } from 'react';
import styles from './home.module.css';

type PricingResult = {
  name: string;
  limit: string;
  price: string;
  description: string;
};

function getPricingResult(target: number): PricingResult {
  if (target <= 30) {
    return {
      name: 'الباقة المجانية',
      limit: 'حتى 30 رابط تتبّع شهرياً',
      price: '0',
      description: 'مناسبة لتجربة تاجر تراك والبدء في تنظيم التتبّع.',
    };
  }

  if (target <= 100) {
    return {
      name: 'الباقة الأساسية',
      limit: 'حتى 100 رابط تتبّع شهرياً',
      price: '1,000',
      description: 'للمتاجر الصغيرة.',
    };
  }

  if (target <= 200) {
    return {
      name: 'باقة النمو',
      limit: 'حتى 200 رابط تتبّع شهرياً',
      price: '1,800',
      description: 'للمتاجر التي تستقبل طلبات بشكل منتظم.',
    };
  }

  if (target <= 500) {
    return {
      name: 'الباقة الاحترافية',
      limit: 'حتى 500 رابط تتبّع شهرياً',
      price: '2,500',
      description: 'للمتاجر ذات حجم الشحنات الأكبر.',
    };
  }

  return {
    name: 'خطة مخصصة',
    limit: 'أكثر من 500 رابط تتبّع شهرياً',
    price: 'حسب الاتفاق',
    description: 'تواصل معنا لتحديد حدّ وسعر يناسبان حجم متجرك.',
  };
}

export default function PricingCalculator() {
  const [targetValue, setTargetValue] = useState('');

  const parsedTarget = targetValue.trim() === '' ? null : Number(targetValue);
  const target = parsedTarget !== null && Number.isFinite(parsedTarget)
    ? Math.max(0, Math.floor(parsedTarget))
    : null;
  const result = target === null ? null : getPricingResult(target);

  return (
    <div className={styles.pricingCalculator} dir="rtl">
      <div className={styles.pricingCalculatorField}>
        <label htmlFor="pricing-monthly-target">كم رابط تتبّع تتوقع أن تنشئ شهرياً؟</label>
        <input
          id="pricing-monthly-target"
          className={styles.pricingCalculatorInput}
          type="number"
          inputMode="numeric"
          min="0"
          max="100000"
          step="1"
          value={targetValue}
          onChange={(event) => setTargetValue(event.target.value)}
          placeholder="مثلاً: 150"
          aria-describedby="pricing-calculator-hint"
        />
      </div>

      <div className={styles.pricingCalculatorResult} aria-live="polite" aria-atomic="true">
        {result ? (
          <>
            <span className={styles.pricingCalculatorTier}>{result.name}</span>
            <strong className={styles.pricingCalculatorPrice}>
              {result.price === 'حسب الاتفاق' ? result.price : result.price + ' دج'}
              {result.price !== 'حسب الاتفاق' && <small> / شهرياً</small>}
            </strong>
            <span className={styles.pricingCalculatorLimit}>{result.limit}</span>
          </>
        ) : (
          <>
            <span className={styles.pricingCalculatorTier}>احسب باقتك الشهرية</span>
            <strong className={styles.pricingCalculatorPrompt}>أدخل العدد لعرض السعر</strong>
          </>
        )}
      </div>

      <p className={styles.pricingCalculatorHint} id="pricing-calculator-hint">
        {result
          ? result.description
          : 'اختر العدد المتوقع؛ سيعرض لك الحاسوب أصغر باقة تغطي احتياجك دون احتساب سعر لكل رابط.'}
        {' '}جميع الباقات تشمل إرسال رابط التتبّع عبر SMS باستخدام شريحة هاتفك عند ربط تطبيق TajerTrack Phone، دون شراء رصيد SMS من تاجر تراك.
      </p>
    </div>
  );
}
