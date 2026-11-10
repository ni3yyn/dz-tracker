'use client';

import React, { useState, useTransition } from 'react';
import { respondToConfirmation } from './actions';
import styles from './confirm.module.css';
import { toCachedImageUrl } from '../../../lib/imageProxy';
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from '@saas/ui';
import trackingStyles from '../../t/[uuid]/t.module.css';

type ConfirmStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'invalid';

type ConfirmationBrandSettings = Partial<BrandSettings> & {
  showWhatsAppButton?: boolean;
  animateBackgroundBlobs?: boolean;
  backgroundBlur?: boolean;
};

const DEFAULT_CONFIRMATION_BRAND_SETTINGS: ConfirmationBrandSettings = {
  ...DEFAULT_BRAND_SETTINGS,
  brandColor: '#27342D',
  brandSubtitle: '',
  showWhatsAppButton: true,
  animateBackgroundBlobs: false,
  backgroundBlur: true,
};

interface Props {  status: ConfirmStatus;
  token: string;
  orderNumber?: string;
  customerName?: string;
  productName?: string;
  productImage?: string;
  storeName?: string;
  logoUrl?: string;
  brandColor?: string;
  brandSubtitle?: string;
  brandSettings?: ConfirmationBrandSettings;
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
  brandColor,
  brandSubtitle,
  brandSettings,
}: Props) {
  const settings: ConfirmationBrandSettings = {
    ...DEFAULT_CONFIRMATION_BRAND_SETTINGS,
    ...(brandSettings || {}),
    ...(brandColor ? { brandColor } : {}),
    ...(brandSubtitle ? { brandSubtitle } : {}),
  };
  const accent = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(settings.brandColor)
    ? settings.brandColor
    : '#27342D';
  const [status, setStatus] = useState<ConfirmStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const darkMode = settings.themeMode === 'dark';
  const backgroundClassMap: Record<string, string> = {
    aurora: trackingStyles.bgAurora,
    midnight: darkMode ? trackingStyles.bgMidnight : trackingStyles.bgMidnightLight,
    minimal: trackingStyles.bgMinimal,
    sunset: trackingStyles.bgSunset,
    emerald: trackingStyles.bgEmerald,
    mesh: trackingStyles.bgMesh,
    linen: trackingStyles.bgLinen,
    porcelain: trackingStyles.bgPorcelain,
    slate: trackingStyles.bgSlate,
    ocean: trackingStyles.bgOcean,
    terracotta: trackingStyles.bgTerracotta,
    plum: trackingStyles.bgPlum,
    blueprint: trackingStyles.bgBlueprint,
    sandstone: trackingStyles.bgSandstone,
    zellige: trackingStyles.bgZellige,
    blockprint: trackingStyles.bgBlockprint,
    weave: trackingStyles.bgWeave,
    mashrabiya: trackingStyles.bgMashrabiya,
    amazigh: trackingStyles.bgAmazigh,
    embroidery: trackingStyles.bgEmbroidery,
    blobs: trackingStyles.bgBlobs,
  };
  const backgroundClass = backgroundClassMap[String(settings.bgStyle)] || trackingStyles.bgAurora;

  const surfaceClassMap: Record<string, string> = {
    glass: trackingStyles.cardGlass,
    solid: trackingStyles.cardSolid,
    bordered: trackingStyles.cardBordered,
    borderless: trackingStyles.cardBorderless,
    elevated: trackingStyles.cardElevated,
    tinted: trackingStyles.cardTinted,
    paper: trackingStyles.cardPaper,
    inset: trackingStyles.cardInset,
  };
  const surfaceClass = surfaceClassMap[String(settings.cardSurface)] || trackingStyles.cardGlass;

  const radiusClass = settings.cardRadius === 'sleek'
    ? trackingStyles.radiusSleek
    : settings.cardRadius === 'pebble'
      ? trackingStyles.radiusPebble
      : trackingStyles.radiusModern;

  const fontClass = settings.fontFamily === 'cairo' ? trackingStyles.fontCairo
    : settings.fontFamily === 'tajawal' ? trackingStyles.fontTajawal
    : settings.fontFamily === 'ibm-plex' ? trackingStyles.fontIbmPlex
    : settings.fontFamily === 'noto-kufi' ? trackingStyles.fontNotoKufi
    : trackingStyles.fontReadex;

  const animationClass = settings.animationLevel === 'none'
    ? trackingStyles.animNone
    : settings.animationLevel === 'subtle'
      ? trackingStyles.animSubtle
      : '';
  const blobAnimationClass = String(settings.bgStyle) === 'blobs' && settings.animateBackgroundBlobs
    ? trackingStyles.animateBlobs
    : '';
  const backgroundBlurClass = settings.backgroundBlur !== false
    ? trackingStyles.backgroundBlurEnabled
    : '';

  const expandedAccent = accent.length === 4
    ? '#' + accent[1] + accent[1] + accent[2] + accent[2] + accent[3] + accent[3]
    : accent;
  const dynamicStyle = {
    '--confirm-brand': accent,
    '--brand-primary': accent,
    '--brand-primary-light': expandedAccent + '14',
    '--brand-primary-border': expandedAccent + '35',
    '--brand-glow': expandedAccent + '20',
    '--brand-on-primary': getReadableBrandForeground(accent),
  } as React.CSSProperties;

  const showProductSection = settings.showProductSection !== false;
  const showOrderNumber = settings.showOrderNumberBadge !== false;
  const supportNumber = (settings.supportPhone || '').replace(/[^0-9]/g, '').replace(/^0/, '213');
  const waSupportUrl = settings.showWhatsAppButton !== false && supportNumber
    ? 'https://wa.me/' + supportNumber + '?text=' + encodeURIComponent(
        'السلام عليكم، أود الاستفسار عن طلبي رقم (' + (orderNumber || '') + ') لدى متجر ' + (storeName || 'المتجر') + '.'
      )
    : null;

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
    <main
      className={[
        styles.page,
        backgroundClass,
        darkMode ? trackingStyles.themeDark : '',
        surfaceClass,
        radiusClass,
        fontClass,
        animationClass,
        blobAnimationClass,
        backgroundBlurClass,
      ].filter(Boolean).join(' ')}
      dir="rtl"
      style={dynamicStyle}
    >
      <div className={trackingStyles.backgroundBlurLayer} aria-hidden="true" />

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
              <div className={styles.storeCaption}>{settings.brandSubtitle?.trim() || 'يسعدنا خدمتك'}</div>
            </div>
          </header>
        )}

        {settings.announcementText?.trim() && (
          <div className={styles.announcementBanner}>
            <span className={styles.announcementMark}>تنبيه</span>
            <span>{settings.announcementText}</span>
          </div>
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
                showProductSection={showProductSection}
                showOrderNumber={showOrderNumber}
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
            <ResponseState status={status} orderNumber={orderNumber} showOrderNumber={showOrderNumber} />
          )}
        </div>

        <footer className={styles.footer}>
          <span>تأكيد طلبك بكل سهولة عبر</span>
          <strong>TajerTrack</strong>
        </footer>
        {waSupportUrl && (
          <a className={styles.supportLink} href={waSupportUrl} target="_blank" rel="noreferrer">
            <WhatsAppIcon />
            <span>تحتاج مساعدة؟ تواصل مع المتجر</span>
          </a>
        )}
      </section>
    </main>
  );
}

