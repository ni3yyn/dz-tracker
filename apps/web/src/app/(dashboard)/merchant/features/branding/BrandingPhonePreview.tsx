import React, { memo } from 'react';
import { toCachedImageUrl } from '../../../../../lib/imageProxy';
import type { EditableBrandSettings } from '../../shared/branding-types';
import {
  BRANDING_MOTIFS,
  SAMPLE_PREVIEW_EVENTS,
  getReadableBrandAccent,
  getReadableOnBrand,
} from './branding-options';

/* =========================================================
   PHONE PREVIEW — Fully isolated memo component.
   Re-renders ONLY when the deferred brandConfig settles —
   never triggered by the 1800-line parent's other state.
   ========================================================= */
export const BrandingPhonePreview = memo(function BrandingPhonePreview({
  brandConfig,
  storeName,
}: {
  brandConfig: EditableBrandSettings;
  storeName: string;
}) {
  const isDark = brandConfig.themeMode === 'dark';
  const backgroundTokens: Record<string, { light: string; dark: string; surface?: string; surfaceDark?: string; image?: string; size?: string }> = {
    aurora: { light: '#F2F1ED', dark: '#222924', surface: '#FFFEFA', surfaceDark: '#1D2420', image: 'radial-gradient(ellipse at 12% 7%, rgba(166,205,177,.38), transparent 38%), radial-gradient(ellipse at 91% 20%, rgba(245,204,148,.28), transparent 36%), radial-gradient(ellipse at 55% 100%, rgba(189,202,211,.23), transparent 42%)' },
    midnight: { light: '#E5E9E6', dark: '#151A18', surface: '#F7F9F6', surfaceDark: '#1D2420', image: `radial-gradient(circle at 16% 16%, rgba(215,229,218,.13), transparent 32%), ${BRANDING_MOTIFS.stars}`, size: 'auto, 160px 160px' },
    minimal: { light: '#F8F8F5', dark: '#252825', surface: '#FFFFFF', surfaceDark: '#202420', image: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.72), transparent 55%)' },
    sunset: { light: '#F4EEE5', dark: '#2B2420', surface: '#FFFAF2', surfaceDark: '#2B2420', image: `radial-gradient(ellipse at 85% 15%, rgba(241,174,118,.24), transparent 44%), ${BRANDING_MOTIFS.arches}`, size: 'auto, 210px 240px' },
    emerald: { light: '#EDF1EB', dark: '#1A2920', surface: '#FBFDF9', surfaceDark: '#1D2922', image: BRANDING_MOTIFS.leaves, size: '190px 190px' },
    mesh: { light: '#F0F2F1', dark: '#202624', image: `linear-gradient(rgba(42,62,52,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(42,62,52,.04) 1px, transparent 1px), ${BRANDING_MOTIFS.blueprint}`, size: '18px 18px, 18px 18px, 180px 180px', surface: '#FCFDFC', surfaceDark: '#1D2420' },
    linen: { light: '#F2EEE5', dark: '#292720', surface: '#FFFDF7', surfaceDark: '#292720', image: 'repeating-linear-gradient(0deg, rgba(112,92,62,.035) 0, rgba(112,92,62,.035) 1px, transparent 1px, transparent 5px)' },
    porcelain: { light: '#F5F0F3', dark: '#27232A', surface: '#FFFBFD', surfaceDark: '#27232A', image: BRANDING_MOTIFS.hearts, size: '150px 150px' },
    slate: { light: '#E6E9EC', dark: '#20262D', surface: '#F8FAFB', surfaceDark: '#20262D', image: BRANDING_MOTIFS.contours, size: '260px 210px' },
    ocean: { light: '#E7F1F1', dark: '#1C2A2B', surface: '#FBFFFF', surfaceDark: '#1C2A2B', image: BRANDING_MOTIFS.waves, size: '300px 180px' },
    terracotta: { light: '#F3E8E1', dark: '#30231F', surface: '#FFFAF6', surfaceDark: '#30231F', image: `radial-gradient(ellipse at 50% 0%, rgba(255,220,184,.36), transparent 46%), ${BRANDING_MOTIFS.arches}`, size: 'auto, 210px 240px' },
    plum: { light: '#F0EBF3', dark: '#29232E', surface: '#FDFAFF', surfaceDark: '#29232E', image: `radial-gradient(ellipse at 15% 10%, rgba(218,195,231,.32), transparent 43%), ${BRANDING_MOTIFS.petals}`, size: 'auto, 170px 170px' },
    blueprint: { light: '#EAF0F7', dark: '#1D2734', image: BRANDING_MOTIFS.blueprint, size: '180px 180px', surface: '#FBFDFF', surfaceDark: '#1D2734' },
    sandstone: { light: '#F1EEE5', dark: '#2B2923', image: BRANDING_MOTIFS.dunes, size: '280px 180px', surface: '#FFFDF6', surfaceDark: '#2B2923' },
    zellige: { light: '#EDEFE7', dark: '#202821', surface: '#FBFCF8', surfaceDark: '#242D26', image: BRANDING_MOTIFS.zellige, size: '144px 144px' },
    blockprint: { light: '#F3EDE3', dark: '#2B2520', surface: '#FFFBF5', surfaceDark: '#302923', image: BRANDING_MOTIFS.blockprint, size: '180px 180px' },
    weave: { light: '#F0F1E9', dark: '#202620', surface: '#FBFCF8', surfaceDark: '#252D26', image: BRANDING_MOTIFS.weave, size: '54px 54px' },
    mashrabiya: { light: '#EFF1E9', dark: '#202821', surface: '#FBFCF8', surfaceDark: '#242D26', image: BRANDING_MOTIFS.mashrabiya, size: '112px 112px' },
    amazigh: { light: '#F2ECE3', dark: '#2A2420', surface: '#FFFBF5', surfaceDark: '#302923', image: BRANDING_MOTIFS.amazigh, size: '144px 96px' },
    embroidery: { light: '#F2F0E8', dark: '#272821', surface: '#FFFEFA', surfaceDark: '#292A23', image: BRANDING_MOTIFS.embroidery, size: '160px 160px' },
    blobs: { light: '#F2F0EA', dark: '#202722', surface: '#FFFEFA', surfaceDark: '#242D27', image: 'radial-gradient(ellipse at 16% 18%, rgba(104,157,126,.16), transparent 34%), radial-gradient(ellipse at 84% 77%, rgba(207,145,115,.17), transparent 36%), radial-gradient(ellipse at 70% 9%, rgba(126,144,196,.11), transparent 28%)', size: 'auto' },
  };
  const backgroundToken = backgroundTokens[String(brandConfig.bgStyle)] || backgroundTokens.aurora;
  const screenBg = isDark ? backgroundToken.dark : backgroundToken.light;
  const textColor = isDark ? '#F2F4EF' : '#202824';
  const mutedColor = isDark ? '#B4BDB6' : '#69736E';
  const quietColor = isDark ? '#89958D' : '#8B948F';
  const borderColor = isDark ? 'rgba(245,248,243,.13)' : '#E5E6DF';
  const strongBorderColor = isDark ? 'rgba(245,248,243,.2)' : '#D5D9D1';
  const raisedSurface = isDark ? '#232C27' : '#FFFFFF';
  const baseSurface = isDark ? (backgroundToken.surfaceDark || backgroundToken.dark) : (backgroundToken.surface || '#FFFEFA');
  const isBorderless = brandConfig.cardSurface === 'borderless';
  const isOpenCanvas = isBorderless || brandConfig.cardSurface === 'solid';
  const cardBg = isOpenCanvas ? 'transparent'
    : brandConfig.cardSurface === 'glass' ? (isDark ? 'rgba(29,36,32,.84)' : 'rgba(255,254,250,.84)')
    : String(brandConfig.cardSurface) === 'tinted' ? (isDark ? `color-mix(in srgb, ${brandConfig.brandColor} 13%, #1D2420)` : `color-mix(in srgb, ${brandConfig.brandColor} 6%, #FFFEFA)`)
    : String(brandConfig.cardSurface) === 'inset' ? (isDark ? '#1A211D' : '#F2F3EE')
    : String(brandConfig.cardSurface) === 'paper' ? (isDark ? '#252720' : '#FFFDF7')
    : baseSurface;
  const cardBorder = brandConfig.cardSurface === 'bordered' || String(brandConfig.cardSurface) === 'paper' || String(brandConfig.cardSurface) === 'inset' || String(brandConfig.cardSurface) === 'tinted'
    ? `1px solid ${strongBorderColor}`
    : isOpenCanvas ? 'none' : String(brandConfig.cardSurface) === 'elevated' ? '1px solid transparent' : `1px solid ${borderColor}`;
  const radiusTokens = brandConfig.cardRadius === 'sharp'
    ? { card: '0px', panel: '0px', control: '0px', timeline: '0px', badge: '0px', avatar: '0px', marker: '0px', floating: '0px', notice: '0px' }
    : brandConfig.cardRadius === 'sleek'
      ? { card: '14px', panel: '10px', control: '9px', timeline: '9px', badge: '9px', avatar: '14px', marker: '5px', floating: '14px', notice: '10px' }
      : brandConfig.cardRadius === 'pebble'
        ? { card: '38px', panel: '21px', control: '15px', timeline: '15px', badge: '999px', avatar: '20px', marker: '12px', floating: '999px', notice: '18px' }
        : { card: '26px', panel: '16px', control: '12px', timeline: '12px', badge: '12px', avatar: '18px', marker: '7px', floating: '16px', notice: '12px' };
  const cardRadius = radiusTokens.card;
  const cardShadow = brandConfig.cardSurface === 'bordered' || String(brandConfig.cardSurface) === 'inset' || isOpenCanvas
    ? 'none'
    : String(brandConfig.cardSurface) === 'elevated' ? '0 18px 38px rgba(17,31,22,.17)'
    : String(brandConfig.cardSurface) === 'paper' ? '0 3px 0 rgba(50,43,32,.035), 0 12px 24px rgba(17,31,22,.055)'
    : '0 12px 30px rgba(17,31,22,.10)';
  const fontFamily = brandConfig.fontFamily === 'cairo' ? "'Cairo', system-ui, sans-serif"
    : brandConfig.fontFamily === 'tajawal' ? "'Tajawal', system-ui, sans-serif"
    : brandConfig.fontFamily === 'ibm-plex' ? "'IBM Plex Sans Arabic', system-ui, sans-serif"
    : brandConfig.fontFamily === 'noto-kufi' ? "'Noto Kufi Arabic', system-ui, sans-serif"
    : "'Readex Pro', system-ui, sans-serif";
  const cardWidth = '100%';
  const density = { padding: '16px 14px', gap: '12px', avatar: '39px', avatarRadius: radiusTokens.avatar, topMargin: '14px' };
  const panelRadius = radiusTokens.panel;
  const softFill = isDark ? 'rgba(255,255,255,.045)' : 'rgba(32,40,36,.035)';
  const brandTint = `${brandConfig.brandColor}16`;

  return (
    <div className="dz-phone-chassis">
      <div className="dz-phone-notch"><div className="dz-phone-speaker" /></div>
      <div
        className="dz-phone-screen"
        data-background-style={String(brandConfig.bgStyle)}
        data-animate-blobs={brandConfig.animateBackgroundBlobs ? 'true' : 'false'}
        data-background-blur={brandConfig.backgroundBlur !== false ? 'true' : 'false'}
        data-theme-mode={brandConfig.themeMode}
        style={{
          backgroundColor: screenBg,
          backgroundImage: 'none',
          color: textColor,
          fontFamily,
          ['--preview-brand' as string]: brandConfig.brandColor,
          ['--preview-text' as string]: textColor,
          ['--preview-muted' as string]: mutedColor,
          ['--preview-border' as string]: borderColor,
          ['--preview-surface' as string]: raisedSurface,
          ['--preview-tint' as string]: brandTint,
          ['--preview-radius-timeline' as string]: radiusTokens.timeline,
          ['--preview-radius-marker' as string]: radiusTokens.marker,
          transition: 'background-color .2s ease, color .2s ease',
        } as React.CSSProperties}
      >
        <div
          className="dz-preview-background-blur"
          aria-hidden="true"
          style={{
            backgroundColor: screenBg,
            backgroundImage: backgroundToken.image,
            backgroundSize: backgroundToken.size || 'auto',
            backgroundRepeat: 'repeat',
            backgroundPosition: '0 0',
          }}
        />
        <div className="dz-phone-scroll-viewport">
        <div style={{ width: cardWidth, maxWidth: '100%', margin: '0 auto', background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none', overflow: 'visible', position: 'relative', zIndex: 1, transition: 'width .2s ease' }}>
          <div style={{ height: '4px', width: '100%', background: brandConfig.brandColor }} />

          <header style={{ padding: density.padding, borderBottom: `1px solid ${borderColor}` }}>
            {brandConfig.announcementText && (
              <div style={{ background: brandTint, border: `1px solid ${brandConfig.brandColor}35`, color: textColor, padding: '9px 11px', borderRadius: radiusTokens.notice, fontSize: '12px', lineHeight: 1.7, fontWeight: 600, marginBottom: density.topMargin, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: getReadableBrandAccent(brandConfig.brandColor, brandConfig.themeMode), fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>تنبيه</span>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{brandConfig.announcementText}</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '7px', marginBottom: density.topMargin }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: mutedColor, fontSize: '12px', fontWeight: 750 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '2px', transform: 'rotate(45deg)', background: brandConfig.brandColor }} />
                تتبّع الطلب
              </span>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                {brandConfig.showOrderNumberBadge !== false && (
                  <span style={{ fontSize: '10px', color: mutedColor, background: softFill, border: `1px solid ${borderColor}`, padding: '5px 7px', borderRadius: radiusTokens.badge, whiteSpace: 'nowrap' }}>
                    طلب <b style={{ color: textColor }} dir="ltr">DZ-1042</b>
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: density.gap, minWidth: 0 }}>
              <div style={{ width: density.avatar, height: density.avatar, borderRadius: density.avatarRadius, background: brandConfig.brandColor, color: getReadableOnBrand(brandConfig.brandColor), display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, fontSize: '17px', overflow: 'hidden' }}>
                {brandConfig.logoUrl ? (
                  <img
                    src={toCachedImageUrl(brandConfig.logoUrl)}
                    alt={storeName}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  storeName.trim().charAt(0) || 'م'
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '15px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{storeName}</div>
                {brandConfig.brandSubtitle && <div style={{ fontSize: '12px', lineHeight: 1.6, marginTop: '3px', color: mutedColor, overflowWrap: 'anywhere' }}>{brandConfig.brandSubtitle}</div>}
              </div>
            </div>
          </header>

          <section aria-label="معلومات العميل والمنتج" style={{ padding: '15px 14px 16px', borderBottom: `1px solid ${borderColor}`, display: 'grid', gridTemplateColumns: brandConfig.showProductSection !== false ? 'minmax(0, .9fr) minmax(0, 1.1fr)' : 'minmax(0, 1fr)', gap: '13px', alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: quietColor, fontSize: '10px', fontWeight: 750, marginBottom: '5px' }}>العميل</div>
              <div style={{ color: textColor, fontSize: '17px', lineHeight: 1.55, fontWeight: 850, overflowWrap: 'anywhere' }}>ليان بن صالح</div>
            </div>
            {brandConfig.showProductSection !== false && <div style={{ minWidth: 0, paddingInlineStart: '12px', borderInlineStart: `2px solid ${brandConfig.brandColor}70` }}>
              <div style={{ color: quietColor, fontSize: '10px', fontWeight: 750, marginBottom: '5px' }}>المنتج</div>
              <div style={{ color: textColor, fontSize: '15px', lineHeight: 1.6, fontWeight: 800, overflowWrap: 'anywhere' }}>حقيبة جلدية زيتونية</div>
            </div>}
          </section>

          <section style={{ padding: '15px 13px 21px', borderBottom: `1px solid ${borderColor}` }}>
            <div style={{ border: isOpenCanvas ? 'none' : cardBorder, borderInlineStart: isBorderless ? 'none' : `3px solid ${brandConfig.brandColor}`, borderRadius: isOpenCanvas ? 0 : cardRadius, background: isOpenCanvas ? 'transparent' : cardBg, boxShadow: isOpenCanvas ? 'none' : cardShadow, backdropFilter: brandConfig.cardSurface === 'glass' ? 'blur(10px)' : undefined, WebkitBackdropFilter: brandConfig.cardSurface === 'glass' ? 'blur(10px)' : undefined, padding: isOpenCanvas ? '8px 0 12px' : '15px 13px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '5px 10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: mutedColor }}>آخر تحديث</span>
                <span style={{ fontSize: '10px', color: quietColor, whiteSpace: 'nowrap' }}>اليوم · 10:42</span>
              </div>
              <div style={{ color: textColor, fontSize: '17px', lineHeight: 1.65, fontWeight: 850, overflowWrap: 'anywhere' }}>خرج للتوصيل مع المندوب</div>
              <p style={{ margin: '6px 0 0', color: mutedColor, fontSize: '12px', lineHeight: 1.8 }}>الشحنة في مرحلة التوصيل النهائية. ستظهر أي تفاصيل جديدة هنا.</p>
            </div>

            {brandConfig.showCarrierBadge && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '15px', padding: '12px 0', borderBlock: `1px solid ${borderColor}`, minWidth: 0 }}>
                <span style={{ width: '31px', height: '31px', display: 'grid', placeItems: 'center', borderRadius: radiusTokens.control, background: brandTint, color: getReadableBrandAccent(brandConfig.brandColor, brandConfig.themeMode), flexShrink: 0, fontWeight: 800, fontSize: '15px' }}>↗</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '11px', color: mutedColor, marginBottom: '3px' }}>ياليدين</span>
                  <strong style={{ display: 'block', fontSize: '13px', color: textColor, overflowWrap: 'anywhere' }} dir="ltr">12839401</strong>
                </span>
                <span style={{ fontSize: '11px', color: getReadableBrandAccent(brandConfig.brandColor, brandConfig.themeMode), fontWeight: 750, flexShrink: 0 }}>نسخ</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', margin: '22px 0 15px', paddingTop: '18px', borderTop: `1px solid ${borderColor}` }}>
              <div style={{ fontSize: '16px', fontWeight: 850, letterSpacing: '-.02em', color: textColor }}>سجل التحديثات</div>
              <span style={{ minWidth: '23px', height: '23px', padding: '2px 6px', borderRadius: radiusTokens.badge, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: mutedColor, background: softFill, fontSize: '11px', fontWeight: 750 }}>{SAMPLE_PREVIEW_EVENTS.length - 1}</span>
            </div>

            {SAMPLE_PREVIEW_EVENTS.slice(1).map((event, index) => {
              const timelineKind = String(brandConfig.timelineDesign);
              const isLast = index === SAMPLE_PREVIEW_EVENTS.length - 2;
              return (
                <div key={event.id} className={`dz-preview-event dz-preview-event--${timelineKind}${isLast ? ' is-last' : ''}`}>
                  <div className="dz-preview-event-gutter" aria-hidden="true">
                    <span className="dz-preview-event-marker">{timelineKind === 'numbered' ? (index + 1).toLocaleString('ar-DZ') : timelineKind === 'editorial' ? '' : '✓'}</span>
                    {!isLast && !['cards', 'compact', 'milestones', 'dossier'].includes(timelineKind) && brandConfig.timelineLineStyle !== 'none' && (
                      <span className={`dz-preview-event-line dz-preview-event-line--${brandConfig.timelineLineStyle || 'straight'}`}>
                        {brandConfig.timelineLineStyle === 'curved' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C2 23 2 77 12 100" /></svg>}
                        {brandConfig.timelineLineStyle === 'wave' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C0 14 0 25 12 36 S24 60 12 72 S0 88 12 100" /></svg>}
                      </span>
                    )}
                  </div>
                  <div className="dz-preview-event-content">
                    {['editorial', 'dossier', 'milestones'].includes(timelineKind) && (
                      <div className="dz-preview-event-kicker">{timelineKind === 'dossier' ? `سجل الشحنة / ${String(index + 1).padStart(2, '0')}` : timelineKind === 'milestones' ? 'محطة من الرحلة' : `المرحلة ${String(index + 1).padStart(2, '0')}`}</div>
                    )}
                    <div className="dz-preview-event-head">
                      <strong>{event.title}</strong>
                      <time>أمس · 22:15</time>
                    </div>
                    {event.description && <p>{event.description}</p>}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
        </div>
      </div>
      {brandConfig.supportPhone && brandConfig.showWhatsAppButton !== false && (
        <div aria-hidden="true" style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 40, display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 12px', borderRadius: radiusTokens.floating, background: '#188B55', color: '#fff', boxShadow: '0 7px 18px rgba(18,107,63,.25)', fontSize: '11px', fontWeight: 800, pointerEvents: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 7.5 7.5v.5Z" /></svg> تواصل معنا
        </div>
      )}
    </div>
  );
});
