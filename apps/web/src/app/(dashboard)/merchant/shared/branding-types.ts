import type {
  BrandSettings,
  BackgroundStyle,
  CardRadius,
  CardSurface,
  FontFamily,
  ThemeMode,
  AnimationLevel,
  TimelineDesign,
} from '@saas/ui';

export type TimelineLineStyle = 'straight' | 'dashed' | 'dotted' | 'curved' | 'wave' | 'none';

export type EditableBrandSettings = BrandSettings & {
  showWhatsAppButton?: boolean;
  animateBackgroundBlobs?: boolean;
  backgroundBlur?: boolean;
  timelineLineStyle?: TimelineLineStyle;
};

export type BrandPreset = {
  id: string;
  name: string;
  description: string;
  colors: [string, string, string];
  settings: Partial<EditableBrandSettings>;
};

export type BrandingCategory = 'identity' | 'appearance' | 'layout' | 'customer';
