export type BackgroundStyle  = 'aurora' | 'midnight' | 'minimal' | 'sunset' | 'emerald' | 'mesh';
export type TimelineDesign   = 'stepper' | 'cards' | 'journey' | 'compact';
export type CardRadius       = 'sharp' | 'sleek' | 'modern' | 'pebble';
export type CardSurface       = 'glass' | 'solid' | 'bordered' | 'borderless' | 'elevated' | 'tinted' | 'paper' | 'inset' | 'filled';
export type CardSurfaceChoice  = 'filled' | 'glass' | 'bordered' | 'tinted' | 'borderless';

/** Normalize values from earlier branding versions to the current, understandable choices. */
export function normalizeCardSurfaceChoice(surface: CardSurface | string | null | undefined): CardSurfaceChoice {
  switch (surface) {
    case 'filled':
    case 'elevated':
    case 'paper':
    case 'inset':
      return 'filled';
    case 'glass':
      return 'glass';
    case 'bordered':
      return 'bordered';
    case 'tinted':
      return 'tinted';
    case 'solid':
    case 'borderless':
      return 'borderless';
    default:
      return 'glass';
  }
}
export type ThemeMode        = 'light' | 'dark' | 'auto';

/** Arabic-optimised Google Fonts available on the tracking page */
export type FontFamily       = 'readex' | 'cairo' | 'tajawal' | 'ibm-plex' | 'noto-kufi';

/** Maximum width of the floating card */
export type CardWidth        = 'narrow' | 'standard' | 'wide' | 'full';

/** Motion intensity across all animations */
export type AnimationLevel   = 'full' | 'subtle' | 'none';

/** Vertical padding / information density of the page header */
export type HeaderDensity    = 'compact' | 'comfortable' | 'spacious';

/** Decorative top accent bar above the card */
export type AccentBarStyle   = 'solid' | 'gradient' | 'hidden';

export interface BrandSettings {
  /* ── Brand identity ─────────────────────────── */
  brandColor:       string;
  brandSubtitle:    string;
  logoUrl?:         string;

  /* ── Visual theme ───────────────────────────── */
  bgStyle:          BackgroundStyle;
  themeMode:        ThemeMode;
  fontFamily:       FontFamily;
  animationLevel:   AnimationLevel;

  /* ── Timeline ───────────────────────────────── */
  timelineDesign:   TimelineDesign;

  /* ── Card chassis ───────────────────────────── */
  cardSurface:      CardSurface;
  cardRadius:       CardRadius;
  cardWidth:        CardWidth;
  headerDensity:    HeaderDensity;
  accentBarStyle:   AccentBarStyle;

  /* ── Visibility toggles ─────────────────────── */
  showCarrierBadge:     boolean;
  showProductSection:   boolean;
  showLiveBadge:        boolean;
  showOrderNumberBadge: boolean;

  /* ── Customer experience ────────────────────── */
  supportPhone?:          string;
  announcementText?:      string;
  showEstimatedDelivery?: boolean;
}

export const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  brandColor:           '#09090B',
  brandSubtitle:        '',
  bgStyle:              'aurora',
  themeMode:            'light',
  fontFamily:           'readex',
  animationLevel:       'full',
  timelineDesign:       'stepper',
  cardSurface:          'glass',
  cardRadius:           'modern',
  cardWidth:            'standard',
  headerDensity:        'comfortable',
  accentBarStyle:       'solid',
  showCarrierBadge:         true,
  showProductSection:       true,
  showLiveBadge:            true,
  showOrderNumberBadge:     true,
  supportPhone:         '',
  announcementText:     '',
  showEstimatedDelivery: false,
};
