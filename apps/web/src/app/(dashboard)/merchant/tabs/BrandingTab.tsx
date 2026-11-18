import type { CSSProperties, FormEvent, ReactNode } from 'react';
import type { BrandPreset, BrandingCategory, EditableBrandSettings } from '../shared/branding-types';
import {
  ANIMATION_LEVELS,
  BACKGROUND_STYLES,
  BRAND_PALETTES,
  BRAND_PRESETS,
  BRANDING_CATEGORIES,
  CARD_RADII,
  CARD_SURFACES,
  FONT_FAMILIES,
  TIMELINE_DESIGNS,
  TIMELINE_LINE_STYLES,
  getBrandContrastRatio,
  getReadableOnBrand,
} from '../features/branding/branding-options';

interface BrandingTabProps {
  brandConfig: EditableBrandSettings;
  activeBrandPresetId: string | null;
  onApplyBrandPreset: (preset: BrandPreset) => void;
  brandingCategory: BrandingCategory;
  onSetBrandingCategory: (category: BrandingCategory) => void;
  brandHistoryTick: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetCategory: () => void;
  onUpdateBrandConfig: <K extends keyof EditableBrandSettings>(key: K, value: EditableBrandSettings[K]) => void;
  hasUnsavedBrandChanges: boolean;
  isSavingBrand: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  preview: ReactNode;
}

type BrandVisualOption = {
  id: string;
  label: string;
  preview: ReactNode;
};

