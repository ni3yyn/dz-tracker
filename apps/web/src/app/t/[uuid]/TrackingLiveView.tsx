'use client';

import React, { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@saas/database';
import { TimelineEvent, BrandSettings, DEFAULT_BRAND_SETTINGS } from '@saas/ui';
import styles from './t.module.css';

type TimelineLineStyle = 'straight' | 'dashed' | 'dotted' | 'curved' | 'wave' | 'none';
type TrackingBrandSettings = BrandSettings & { showWhatsAppButton?: boolean; animateBackgroundBlobs?: boolean; backgroundBlur?: boolean; timelineLineStyle?: TimelineLineStyle };

interface Props {
  orderId: string;
  externalOrderId: string;
  customerName: string | null;
  productName: string | null;
  carrierName?: string | null;
  carrierTrackingNumber?: string | null;
  storeName: string;
  brandSettings?: BrandSettings;
  brandColor?: string;
  brandSubtitle?: string;
  initialEvents: TimelineEvent[];
}

const Icons = {
  Truck: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5h12v12H2z" />
      <path d="M14 9h4l4 4v4h-8z" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </svg>
  ),
  Package: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 21v-8.9" />
    </svg>
  ),
  Copy: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  WhatsApp: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 7.5 7.5v.5Z" />
      <path d="M8.8 8.2c.2-.4.4-.4.7-.4h.4c.2 0 .3.1.4.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1.1 1.4 1.8 1.8.2.1.4.1.6-.1l.7-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.3.6-.1.5-.4 1-1 1.2-.5.2-1.2.2-1.8 0-1-.3-2.3-1.2-3.2-2.2-.8-.9-1.5-2.1-1.5-2.9 0-.6.1-1.2.3-1.9Z" />
    </svg>
  ),
};

function getReadableBrandForeground(hex: string): string {
  const normalized = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return '#FFFFFF';
  const full = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithInk = (luminance + 0.05) / (0.006 + 0.05);
  return contrastWithWhite >= contrastWithInk ? '#FFFFFF' : '#17211B';
}

