'use client';

import React, { useState, useTransition } from 'react';
import { respondToConfirmation } from './actions';
import styles from './confirm.module.css';
import { toCachedImageUrl } from '../../../lib/imageProxy';

type ConfirmStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'invalid';

interface Props {
  status: ConfirmStatus;
  token: string;
  orderNumber?: string;
  customerName?: string;
  productName?: string;
  productImage?: string;
  storeName?: string;
  logoUrl?: string;
  brandColor?: string;
}

export function ConfirmOrderView({
  status: initialStatus,
  token,
  orderNumber,
  customerName,
  productName,
  productImage,
  storeName,
  logoUrl,
  brandColor = '#273b30',
}: Props) {
  const [status, setStatus] = useState<ConfirmStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const accent = /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : '#273b30';

  const handleResponse = (action: 'confirm' | 'cancel') => {
    setActionError(null);
    startTransition(async () => {
      const result = await respondToConfirmation(token, action);
      if (result.success && result.status) {
        setStatus(result.status);
      } else {
        setActionError(result.error || 'تعذر تسجيل ردك. يرجى المحاولة مجدداً.');
      }
    });
  };

  return (
    <main className={styles.page} dir="rtl" style={{ ['--confirm-brand' as string]: accent } as React.CSSProperties}>
      <div className={styles.ambient} aria-hidden="true">
        <span className={styles.ambientOrbOne} />
        <span className={styles.ambientOrbTwo} />
      </div>

      <section className={styles.shell} aria-labelledby="confirm-title">
        {(storeName || logoUrl) && (
          <header className={styles.merchantHeader}>
            {logoUrl ? (
              <img
                className={styles.logo}
                src={toCachedImageUrl(logoUrl)}
                alt={storeName ? `شعار ${storeName}` : 'شعار المتجر'}
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span className={styles.logoFallback} aria-hidden="true">
                {storeName?.trim().charAt(0) || 'م'}
              </span>
            )}
            <div className={styles.merchantIdentity}>
              <div className={styles.storeName}>{storeName || 'متجرك'}</div>
              <div className={styles.storeCaption}>يسعدنا خدمتك</div>
            </div>
          </header>
        )}

        <div className={styles.content}>
          {status === 'pending' ? (
            <>
              <div className={styles.intro}>
                <div className={styles.statusIcon}><PackageCheckIcon /></div>
                <span className={styles.eyebrow}>خطوة أخيرة</span>
                <h1 id="confirm-title" className={styles.title}>نأكدوا طلبك؟</h1>
                <p className={styles.description}>
                  {customerName
                    ? `أهلاً ${customerName}، شكراً لطلبك من ${storeName || 'متجرنا'}. راجع التفاصيل بالأسفل، وإذا كل شيء صحيح أكّد لنا.`
                    : `شكراً لطلبك من ${storeName || 'متجرنا'}. راجع التفاصيل بالأسفل، وإذا كل شيء صحيح أكّد لنا.`}
                </p>
              </div>

              <OrderSummary
                orderNumber={orderNumber}
                productName={productName}
                productImage={productImage}
              />

              {actionError && <p className={styles.errorMessage} role="alert">{actionError}</p>}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.confirmButton}
                  onClick={() => handleResponse('confirm')}
                  disabled={isPending}
                >
                  {isPending ? <Spinner /> : <CheckCircleIcon />}
                  <span>{isPending ? 'جارٍ تأكيد طلبك...' : 'تأكيد الطلب'}</span>
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => handleResponse('cancel')}
                  disabled={isPending}
                >
                  <XCircleIcon />
                  <span>أرغب في إلغاء الطلب</span>
                </button>
              </div>
            </>
          ) : (
            <ResponseState status={status} orderNumber={orderNumber} />
          )}
        </div>

        <footer className={styles.footer}>
          <span>تأكيد طلبك بكل سهولة عبر</span>
          <strong>TajerTrack</strong>
        </footer>
      </section>
    </main>
  );
}

function OrderSummary({
  orderNumber,
  productName,
  productImage,
}: {
  orderNumber?: string;
  productName?: string;
  productImage?: string;
}) {
  if (!orderNumber && !productName && !productImage) return null;

  return (
    <section className={styles.orderSummary} aria-label="تفاصيل الطلب">
      <div className={styles.summaryHeading}>تفاصيل طلبك</div>
      {(productImage || productName) && (
        <div className={styles.productRow}>
          {productImage && (
            <img className={styles.productImage} src={toCachedImageUrl(productImage)} alt={productName || 'صورة المنتج'} />
          )}
          {productName && <strong className={styles.productName}>{productName}</strong>}
        </div>
      )}
      {orderNumber && (
        <div className={styles.orderNumberRow}>
          <span>رقم الطلب</span>
          <strong dir="ltr">#{orderNumber}</strong>
        </div>
      )}
    </section>
  );
}

function ResponseState({ status, orderNumber }: { status: Exclude<ConfirmStatus, 'pending'>; orderNumber?: string }) {
  const content = {
    confirmed: {
      title: 'يعطيك الصحة، تم تأكيد طلبك!',
      message: 'وصلنا تأكيدك بنجاح. المتجر يكمل الآن تجهيز طلبك، وتقدر تتابع آخر المستجدات من رابط التتبع.',
      tone: 'success',
      icon: <CheckCircleIcon />,
    },
    cancelled: {
      title: 'وصل طلب الإلغاء',
      message: 'تم إرسال طلبك إلى المتجر للمراجعة. فقط للتوضيح: طلب الإلغاء لا يوقف الشحنة تلقائياً، والمتجر سيتواصل معك لتأكيد إمكانية إيقافها.',
      tone: 'danger',
      icon: <XCircleIcon />,
    },
    expired: {
      title: 'انتهت مهلة التأكيد',
      message: 'يبدو أن رابط التأكيد لم يعد صالحاً. تواصل مع المتجر مباشرة وسيساعدك في متابعة طلبك.',
      tone: 'warning',
      icon: <ClockIcon />,
    },
    invalid: {
      title: 'ما لقيناش هذا الطلب',
      message: 'الرابط غير صالح أو لم نتمكن من العثور على الطلب المرتبط به. راجع الرابط أو تواصل مع المتجر للمساعدة.',
      tone: 'muted',
      icon: <LinkOffIcon />,
    },
  }[status];

  return (
    <div className={styles.responseState} data-tone={content.tone}>
      <div className={styles.responseIcon}>{content.icon}</div>
      <span className={styles.eyebrow}>تحديث طلبك</span>
      <h1 id="confirm-title" className={styles.title}>{content.title}</h1>
      {orderNumber && <div className={styles.responseOrder}>رقم الطلب <strong dir="ltr">#{orderNumber}</strong></div>}
      <p className={styles.responseMessage}>{content.message}</p>
    </div>
  );
}

function PackageCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" />
      <path d="m9 15 1.8 1.8 4.2-4.2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.6 2.6L16.5 9" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function LinkOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m10 13.5 4-4m-7.5 7.5-1 1a4 4 0 0 1-5.7-5.7l4-4a4 4 0 0 1 5.7 0M14 10.5l1-1a4 4 0 0 1 5.7 5.7l-2 2" transform="translate(2 -1)" />
      <path d="M4 4 20 20" />
    </svg>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
