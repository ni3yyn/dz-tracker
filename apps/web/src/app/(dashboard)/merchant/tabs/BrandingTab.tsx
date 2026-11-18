import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { BrandedSelect } from '../BrandedSelect';
import type { BrandPreset, BrandingCategory, EditableBrandSettings } from '../shared/branding-types';
import type { BrandedSelectOption } from '../BrandedSelect';
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
  renderOption,
  renderValue,
  menuWidth,
  menuMaxHeight,
  menuColumns,
  menuGap,
  optionMinHeight,
  optionPadding,
  optionLayout,
  showOptionLabel,
  showOptionCheck,
  triggerHeight,
  valueClassName,
  triggerClassName,
  indicatorClassName,
  optionContentClassName,
  optionLabelClassName,
}: {
  label: string;
  selectedId: string;
  options: BrandVisualOption[];
  onChange: (value: string) => void;
  fallbackLabel?: string;
  fallbackPreview?: ReactNode;
  renderOption?: (option: BrandVisualOption) => ReactNode;
  renderValue?: (option: BrandVisualOption | undefined) => ReactNode;
  menuWidth?: number;
  menuMaxHeight?: number;
  menuColumns?: number;
  menuGap?: number;
  optionMinHeight?: number;
  optionPadding?: string;
  optionLayout?: 'row' | 'block';
  showOptionLabel?: boolean;
  showOptionCheck?: boolean;
  triggerHeight?: number;
  valueClassName?: string;
  triggerClassName?: string;
  indicatorClassName?: string;
  optionContentClassName?: string;
  optionLabelClassName?: string;
}) {
  const selectOptions = options.map((option) => ({
    value: option.id,
    label: option.label,
  }));

  const findOption = (option: BrandedSelectOption | undefined) =>
    option ? options.find((item) => item.id === option.value) : undefined;

  const defaultVisual = (option: BrandVisualOption) => (
    <span className="dz-brand-dropdown-option">
      <span className="dz-brand-dropdown-art" aria-hidden="true">{option.preview}</span>
    </span>
  );

  const selectedVisual = (option: BrandVisualOption | undefined) => {
    if (renderValue) return renderValue(option);
    if (option) {
      return (
        <span className="dz-brand-dropdown-option">
          <span className="dz-brand-dropdown-art" aria-hidden="true">{option.preview}</span>
          <span className="dz-brand-dropdown-label">{option.label}</span>
        </span>
      );
    }
    return (
      <span className="dz-brand-dropdown-option">
        {fallbackPreview && <span className="dz-brand-dropdown-art" aria-hidden="true">{fallbackPreview}</span>}
        <span className="dz-brand-dropdown-label">{fallbackLabel ?? 'مخصص'}</span>
      </span>
    );
  };

  return (
    <div className="dz-brand-visual-control">
      <span className="dz-brand-visual-control-label">{label}</span>
      <BrandedSelect
        value={selectedId}
        options={selectOptions}
        onChange={onChange}
        ariaLabel={label}
        placeholder={fallbackLabel ?? 'مخصص'}
        variant="field"
        className="dz-branding-shared-select"
        menuWidth={menuWidth}
        menuMaxHeight={menuMaxHeight}
        menuColumns={menuColumns}
        menuGap={menuGap}
        optionMinHeight={optionMinHeight}
        optionPadding={optionPadding}
        optionLayout={optionLayout}
        showOptionLabel={showOptionLabel}
        showOptionCheck={showOptionCheck}
        triggerHeight={triggerHeight}
        valueClassName={['dz-brand-visual-value', valueClassName].filter(Boolean).join(' ')}
        triggerClassName={triggerClassName}
        indicatorClassName={indicatorClassName}
        optionContentClassName={optionContentClassName}
        optionLabelClassName={optionLabelClassName}
        renderOption={(option, state) => {
          const visualOption = findOption(option);
          return visualOption ? (renderOption ? renderOption(visualOption) : defaultVisual(visualOption)) : null;
        }}
        renderValue={(option) => selectedVisual(findOption(option))}
      />
    </div>
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
      <span
        className="dz-brand-preset-option-preview"
        style={{
          ['--preset-primary' as string]: preset.colors[0],
          ['--preset-surface' as string]: preset.colors[1],
          ['--preset-accent' as string]: preset.colors[2],
        } as CSSProperties}
        aria-hidden="true"
      >
        <i className="dz-brand-preset-preview-logo" />
        <i className="dz-brand-preset-preview-heading" />
        <i className="dz-brand-preset-preview-copy" />
        <i className="dz-brand-preset-preview-button" />
        <i className="dz-brand-preset-preview-progress" />
      </span>
    ),
  }));

  const backgroundOptions: BrandVisualOption[] = BACKGROUND_STYLES.map((style) => ({
    id: style.id,
    label: style.name,
    preview: (
      <span className="dz-brand-background-preview dz-brand-background-choice" aria-hidden="true">
        <span className="dz-brand-background-art" style={{ background: style.previewBg }} />
      </span>
    ),
  }));

  const timelineOptions: BrandVisualOption[] = TIMELINE_DESIGNS.map((style) => ({
    id: style.id,
    label: style.name,
    preview: (
      <span className={'dz-brand-timeline-thumbnail dz-brand-timeline-thumbnail--' + style.id} style={{ ['--timeline-swatch-brand' as string]: brandConfig.brandColor } as CSSProperties} aria-hidden="true">
        <span className="dz-brand-timeline-phase">
          <i className="dz-brand-timeline-marker">01</i>
          <span className="dz-brand-timeline-copy"><b>تم تجهيز الطلب</b><small>اليوم · 10:30</small></span>
        </span>
        <span className="dz-brand-timeline-phase">
          <i className="dz-brand-timeline-marker">02</i>
          <span className="dz-brand-timeline-copy"><b>خرج للتوصيل</b><small>اليوم · 11:45</small></span>
        </span>
      </span>
    ),
  }));

  const linePathByStyle: Record<string, string> = {
    straight: 'M24 26 H336',
    dashed: 'M24 26 H336',
    dotted: 'M24 26 H336',
    curved: 'M24 26 C105 -1 255 53 336 26',
    wave: 'M24 26 C75 -2 105 -2 156 26 S258 54 336 26',
    none: '',
  };

  const lineOptions: BrandVisualOption[] = TIMELINE_LINE_STYLES.map((style) => ({
    id: style.id,
    label: style.name,
    preview: (
      <svg className={'dz-brand-connector-thumbnail dz-brand-connector-thumbnail--' + style.id} viewBox="0 0 360 52" preserveAspectRatio="none" aria-hidden="true">
        {linePathByStyle[style.id] && (
          <path d={linePathByStyle[style.id]} fill="none" stroke={brandConfig.brandColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={style.id === 'dashed' ? '10 8' : style.id === 'dotted' ? '1 10' : undefined} />
        )}
        <circle cx="24" cy="26" r="8" fill={brandConfig.brandColor} />
        <circle cx="336" cy="26" r="8" fill={brandConfig.brandColor} />
        <circle cx="24" cy="26" r="3" fill="#fffefa" />
        <circle cx="336" cy="26" r="3" fill="#fffefa" />
      </svg>
    ),
  }));

  const surfaceOptions: BrandVisualOption[] = CARD_SURFACES.map((surface) => ({
    id: surface.id,
    label: surface.name,
    preview: <span className={'dz-brand-surface-preview dz-brand-surface-preview--' + surface.id}><i /></span>,
  }));

  const radiusLabels = ['حواف حادة', 'حواف منحنية قليلاً', 'حواف متوسطة', 'حواف مستديرة'];
  const radiusOptions: BrandVisualOption[] = CARD_RADII.map((radius, index) => ({
    id: radius.id,
    label: radiusLabels[index] ?? radius.name,
    preview: <span className={'dz-brand-radius-preview dz-brand-radius-preview--' + radius.id} aria-hidden="true" />,
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
        تاجر تراك
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
              fallbackPreview={<span className="dz-brand-preset-option-preview" style={{ ['--preset-primary' as string]: brandConfig.brandColor, ['--preset-surface' as string]: '#F0F1EA', ['--preset-accent' as string]: '#D9E1D7' } as CSSProperties} />}
              menuWidth={520}
              menuMaxHeight={500}
              menuColumns={2}
              optionLayout="block"
              optionMinHeight={112}
              optionPadding="8px"
              renderOption={(option) => option.preview}
              renderValue={(option) => {
                const preset = BRAND_PRESETS.find((item) => item.id === option?.id);
                return (
                  <span className="dz-brand-preset-trigger-preview">
                    <span>
                      <i style={{ background: preset?.colors[0] ?? brandConfig.brandColor }} />
                      <i style={{ background: preset?.colors[1] ?? '#F0F1EA' }} />
                      <i style={{ background: preset?.colors[2] ?? '#D9E1D7' }} />
                    </span>
                    <b>{preset?.name ?? 'مخصص'}</b>
                  </span>
                );
              }}
              onChange={(value) => {
                const preset = BRAND_PRESETS.find((item) => item.id === value);
                if (preset) onApplyBrandPreset(preset);
              }}
            />

            <BrandVisualDropdown
              label="قسم التخصيص"
              selectedId={brandingCategory}
              options={BRANDING_CATEGORIES.map((category) => ({
                id: category.id,
                label: category.label,
                preview: <span className="dz-brand-category-mini">{category.number}</span>,
              }))}
              onChange={(value) => onSetBrandingCategory(value as BrandingCategory)}
              renderOption={(option) => option.preview}
              renderValue={(option) => <span className="dz-brand-category-option">{option?.preview}{option?.label ?? 'اختر القسم'}</span>}
            />
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
                  renderOption={(option) => option.preview}
                  renderValue={(option) => {
                    const background = BACKGROUND_STYLES.find((item) => item.id === option?.id);
                    return (
                      <span
                        className="dz-brand-background-preview dz-brand-background-trigger"
                        data-background-style={background?.id}
                      >
                        <span className="dz-brand-background-art" style={{ background: background?.previewBg ?? 'none' }} />
                      </span>
                    );
                  }}
                  valueClassName="dz-brand-visual-value--background"
                  triggerClassName="dz-brand-background-select-trigger"
                  indicatorClassName="dz-brand-background-select-indicator"
                  menuWidth={520}
                  menuMaxHeight={520}
                  menuColumns={1}
                  optionLayout="block"
                  optionMinHeight={78}
                  optionPadding="5px"
                  showOptionLabel={false}
                  triggerHeight={56}
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
                  renderOption={(option) => option.preview}
                  optionContentClassName="dz-brand-font-option-content"
                  optionLabelClassName="dz-brand-font-option-label"
                  renderValue={(option) => option?.preview ?? <span className="dz-brand-font-preview">تاجر تراك</span>}
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
                renderOption={(option) => option.preview}
                renderValue={(option) => (
                  <span className="dz-brand-timeline-trigger">
                    <i /><i />
                    <b>{option?.label ?? ''}</b>
                  </span>
                )}
                menuWidth={600}
                menuMaxHeight={540}
                menuColumns={2}
                optionLayout="block"
                optionMinHeight={128}
                optionPadding="8px"
              />
              <BrandVisualDropdown
                label="خط الربط"
                selectedId={String(brandConfig.timelineLineStyle || 'straight')}
                options={lineOptions}
                onChange={(value) => onUpdateBrandConfig('timelineLineStyle', value as EditableBrandSettings['timelineLineStyle'])}
                renderOption={(option) => option.preview}
                renderValue={(option) => option?.preview ?? null}
                valueClassName="dz-brand-visual-value--connector"
                menuWidth={500}
                menuMaxHeight={460}
                menuColumns={1}
                optionLayout="block"
                optionMinHeight={66}
                optionPadding="7px 12px"
                showOptionLabel={false}
                triggerHeight={62}
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