function OrderSummary({
  orderNumber,
  productName,
  productImage,
  showProductSection,
  showOrderNumber,
}: {
  orderNumber?: string;
  productName?: string;
  productImage?: string;
  showProductSection: boolean;
  showOrderNumber: boolean;
}) {
  const hasProduct = showProductSection && Boolean(productName || productImage);
  const hasOrderNumber = showOrderNumber && Boolean(orderNumber);
  if (!hasOrderNumber && !hasProduct) return null;

  return (
    <section className={styles.orderSummary} aria-label="تفاصيل الطلب">
      <div className={styles.summaryHeading}>تفاصيل طلبك</div>
      {hasProduct && (
        <div className={styles.productRow}>
          {productImage && (
            <img className={styles.productImage} src={toCachedImageUrl(productImage)} alt={productName || 'صورة المنتج'} />
          )}
          {productName && <strong className={styles.productName}>{productName}</strong>}
        </div>
      )}
      {hasOrderNumber && orderNumber && (
        <div className={styles.orderNumberRow}>
          <span>رقم الطلب</span>
          <strong dir="ltr">#{orderNumber}</strong>
        </div>
      )}
    </section>
  );
}

function ResponseState({ status, orderNumber, showOrderNumber }: { status: Exclude<ConfirmStatus, 'pending'>; orderNumber?: string; showOrderNumber: boolean }) {
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
      {showOrderNumber && orderNumber && <div className={styles.responseOrder}>رقم الطلب <strong dir="ltr">#{orderNumber}</strong></div>}
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

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 7.5 7.5v.5Z" />
      <path d="M8.8 8.2c.2-.4.4-.4.7-.4h.4c.2 0 .3.1.4.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1.1 1.4 1.8 1.8.2.1.4.1.6-.1l.7-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.3.6-.1.5-.4 1-1 1.2-.5.2-1.2.2-1.8 0-1-.3-2.3-1.2-3.2-2.2-.8-.9-1.5-2.1-1.5-2.9 0-.6.1-1.2.3-1.9Z" />
    </svg>
  );
}

function getReadableBrandForeground(hex: string): string {
  const normalized = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return '#FFFFFF';
  const full = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithInk = (luminance + 0.05) / (0.006 + 0.05);
  return contrastWithWhite >= contrastWithInk ? '#FFFFFF' : '#17211B';
}
function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