function getReadableBrandAccent(hex: string, themeMode: string | undefined): string {
  const normalized = (hex || '').replace('#', '').trim();
  const fallback = themeMode === 'dark' ? '#D4E6D8' : '#28513B';
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  const full = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const bgHex = themeMode === 'dark' ? '#202622' : '#F4F5F1';
  const bgChannels = [0, 2, 4].map((index) => parseInt(bgHex.slice(index + 1, index + 3), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const bgLuminance = 0.2126 * bgChannels[0] + 0.7152 * bgChannels[1] + 0.0722 * bgChannels[2];
  const contrast = (Math.max(luminance, bgLuminance) + 0.05) / (Math.min(luminance, bgLuminance) + 0.05);
  return contrast >= 4.5 ? `#${full}` : fallback;
}

function sanitizePhone(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = `213${cleaned.substring(1)}`;
  return cleaned;
}

function cleanName(name: string | null | undefined): string {
  return (name || '').replace(/[-_]$/, '').trim();
}

function formatEventDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ar-DZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatEventTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ar-DZ', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusTone(title: string | undefined): string {
  const value = (title || '').toLocaleLowerCase();
  if (/تم التسليم|تم التوصيل|delivered|livr[eé]/.test(value)) return styles.statusDelivered;
  if (/تعذر|مشكلة|مرتجع|فشل|لم يتم الرد|failed|return|incident/.test(value)) return styles.statusAttention;
  if (/توصيل|مندوب|شحن|طريق|transit|shipped|dispatch|delivery/.test(value)) return styles.statusInTransit;
  return styles.statusNeutral;
}

export function TrackingLiveView({
  orderId,
  externalOrderId,
  customerName,
  productName,
  carrierName,
  carrierTrackingNumber,
  storeName,
  brandSettings,
  brandColor,
  brandSubtitle,
  initialEvents,
}: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [isLive, setIsLive] = useState(false);
  const [copied, setCopied] = useState(false);

  const storedSettings = brandSettings as TrackingBrandSettings | undefined;
  const settings: TrackingBrandSettings = {
    ...DEFAULT_BRAND_SETTINGS,
    ...(storedSettings || {}),
    ...(brandColor ? { brandColor } : {}),
    ...(brandSubtitle ? { brandSubtitle } : {}),
    // Existing merchants keep the current enabled-by-default behavior; the new toggle can turn it off.
    showWhatsAppButton: storedSettings?.showWhatsAppButton ?? true,
    animateBackgroundBlobs: storedSettings?.animateBackgroundBlobs ?? false,
    backgroundBlur: storedSettings?.backgroundBlur ?? true,
    timelineLineStyle: storedSettings?.timelineLineStyle ?? 'straight',
  };

  const dynamicStyle = {
    '--brand-primary': settings.brandColor,
    '--brand-primary-light': `${settings.brandColor}14`,
    '--brand-primary-border': `${settings.brandColor}35`,
    '--brand-glow': `${settings.brandColor}20`,
    '--brand-on-primary': getReadableBrandForeground(settings.brandColor),
    '--brand-readable': getReadableBrandAccent(settings.brandColor, settings.themeMode),
  } as React.CSSProperties;

  const latestEvent = events[0];
  const latestEventDate = latestEvent ? formatEventDate(latestEvent.date) : '';
  const latestEventTime = latestEvent ? formatEventTime(latestEvent.date) : '';
  const toneClass = statusTone(latestEvent?.title);
  const previousEvents = events.slice(1);

  const copyTracking = async () => {
    if (!carrierTrackingNumber) return;
    let didCopy = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(carrierTrackingNumber);
        didCopy = true;
      }
    } catch {
      // Fall through to the legacy copy path for browsers that block clipboard access.
    }

    if (!didCopy) {
      try {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = carrierTrackingNumber;
        temporaryInput.setAttribute('readonly', '');
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        didCopy = document.execCommand('copy');
        document.body.removeChild(temporaryInput);
      } catch {
        didCopy = false;
      }
    }

    setCopied(didCopy);
    if (didCopy) window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`realtime-order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_history',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            id: string;
            status_title: string;
            created_at: string;
            description: string | null;
          };
          setEvents((previous) => [
            {
              id: newRow.id,
              title: newRow.status_title,
              date: newRow.created_at,
              description: newRow.description,
              isCurrent: true,
            },
            ...previous.map((event) => ({ ...event, isCurrent: false })),
          ]);
        }
      )
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const backgroundClassMap: Record<string, string> = {
    aurora: styles.bgAurora,
    midnight: settings.themeMode === 'dark' ? styles.bgMidnight : styles.bgMidnightLight,
    minimal: styles.bgMinimal,
    sunset: styles.bgSunset,
    emerald: styles.bgEmerald,
    mesh: styles.bgMesh,
    linen: styles.bgLinen,
    porcelain: styles.bgPorcelain,
    slate: styles.bgSlate,
    ocean: styles.bgOcean,
    terracotta: styles.bgTerracotta,
    plum: styles.bgPlum,
    blueprint: styles.bgBlueprint,
    sandstone: styles.bgSandstone,
    zellige: styles.bgZellige,
    blockprint: styles.bgBlockprint,
    weave: styles.bgWeave,
    mashrabiya: styles.bgMashrabiya,
    amazigh: styles.bgAmazigh,
    embroidery: styles.bgEmbroidery,
    blobs: styles.bgBlobs,
  };
  const backgroundClass = backgroundClassMap[settings.bgStyle] || styles.bgAurora;

  const surfaceClass =
    settings.cardSurface === 'solid' ? styles.cardSolid
    : settings.cardSurface === 'bordered' ? styles.cardBordered
    : settings.cardSurface === 'borderless' ? styles.cardBorderless
    : String(settings.cardSurface) === 'elevated' ? styles.cardElevated
    : String(settings.cardSurface) === 'tinted' ? styles.cardTinted
    : String(settings.cardSurface) === 'paper' ? styles.cardPaper
    : String(settings.cardSurface) === 'inset' ? styles.cardInset
    : styles.cardGlass;

  const radiusClass =
    settings.cardRadius === 'sleek' ? styles.radiusSleek
    : settings.cardRadius === 'pebble' ? styles.radiusPebble
    : styles.radiusModern;

  const widthClass =
    settings.cardWidth === 'narrow' ? styles.widthNarrow
    : settings.cardWidth === 'wide' ? styles.widthWide
    : settings.cardWidth === 'full' ? styles.widthFull
    : styles.widthStandard;

  const fontClass =
    settings.fontFamily === 'cairo' ? styles.fontCairo
    : settings.fontFamily === 'tajawal' ? styles.fontTajawal
    : settings.fontFamily === 'ibm-plex' ? styles.fontIbmPlex
    : settings.fontFamily === 'noto-kufi' ? styles.fontNotoKufi
    : styles.fontReadex;

  const animationClass = settings.animationLevel === 'none' ? styles.animNone : settings.animationLevel === 'subtle' ? styles.animSubtle : '';
  const densityClass = settings.headerDensity === 'compact' ? styles.densityCompact : settings.headerDensity === 'spacious' ? styles.densitySpacious : styles.densityComfortable;
  const accentClass = settings.accentBarStyle === 'gradient' ? styles.accentGradient : settings.accentBarStyle === 'hidden' ? styles.accentHidden : '';
  const darkMode = settings.themeMode === 'dark';

  const timelineLineClass =
    settings.timelineLineStyle === 'dashed' ? styles.connectorDashed
    : settings.timelineLineStyle === 'dotted' ? styles.connectorDotted
    : settings.timelineLineStyle === 'curved' ? styles.connectorCurved
    : settings.timelineLineStyle === 'wave' ? styles.connectorWave
    : settings.timelineLineStyle === 'none' ? styles.connectorNone
    : styles.connectorStraight;

  const blobAnimationClass = String(settings.bgStyle) === 'blobs' && settings.animateBackgroundBlobs ? styles.animateBlobs : '';
  const backgroundBlurClass = settings.backgroundBlur !== false ? styles.backgroundBlurEnabled : '';

  const timelineDesignClass =
    settings.timelineDesign === 'cards' ? styles.timelineCards
    : settings.timelineDesign === 'journey' ? styles.timelineJourney
    : settings.timelineDesign === 'compact' ? styles.timelineCompact
    : String(settings.timelineDesign) === 'rail' ? styles.timelineRail
    : String(settings.timelineDesign) === 'editorial' ? styles.timelineEditorial
    : String(settings.timelineDesign) === 'milestones' ? styles.timelineMilestones
    : String(settings.timelineDesign) === 'numbered' ? styles.timelineNumbered
    : String(settings.timelineDesign) === 'dossier' ? styles.timelineDossier
    : styles.timelineStepper;

  const waSupportUrl = settings.showWhatsAppButton !== false && settings.supportPhone
    ? `https://wa.me/${sanitizePhone(settings.supportPhone)}?text=${encodeURIComponent(
        `السلام عليكم، أود الاستفسار عن طلبي رقم (${externalOrderId}) لدى متجر ${storeName}.`
      )}`
    : null;

  return (
    <main
      className={`${styles.pageContainer} ${backgroundClass} ${darkMode ? styles.themeDark : ''} ${fontClass} ${animationClass} ${densityClass} ${accentClass} ${waSupportUrl ? styles.hasFloatingSupport : ''} ${blobAnimationClass} ${backgroundBlurClass}`}
      style={dynamicStyle}
    >
      <div className={styles.backgroundBlurLayer} aria-hidden="true" />
      <div className={styles.cardShell}>
        <div className={`${styles.card} ${surfaceClass} ${radiusClass} ${widthClass}`}>
          <div className={styles.brandAccentBar} />

          <header className={styles.header}>
            {settings.announcementText && (
              <div className={styles.announcementBanner}>
                <span className={styles.announcementMark}>تنبيه</span>
                <span>{settings.announcementText}</span>
              </div>
            )}

            <div className={styles.topStatusRow}>
              <span className={styles.pageEyebrow}>تتبّع الطلب</span>
              <div className={styles.topStatusActions}>
                {settings.showLiveBadge !== false && (
                  <span className={`${styles.liveBadge} ${isLive ? styles.liveBadgeOn : ''}`} aria-live="polite">
                    <span className={styles.liveDot} />
                    {isLive ? 'مباشر' : 'جارٍ الاتصال'}
                  </span>
                )}
                {settings.showOrderNumberBadge !== false && (
                  <span className={styles.orderNumberBadge}>
                    <span>طلب</span>
                    <strong dir="ltr">{externalOrderId}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.brandHeaderRow}>
              <div className={styles.brandAvatar} aria-hidden="true">
                {cleanName(storeName).charAt(0) || 'م'}
              </div>
              <div className={styles.brandTextGroup}>
                <h1 className={styles.storeName}>{storeName}</h1>
                {settings.brandSubtitle && <p className={styles.brandSubtitleText}>{settings.brandSubtitle}</p>}
              </div>
            </div>
          </header>

          <section className={styles.trackingSection} aria-label="تفاصيل تتبع الشحنة">
            {(customerName || (settings.showProductSection && productName)) && (
              <section className={`${styles.orderIdentity} ${customerName && settings.showProductSection && productName ? styles.orderIdentitySplit : styles.orderIdentitySolo}`} aria-label="هوية الطلب">
                {customerName && (
                  <div className={styles.orderCustomerBlock}>
                    <span className={styles.orderIdentityLabel}>صاحب الطلب</span>
                    <h2 className={styles.orderCustomerName}>{cleanName(customerName)}</h2>
                  </div>
                )}
                {settings.showProductSection && productName && (
                  <div className={styles.orderProductBlock}>
                    <span className={styles.orderIdentityLabel}>محتويات الشحنة</span>
                    <div className={styles.orderProductNames}>
                      {productName.split('•').map((item, index) => (
                        <span key={`${item.trim()}-${index}`} className={styles.orderProductName}>{item.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className={`${styles.currentStatusPanel} ${toneClass}`} aria-labelledby="current-shipment-status">
              <div className={styles.currentStatusTop}>
                <span className={styles.currentStatusLabel}>{latestEvent ? 'آخر تحديث' : 'حالة الطلب'}</span>
                {latestEvent && (
                  <time className={styles.currentStatusTime} dateTime={String(latestEvent.date)}>
                    {latestEventDate}{latestEventTime ? ` · ${latestEventTime}` : ''}
                  </time>
                )}
              </div>
              <div className={styles.currentStatusBody}>
                <span className={styles.currentStatusMark} aria-hidden="true">
                  {latestEvent ? <span className={styles.currentStatusMarkCore} /> : <Icons.Package />}
                </span>
                <div className={styles.currentStatusCopy}>
                  <h2 id="current-shipment-status">{latestEvent?.title || 'تم إنشاء رابط التتبع'}</h2>
                  {latestEvent?.description ? (
                    <p>{latestEvent.description}</p>
                  ) : !latestEvent ? (
                    <p>ستظهر حالة الشحنة هنا فور تسجيل أول تحديث.</p>
                  ) : null}
                </div>
              </div>
            </section>

            {settings.showCarrierBadge && carrierTrackingNumber && (
              <div className={styles.carrierBadge}>
                <span className={styles.carrierIcon}><Icons.Truck /></span>
                <div className={styles.carrierInfo}>
                  <span className={styles.carrierTextLabel}>{carrierName || 'شركة الشحن'}</span>
                  <strong className={styles.monoNumber} dir="ltr">{carrierTrackingNumber}</strong>
                </div>
                <button
                  type="button"
                  onClick={copyTracking}
                  className={styles.copyBtn}
                  aria-live="polite"
                  aria-label={copied ? 'تم نسخ رقم التتبع' : 'نسخ رقم التتبع'}
                  title={copied ? 'تم النسخ' : 'نسخ رقم التتبع'}
                >
                  {copied ? <Icons.Check /> : <Icons.Copy />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            )}

            <div className={styles.timelineHeading}>
              <h2>سجل التحديثات</h2>
              {previousEvents.length > 0 && <span className={styles.eventCount}>{previousEvents.length.toLocaleString('ar-DZ')}</span>}
            </div>

            {previousEvents.length > 0 ? (
              <ol className={`${styles.eventTimeline} ${timelineDesignClass} ${timelineLineClass}`}>
                {previousEvents.map((event, eventIndex) => {
                  const eventDate = formatEventDate(event.date);
                  const eventTime = formatEventTime(event.date);
                  return (
                    <li key={event.id} className={styles.eventItem}>
                      {eventIndex < previousEvents.length - 1 && !['cards', 'compact', 'milestones', 'dossier'].includes(String(settings.timelineDesign)) && settings.timelineLineStyle !== 'none' && (
                        <span className={styles.eventConnector} aria-hidden="true">
                          {settings.timelineLineStyle === 'curved' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C2 23 2 77 12 100" /></svg>}
                          {settings.timelineLineStyle === 'wave' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C0 14 0 25 12 36 S24 60 12 72 S0 88 12 100" /></svg>}
                        </span>
                      )}
                      <span className={styles.eventMarker} aria-hidden="true">{String(settings.timelineDesign) === 'numbered' ? <span className={styles.eventMarkerNumber}>{(eventIndex + 1).toLocaleString('ar-DZ')}</span> : <Icons.Check />}</span>
                      <article className={styles.eventContent}>
                        <div className={styles.eventHeading}>
                          <h3>{event.title}</h3>
                          <time dateTime={String(event.date)}>
                            {eventDate}{eventTime ? <span className={styles.eventTime}> · {eventTime}</span> : null}
                          </time>
                        </div>
                        {event.description && <p>{event.description}</p>}
                      </article>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={styles.emptyTimeline}>
                {latestEvent ? 'لا توجد تحديثات سابقة بعد.' : 'ستظهر التحديثات المسجلة هنا.'}
              </p>
            )}
          </section>
        </div>
      </div>

      {waSupportUrl && (
        <a
          href={waSupportUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.floatingWhatsApp}
          aria-label={`تواصل مع متجر ${storeName} عبر واتساب بخصوص الطلب ${externalOrderId}`}
        >
          <Icons.WhatsApp />
          <span>تواصل معنا</span>
        </a>
      )}
    </main>
  );
}