function BrandVisualDropdown({
  label,
  selectedId,
  options,
  onChange,
  fallbackLabel,
  fallbackPreview,
}: {
  label: string;
  selectedId: string;
  options: BrandVisualOption[];
  onChange: (value: string) => void;
  fallbackLabel?: string;
  fallbackPreview?: ReactNode;
}) {
  const selected = options.find((option) => option.id === selectedId);
  const selectedLabel = selected?.label ?? fallbackLabel ?? 'مخصص';

  return (
    <details
      className="dz-brand-visual-select"
      name="dz-brand-visual-select"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary className="dz-brand-visual-select-trigger" aria-label={label + ': ' + selectedLabel}>
        <span className="dz-brand-visual-select-label">{label}</span>
        <span className="dz-brand-visual-select-value">
          <span className="dz-brand-visual-select-current-art" aria-hidden="true">
            {selected?.preview ?? fallbackPreview}
          </span>
          <strong>{selectedLabel}</strong>
        </span>
        <svg className="dz-brand-visual-select-chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
        </svg>
      </summary>
      <div className="dz-brand-visual-select-menu" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={'dz-brand-visual-option' + (selectedId === option.id ? ' is-selected' : '')}
            aria-pressed={selectedId === option.id}
            onClick={(event) => {
              onChange(option.id);
              const details = event.currentTarget.closest('details');
              if (details) {
                details.open = false;
                details.querySelector('summary')?.focus();
              }
            }}
          >
            <span className="dz-brand-visual-option-art" aria-hidden="true">{option.preview}</span>
            <span className="dz-brand-visual-option-label">{option.label}</span>
            <span className="dz-brand-visual-option-check" aria-hidden="true">
              {selectedId === option.id ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}

export function BrandingTab({
  brandConfig,
  activeBrandPresetId,
  onApplyBrandPreset,
  brandingCategory,
  onSetBrandingCategory,
  brandHistoryTick,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetCategory,
  onUpdateBrandConfig,
  hasUnsavedBrandChanges,
  isSavingBrand,
  onSave,
  preview,
}: BrandingTabProps) {
  const presetOptions: BrandVisualOption[] = BRAND_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.name,
    preview: (
      <span className="dz-brand-preset-preview" style={{ background: 'linear-gradient(135deg, ' + preset.colors[1] + ', ' + preset.colors[2] + ')' }}>
        <i style={{ background: preset.colors[0] }} />
        <i style={{ background: preset.colors[2] }} />
        <i style={{ background: preset.colors[1] }} />
      </span>
    ),
  }));

  const backgroundOptions: BrandVisualOption[] = BACKGROUND_STYLES.map((style) => ({
    id: style.id,
    label: style.name,
    preview: <span className="dz-brand-background-preview" style={{ background: style.previewBg }} />,
  }));

  const timelineOptions: BrandVisualOption[] = TIMELINE_DESIGNS.map((style) => ({
    id: style.id,
    label: style.name,
    preview: (
      <span className={'dz-timeline-swatch dz-timeline-swatch--' + style.id + ' dz-brand-timeline-preview'} style={{ '--timeline-swatch-brand': brandConfig.brandColor } as CSSProperties}>
        <span /><span /><span />
      </span>
    ),
  }));

  const lineOptions: BrandVisualOption[] = TIMELINE_LINE_STYLES.map((style) => ({
    id: style.id,
    label: style.name,
    preview: (
      <span className={'dz-connector-swatch dz-connector-swatch--' + style.id + ' dz-brand-line-preview'} style={{ '--timeline-swatch-brand': brandConfig.brandColor } as CSSProperties}>
        <span />
        <i />
        <span />
      </span>
    ),
  }));

  const surfaceOptions: BrandVisualOption[] = CARD_SURFACES.map((surface) => ({
    id: surface.id,
    label: surface.name,
    preview: <span className={'dz-brand-surface-preview dz-brand-surface-preview--' + surface.id}><i /></span>,
  }));

  const radiusOptions: BrandVisualOption[] = CARD_RADII.map((radius) => ({
    id: radius.id,
    label: radius.name,
    preview: (
      <span
        className="dz-brand-radius-preview"
        style={{ borderRadius: radius.id === 'sharp' ? 0 : radius.id === 'sleek' ? 5 : radius.id === 'modern' ? 10 : 16 }}
      />
    ),
  }));

  const fontOptions: BrandVisualOption[] = FONT_FAMILIES.map((font) => ({
    id: font.id,
    label: font.name,
    preview: (
      <span
        className="dz-brand-font-preview"
        style={{
          fontFamily:
            font.id === 'cairo' ? "'Cairo', sans-serif" :
            font.id === 'tajawal' ? "'Tajawal', sans-serif" :
            font.id === 'ibm-plex' ? "'IBM Plex Sans Arabic', sans-serif" :
            font.id === 'noto-kufi' ? "'Noto Kufi Arabic', sans-serif" :
            "'Readex Pro', sans-serif",
        }}
      >
        تتبع طلبك
      </span>
    ),
  }));

  const animationOptions: BrandVisualOption[] = ANIMATION_LEVELS.map((level) => ({
    id: level.id,
    label: level.name,
    preview: <span className={'dz-brand-motion-preview dz-brand-motion-preview--' + level.id}><i /><i /><i /></span>,
  }));

  const themeOptions: BrandVisualOption[] = [
    {
      id: 'light',
      label: 'فاتح',
      preview: <span className="dz-brand-theme-preview dz-brand-theme-preview--light"><i /><i /></span>,
    },
    {
      id: 'dark',
      label: 'داكن',
      preview: <span className="dz-brand-theme-preview dz-brand-theme-preview--dark"><i /><i /></span>,
    },
  ];

  const contrastIsLow = getBrandContrastRatio(
    brandConfig.brandColor,
    brandConfig.themeMode === 'dark' ? '#202420' : '#FFFFFF',
  ) < 4.5;

  return (
    <div className="dz-branding-workspace">
      <div className="dz-customizer-grid">
        <form id="merchant-branding-form" onSubmit={onSave}>
          <header className="dz-branding-panel-head">
            <span className="dz-branding-kicker">تخصيص المتجر</span>
            <h2>هوية صفحة التتبع</h2>
          </header>

          <div className="dz-brand-toolbar">
            <BrandVisualDropdown
              label="قالب جاهز"
              selectedId={activeBrandPresetId ?? '__custom__'}
              options={presetOptions}
              fallbackLabel="مخصص"
              fallbackPreview={
                <span className="dz-brand-preset-preview" style={{ background: 'linear-gradient(135deg, #F0F1EA, #D9E1D7)' }}>
                  <i style={{ background: brandConfig.brandColor }} />
                  <i style={{ background: '#D9E1D7' }} />
                  <i style={{ background: '#F7F6F0' }} />
                </span>
              }
              onChange={(value) => {
                const preset = BRAND_PRESETS.find((item) => item.id === value);
                if (preset) onApplyBrandPreset(preset);
              }}
            />

            <label className="dz-brand-category-select">
              <span>قسم التخصيص</span>
              <select
                value={brandingCategory}
                onChange={(event) => onSetBrandingCategory(event.target.value as BrandingCategory)}
                aria-label="قسم التخصيص"
              >
                {BRANDING_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </label>
          </div>

          <div className="dz-brand-edit-actions" aria-label="أدوات تعديل الهوية" data-history-version={brandHistoryTick}>
            <span className={'dz-brand-edit-state' + (hasUnsavedBrandChanges ? ' is-dirty' : '')}>
              <i className={'dz-brand-edit-dot' + (hasUnsavedBrandChanges ? ' is-dirty' : '')} />
              {hasUnsavedBrandChanges ? 'تغييرات غير محفوظة' : 'كل التغييرات محفوظة'}
            </span>
            <div className="dz-brand-edit-buttons">
              <button type="button" className="dz-brand-tool-button" onClick={onUndo} disabled={!canUndo} title="تراجع عن آخر تغيير">↶</button>
              <button type="button" className="dz-brand-tool-button" onClick={onRedo} disabled={!canRedo} title="إعادة التغيير">↷</button>
              <button type="button" className="dz-brand-tool-button dz-brand-tool-reset" onClick={onResetCategory}>إعادة ضبط القسم</button>
            </div>
          </div>

          {brandingCategory === 'identity' && (
            <section className="dz-brand-section" aria-labelledby="dz-brand-identity-title">
              <h3 id="dz-brand-identity-title">لون العلامة</h3>
              <div className="dz-brand-color-row" role="group" aria-label="ألوان جاهزة">
                {BRAND_PALETTES.map((palette) => (
                  <button
                    key={palette.hex}
                    type="button"
                    className={'dz-brand-color-swatch' + (brandConfig.brandColor.toLowerCase() === palette.hex.toLowerCase() ? ' is-selected' : '')}
                    aria-label={palette.name}
                    aria-pressed={brandConfig.brandColor.toLowerCase() === palette.hex.toLowerCase()}
                    title={palette.name}
                    onClick={() => onUpdateBrandConfig('brandColor', palette.hex)}
                    style={{ background: palette.hex }}
                  />
                ))}
              </div>

              <div className="dz-brand-color-custom">
                <label htmlFor="dz-brand-color-picker">لون مخصص</label>
                <input
                  id="dz-brand-color-picker"
                  type="color"
                  value={brandConfig.brandColor}
                  onChange={(event) => onUpdateBrandConfig('brandColor', event.target.value)}
                />
                <code>{brandConfig.brandColor.toUpperCase()}</code>
              </div>

              <div className={'dz-brand-contrast-note' + (contrastIsLow ? ' is-low' : '')} role="status">
                {contrastIsLow ? 'يُنصح باختيار لون أوضح لزيادة التباين.' : 'تباين اللون مناسب للقراءة.'}
              </div>

              <div className="dz-brand-field">
                <label htmlFor="dz-brand-subtitle">وصف المتجر</label>
                <input
                  id="dz-brand-subtitle"
                  type="text"
                  value={brandConfig.brandSubtitle}
                  onChange={(event) => onUpdateBrandConfig('brandSubtitle', event.target.value)}
                  placeholder="أضف وصفاً قصيراً لمتجرك"
                  className="input"
                  maxLength={120}
                />
              </div>
              <p className="dz-brand-managed-logo-note">يُدار شعار المتجر من إعدادات المتجر ويظهر هنا تلقائياً.</p>
            </section>
          )}

          {brandingCategory === 'appearance' && (
            <>
              <section className="dz-brand-section" aria-labelledby="dz-brand-background-title">
                <h3 id="dz-brand-background-title">الخلفية والإضاءة</h3>
                <BrandVisualDropdown
                  label="نمط الخلفية"
                  selectedId={String(brandConfig.bgStyle)}
                  options={backgroundOptions}
                  onChange={(value) => onUpdateBrandConfig('bgStyle', value as EditableBrandSettings['bgStyle'])}
                />
                <BrandVisualDropdown
                  label="وضع الصفحة"
                  selectedId={brandConfig.themeMode}
                  options={themeOptions}
                  onChange={(value) => onUpdateBrandConfig('themeMode', value as EditableBrandSettings['themeMode'])}
                />
                <label className="dz-brand-toggle">
                  <span>تمويه الخلفية</span>
                  <input
                    type="checkbox"
                    checked={brandConfig.backgroundBlur !== false}
                    onChange={(event) => onUpdateBrandConfig('backgroundBlur', event.target.checked)}
                  />
                </label>
                {String(brandConfig.bgStyle) === 'blobs' && (
                  <label className="dz-brand-toggle">
                    <span>تحريك الأشكال</span>
                    <input
                      type="checkbox"
                      checked={Boolean(brandConfig.animateBackgroundBlobs)}
                      onChange={(event) => onUpdateBrandConfig('animateBackgroundBlobs', event.target.checked)}
                    />
                  </label>
                )}
              </section>

              <section className="dz-brand-section" aria-labelledby="dz-brand-card-title">
                <h3 id="dz-brand-card-title">بطاقات التتبع</h3>
                <BrandVisualDropdown
                  label="سطح البطاقة"
                  selectedId={String(brandConfig.cardSurface)}
                  options={surfaceOptions}
                  onChange={(value) => onUpdateBrandConfig('cardSurface', value as EditableBrandSettings['cardSurface'])}
                />
                <BrandVisualDropdown
                  label="شكل الحواف"
                  selectedId={String(brandConfig.cardRadius)}
                  options={radiusOptions}
                  onChange={(value) => onUpdateBrandConfig('cardRadius', value as EditableBrandSettings['cardRadius'])}
                />
              </section>

              <section className="dz-brand-section" aria-labelledby="dz-brand-font-title">
                <h3 id="dz-brand-font-title">الخط والحركة</h3>
                <BrandVisualDropdown
                  label="نوع الخط"
                  selectedId={String(brandConfig.fontFamily)}
                  options={fontOptions}
                  onChange={(value) => onUpdateBrandConfig('fontFamily', value as EditableBrandSettings['fontFamily'])}
                />
                <BrandVisualDropdown
                  label="مستوى الحركة"
                  selectedId={String(brandConfig.animationLevel)}
                  options={animationOptions}
                  onChange={(value) => onUpdateBrandConfig('animationLevel', value as EditableBrandSettings['animationLevel'])}
                />
              </section>
            </>
          )}

          {brandingCategory === 'layout' && (
            <section className="dz-brand-section" aria-labelledby="dz-brand-timeline-title">
              <h3 id="dz-brand-timeline-title">سجل الشحنة</h3>
              <BrandVisualDropdown
                label="تصميم المراحل"
                selectedId={String(brandConfig.timelineDesign)}
                options={timelineOptions}
                onChange={(value) => onUpdateBrandConfig('timelineDesign', value as EditableBrandSettings['timelineDesign'])}
              />
              <BrandVisualDropdown
                label="خط الربط"
                selectedId={String(brandConfig.timelineLineStyle || 'straight')}
                options={lineOptions}
                onChange={(value) => onUpdateBrandConfig('timelineLineStyle', value as EditableBrandSettings['timelineLineStyle'])}
              />
            </section>
          )}

          {brandingCategory === 'customer' && (
            <section className="dz-brand-section" aria-labelledby="dz-brand-customer-title">
              <h3 id="dz-brand-customer-title">تجربة الزبون</h3>
              <div className="dz-brand-field">
                <label htmlFor="dz-brand-support-phone">رقم واتساب الدعم</label>
                <input
                  id="dz-brand-support-phone"
                  type="tel"
                  value={brandConfig.supportPhone || ''}
                  onChange={(event) => onUpdateBrandConfig('supportPhone', event.target.value)}
                  placeholder="0550123456"
                  className="input"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
              <label className="dz-brand-toggle">
                <span>إظهار زر واتساب</span>
                <input
                  type="checkbox"
                  checked={brandConfig.showWhatsAppButton !== false}
                  onChange={(event) => onUpdateBrandConfig('showWhatsAppButton', event.target.checked)}
                />
              </label>

              <div className="dz-brand-field">
                <label htmlFor="dz-brand-announcement">تنبيه للزبون</label>
                <input
                  id="dz-brand-announcement"
                  type="text"
                  value={brandConfig.announcementText || ''}
                  onChange={(event) => onUpdateBrandConfig('announcementText', event.target.value)}
                  placeholder="رسالة قصيرة تظهر في صفحة التتبع"
                  className="input"
                  maxLength={180}
                />
              </div>

              <div className="dz-brand-toggle-list">
                <label className="dz-brand-toggle">
                  <span>شركة الشحن ورقم التتبع</span>
                  <input
                    type="checkbox"
                    checked={Boolean(brandConfig.showCarrierBadge)}
                    onChange={(event) => onUpdateBrandConfig('showCarrierBadge', event.target.checked)}
                  />
                </label>
                <label className="dz-brand-toggle">
                  <span>محتويات الشحنة</span>
                  <input
                    type="checkbox"
                    checked={Boolean(brandConfig.showProductSection)}
                    onChange={(event) => onUpdateBrandConfig('showProductSection', event.target.checked)}
                  />
                </label>
                <label className="dz-brand-toggle">
                  <span>رقم الطلب</span>
                  <input
                    type="checkbox"
                    checked={brandConfig.showOrderNumberBadge ?? true}
                    onChange={(event) => onUpdateBrandConfig('showOrderNumberBadge', event.target.checked)}
                  />
                </label>
              </div>
            </section>
          )}
        </form>

        <aside className="dz-branding-preview-sticky">
          <div className="dz-branding-preview-status" aria-live="polite">
            <span className="dz-preview-live-dot" />
            <strong>معاينة مباشرة</strong>
            <span>{hasUnsavedBrandChanges ? 'تغييرات غير محفوظة' : 'آخر نسخة محفوظة'}</span>
          </div>
          {preview}
        </aside>

        <div className={'dz-brand-savebar' + (hasUnsavedBrandChanges ? ' is-dirty' : '')} role="status" aria-live="polite">
          <div className="dz-brand-savebar-copy">
            <span className={'dz-brand-save-indicator' + (hasUnsavedBrandChanges ? ' is-dirty' : '')} aria-hidden="true" />
            <div>
              <strong>{hasUnsavedBrandChanges ? 'تغييرات غير محفوظة' : 'كل التغييرات محفوظة'}</strong>
              <span>{hasUnsavedBrandChanges ? 'احفظ لتطبيق الهوية على صفحة التتبع.' : 'تظهر التعديلات في المعاينة مباشرة.'}</span>
            </div>
          </div>
          <button
            type="submit"
            form="merchant-branding-form"
            disabled={!hasUnsavedBrandChanges || isSavingBrand}
            className="dz-btn dz-brand-save-button"
            style={{ background: brandConfig.brandColor, color: getReadableOnBrand(brandConfig.brandColor) }}
          >
            {isSavingBrand ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </div>
  );
}
