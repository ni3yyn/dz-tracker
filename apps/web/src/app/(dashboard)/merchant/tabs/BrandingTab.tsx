import type { CSSProperties, FormEvent, ReactNode } from 'react';
import type {
  AnimationLevel,
  BackgroundStyle,
  CardRadius,
  CardSurface,
  FontFamily,
  TimelineDesign,
} from '@saas/ui';
import type {
  BrandPreset,
  BrandingCategory,
  EditableBrandSettings,
  TimelineLineStyle,
} from '../shared/branding-types';
import { Icons } from '../components/DashboardIcons';

type BrandingCategoryOption = {
  id: BrandingCategory;
  number: string;
  label: string;
  description: string;
};
type PaletteOption = { name: string; hex: string };
type BackgroundOption = { id: BackgroundStyle; name: string; desc: string; icon: string; previewBg: string };
type TimelineOption = { id: TimelineDesign; name: string; desc: string; icon: string };
type TimelineLineOption = { id: TimelineLineStyle; name: string; desc: string; icon: string };
type SurfaceOption = { id: CardSurface; name: string; desc: string; icon: string };
type RadiusOption = { id: CardRadius; name: string; px: string };
type FontOption = { id: FontFamily; name: string; sample: string };
type AnimationOption = { id: AnimationLevel; name: string; desc: string; icon: string };

interface BrandingTabProps {
  brandConfig: EditableBrandSettings;
  brandPresets: BrandPreset[];
  activeBrandPresetId: string | null;
  onApplyBrandPreset: (preset: BrandPreset) => void;
  brandingCategories: readonly BrandingCategoryOption[];
  brandingCategory: BrandingCategory;
  onSetBrandingCategory: (category: BrandingCategory) => void;
  brandHistoryTick: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetCategory: () => void;
  brandPalettes: PaletteOption[];
  getBrandContrastRatio: (hex: string, backgroundHex: string) => number;
  getReadableBrandAccent: (hex: string, themeMode: string | undefined) => string;
  getReadableOnBrand: (hex: string) => string;
  backgroundStyles: BackgroundOption[];
  timelineDesigns: TimelineOption[];
  timelineLineStyles: TimelineLineOption[];
  cardSurfaces: SurfaceOption[];
  cardRadii: RadiusOption[];
  fontFamilies: FontOption[];
  animationLevels: AnimationOption[];
  onUpdateBrandConfig: <K extends keyof EditableBrandSettings>(key: K, value: EditableBrandSettings[K]) => void;
  hasUnsavedBrandChanges: boolean;
  isSavingBrand: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  preview: ReactNode;
}

export function BrandingTab({
  brandConfig,
  brandPresets,
  activeBrandPresetId,
  onApplyBrandPreset,
  brandingCategories,
  brandingCategory,
  onSetBrandingCategory,
  brandHistoryTick,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetCategory,
  brandPalettes,
  getBrandContrastRatio,
  getReadableBrandAccent,
  getReadableOnBrand,
  backgroundStyles,
  timelineDesigns,
  timelineLineStyles,
  cardSurfaces,
  cardRadii,
  fontFamilies,
  animationLevels,
  onUpdateBrandConfig,
  hasUnsavedBrandChanges,
  isSavingBrand,
  onSave,
  preview,
}: BrandingTabProps) {
  return (
            <div className="dz-branding-workspace">
              <div className="dz-customizer-grid">

              {/* LEFT COLUMN: CONTROLS */}
              <form id="merchant-branding-form" onSubmit={onSave}>
                <div className="dz-branding-panel-head">
                  <span className="dz-branding-kicker">BRAND STUDIO / 01</span>
                  <h2>صمّم صفحة التتبع بهوية متجرك</h2>
                  <p>اختر مجموعة واحدة للتعديل، وستنعكس خياراتك مباشرة على معاينة الهاتف.</p>
                </div>
                <section className="dz-brand-presets" aria-labelledby="brand-presets-title">
                  <div className="dz-brand-presets-heading">
                    <div>
                      <span className="dz-branding-kicker">CURATED STARTING POINTS</span>
                      <h3 id="brand-presets-title">ابدأ بأسلوب جاهز</h3>
                      <p>قوالب متوازنة تضبط المظهر دفعة واحدة؛ ويمكنك تعديل كل تفصيل بعدها.</p>
                    </div>
                    <span className="dz-brand-presets-note">تُعايَن قبل الحفظ</span>
                  </div>
                  <div className="dz-brand-presets-grid">
                    {brandPresets.map((preset) => (
                      <button key={preset.id} type="button" className={`dz-brand-preset ${activeBrandPresetId === preset.id ? 'active' : ''}`} onClick={() => onApplyBrandPreset(preset)} aria-pressed={activeBrandPresetId === preset.id}>
                        <span className="dz-brand-preset-art" style={{ background: `linear-gradient(135deg, ${preset.colors[1]}, ${preset.colors[2]})` }} aria-hidden="true">
                          <span className="dz-brand-preset-swatch" style={{ background: preset.colors[0] }} />
                          <span className="dz-brand-preset-line" style={{ background: preset.colors[0] }} />
                          <span className="dz-brand-preset-dot" style={{ background: preset.colors[2] }} />
                        </span>
                        <span className="dz-brand-preset-copy"><strong>{preset.name}</strong><small>{preset.description}</small></span>
                        <span className="dz-brand-preset-check" aria-hidden="true">{activeBrandPresetId === preset.id ? '✓' : '↗'}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <nav className="dz-branding-categories" aria-label="فئات إعدادات الهوية">
                  {brandingCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`dz-brand-category ${brandingCategory === category.id ? 'active' : ''}`}
                      aria-pressed={brandingCategory === category.id}
                      onClick={() => onSetBrandingCategory(category.id)}
                    >
                      <span className="dz-brand-category-number">{category.number}</span>
                      <span className="dz-brand-category-copy">
                        <strong>{category.label}</strong>
                        <small>{category.description}</small>
                      </span>
                      <span className="dz-brand-category-mark" aria-hidden="true">{brandingCategory === category.id ? '✓' : ''}</span>
                    </button>
                  ))}
                </nav>

                <div className="dz-brand-edit-actions" aria-label="أدوات تعديل الهوية" data-history-version={brandHistoryTick}>
                  <div className={`dz-brand-edit-state ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`}><span className={`dz-brand-edit-dot ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`} />{hasUnsavedBrandChanges ? 'المعاينة تتضمن تغييرات غير محفوظة' : 'المعاينة مطابقة للإعدادات المحفوظة'}</div>
                  <div className="dz-brand-edit-buttons">
                    <button type="button" className="dz-brand-tool-button" onClick={onUndo} disabled={!canUndo} title="تراجع عن آخر تغيير">↶ تراجع</button>
                    <button type="button" className="dz-brand-tool-button" onClick={onRedo} disabled={!canRedo} title="إعادة التغيير">↷ إعادة</button>
                    <button type="button" className="dz-brand-tool-button dz-brand-tool-reset" onClick={onResetCategory}>إعادة ضبط هذه الفئة</button>
                  </div>
                </div>

                {brandingCategory === 'identity' && (
                /* 1. BRAND COLORS & IDENTITY */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ color: 'var(--ink-muted)', fontSize: '18px' }}>◉</span> <span>ألوان صفحة التتبع</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '18px' }}>
                    اختر اللون الأساسي لزر التأكيد، شريط التقدم، وأيقونات التتبع المعبرة:
                  </p>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {brandPalettes.map((palette) => (
                      <button
                        key={palette.hex}
                        type="button"
                        onClick={() => onUpdateBrandConfig('brandColor', palette.hex)}
                        style={{
                          width: '38px', height: '38px', borderRadius: '50%', background: palette.hex,
                          border: brandConfig.brandColor.toLowerCase() === palette.hex.toLowerCase() ? '3px solid var(--ink-main)' : '3px solid transparent',
                          cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}
                        title={palette.name}
                      />
                    ))}
                  </div>
                  <div className={`dz-brand-contrast-note ${getBrandContrastRatio(brandConfig.brandColor, brandConfig.themeMode === 'dark' ? '#202420' : '#FFFFFF') < 4.5 ? 'is-low' : ''}`} role="status">
                    <span aria-hidden="true">◐</span>
                    {getBrandContrastRatio(brandConfig.brandColor, brandConfig.themeMode === 'dark' ? '#202420' : '#FFFFFF') < 4.5
                      ? 'قد يكون اللون خافتاً كنص صغير؛ تُعدّل ألوان النصوص المساعدة تلقائياً للحفاظ على الوضوح.'
                      : 'تباين لون العلامة مناسب مع الخلفية الأساسية المحددة.'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <label className="formLabel" style={{ margin: 0 }}>أو اختر كود مخصص (Hex):</label>
                    <input
                      type="color"
                      value={brandConfig.brandColor}
                      onChange={(e) => onUpdateBrandConfig('brandColor', e.target.value)}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={brandConfig.brandColor}
                      onChange={(e) => onUpdateBrandConfig('brandColor', e.target.value)}
                      className="dz-mono"
                      style={{ width: '100px', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label className="formLabel">وصف المتجر (Subtitle)</label>
                    <input
                      type="text"
                      value={brandConfig.brandSubtitle}
                      onChange={(e) => onUpdateBrandConfig('brandSubtitle', e.target.value)}
                      placeholder="مثال: متجركم الموثوق للتسوق الإلكتروني في 58 ولاية..."
                      className="input"
                    />
                  </div>

                  <p style={{ margin: '15px 0 0', fontSize: '11px', color: 'var(--ink-muted)' }}>
                    يُدار شعار المتجر من صفحة الإعدادات، ويظهر هنا تلقائياً في المعاينة.
                  </p>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 2. BACKGROUND STYLES & THEME */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>◻</span> <span>نمط الصفحة والخلفية</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '18px' }}>
                    حدد الجو العام لصفحة التتبع التي يفتحها الزبون:
                  </p>

                  <div className="dz-choice-grid" style={{ marginBottom: '20px' }}>
                    {backgroundStyles.map((bg) => (
                      <div
                        key={bg.id}
                        className={`dz-choice-card ${brandConfig.bgStyle === bg.id ? 'active' : ''}`}
                        onClick={() => onUpdateBrandConfig('bgStyle', bg.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onUpdateBrandConfig('bgStyle', bg.id); } }}
                      >
                        <div className="dz-background-swatch" style={{ background: bg.previewBg }} aria-hidden="true" />
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '17px' }}>{bg.icon}</span>
                          <span className="dz-choice-indicator" />
                        </div>
                        <span className="dz-choice-title">{bg.name}</span>
                        <span className="dz-choice-desc">{bg.desc}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-base)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-soft)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>وضع الإضاءة (Theme Mode):</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => onUpdateBrandConfig('themeMode', 'light')}
                        className={`dz-btn dz-btn-outline ${brandConfig.themeMode === 'light' ? 'active' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '12px', background: brandConfig.themeMode === 'light' ? 'var(--ink-main)' : undefined, color: brandConfig.themeMode === 'light' ? '#fff' : undefined }}
                      >
                        فاتح (Light)
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBrandConfig('themeMode', 'dark')}
                        className={`dz-btn dz-btn-outline ${brandConfig.themeMode === 'dark' ? 'active' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '12px', background: brandConfig.themeMode === 'dark' ? 'var(--ink-main)' : undefined, color: brandConfig.themeMode === 'dark' ? '#fff' : undefined }}
                      >
                        داكن (Dark)
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', marginTop: '14px', padding: '16px', border: '1px solid var(--border-soft)', borderRadius: '12px', background: 'var(--surface)' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>تمويه الخلفية لتحسين وضوح المحتوى</div>
                      <div style={{ color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.7 }}>طبقة خفيفة بتمويه بسيط للخلفية والزخارف فقط؛ النصوص والمحتوى تبقى واضحة. يمكنك إيقافها في أي وقت.</div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', flexShrink: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 750 }}>
                      <input type="checkbox" checked={brandConfig.backgroundBlur !== false} onChange={(event) => onUpdateBrandConfig('backgroundBlur', event.target.checked)} />
                      {brandConfig.backgroundBlur !== false ? 'مفعّل' : 'متوقف'}
                    </label>
                  </div>

                  {String(brandConfig.bgStyle) === 'blobs' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', marginTop: '14px', padding: '16px', border: '1px solid var(--border-soft)', borderRadius: '12px', background: 'var(--surface)' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>تحريك الأشكال العضوية</div>
                        <div style={{ color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.7 }}>حركة بطيئة وناعمة للكتل الضبابية، مستقلة عن مستوى الحركة العام.</div>
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', flexShrink: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 750 }}>
                        <input type="checkbox" checked={Boolean(brandConfig.animateBackgroundBlobs)} onChange={(event) => onUpdateBrandConfig('animateBackgroundBlobs', event.target.checked)} />
                        {brandConfig.animateBackgroundBlobs ? 'مفعّل' : 'متوقف'}
                      </label>
                    </div>
                  )}
                </div>

                )}

                {brandingCategory === 'layout' && (
                /* 3. TIMELINE TYPES & DESIGNS */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>◷</span> <span>طريقة عرض سجل الشحنة</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '18px' }}>
                    اختر الطريقة المرئية لعرض مراحل التوصيل وتحديثات الشحن للعميل:
                  </p>

                  <div className="dz-choice-grid">
                    {timelineDesigns.map((tl) => (
                      <div
                        key={tl.id}
                        className={`dz-choice-card ${brandConfig.timelineDesign === tl.id ? 'active' : ''}`}
                        onClick={() => onUpdateBrandConfig('timelineDesign', tl.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onUpdateBrandConfig('timelineDesign', tl.id); } }}
                      >
                        <div className={`dz-timeline-swatch dz-timeline-swatch--${tl.id}`} style={{ ['--timeline-swatch-brand' as string]: brandConfig.brandColor } as CSSProperties} aria-hidden="true">
                          <span /><span /><span />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '17px' }}>{tl.icon}</span>
                          <span className="dz-choice-indicator" />
                        </div>
                        <span className="dz-choice-title">{tl.name}</span>
                        <span className="dz-choice-desc">{tl.desc}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: '24px', paddingTop: '22px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 800 }}>شكل الخطوط بين النقاط</h4>
                    <p style={{ margin: '0 0 14px', fontSize: '12px', lineHeight: 1.7, color: 'var(--ink-muted)' }}>يتحكم هذا الخيار في خطوط الربط ضمن التصاميم التي تستخدم مساراً متصلاً.</p>
                    <div className="dz-choice-grid">
                      {timelineLineStyles.map((lineStyle) => (
                        <div
                          key={lineStyle.id}
                          className={`dz-choice-card ${((brandConfig as EditableBrandSettings).timelineLineStyle || 'straight') === lineStyle.id ? 'active' : ''}`}
                          onClick={() => onUpdateBrandConfig('timelineLineStyle', lineStyle.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onUpdateBrandConfig('timelineLineStyle', lineStyle.id); } }}
                        >
                          <div className={`dz-connector-swatch dz-connector-swatch--${lineStyle.id}`} style={{ ['--timeline-swatch-brand' as string]: brandConfig.brandColor } as CSSProperties} aria-hidden="true"><span /><i>{lineStyle.id === 'curved' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C2 23 2 77 12 100" /></svg>}{lineStyle.id === 'wave' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C0 14 0 25 12 36 S24 60 12 72 S0 88 12 100" /></svg>}</i><span /></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <span style={{ fontSize: '17px' }}>{lineStyle.icon}</span><span className="dz-choice-indicator" />
                          </div>
                          <span className="dz-choice-title">{lineStyle.name}</span>
                          <span className="dz-choice-desc">{lineStyle.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 4. CARD SURFACE & RADIUS */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>▱</span> <span>سطح بطاقة التتبع</span>
                  </h3>

                  <div style={{ marginBottom: '20px' }}>
                    <label className="formLabel">تأثير السطح (Surface Style)</label>
                    <div className="dz-choice-grid">
                      {cardSurfaces.map((cs) => (
                        <div
                          key={cs.id}
                          className={`dz-choice-card ${brandConfig.cardSurface === cs.id ? 'active' : ''}`}
                          onClick={() => onUpdateBrandConfig('cardSurface', cs.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onUpdateBrandConfig('cardSurface', cs.id); } }}
                        >
                          <span className="dz-choice-title">{cs.name}</span>
                          <span className="dz-choice-desc">{cs.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="formLabel">استدارة الحواف</label>
                    <div className="dz-choice-grid">
                      {cardRadii.map((cr) => (
                        <div
                          key={cr.id}
                          className={`dz-choice-card ${brandConfig.cardRadius === cr.id ? 'active' : ''}`}
                          onClick={() => onUpdateBrandConfig('cardRadius', cr.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onUpdateBrandConfig('cardRadius', cr.id); } }}
                        >
                          <span className="dz-choice-title">{cr.name}</span>
                          <span className="dz-choice-desc">{cr.px}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 5. TYPOGRAPHY */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Aa</span> <span>الخط المستخدم</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '16px' }}>
                    اختر الخط الذي يعكس شخصية متجرك — كل خط يعطي انطباعاً مختلفاً:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {fontFamilies.map((ff) => (
                      <div
                        key={ff.id}
                        onClick={() => onUpdateBrandConfig('fontFamily', ff.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: `2px solid ${brandConfig.fontFamily === ff.id ? 'var(--ink-main)' : 'var(--border-soft)'}`,
                          background: brandConfig.fontFamily === ff.id ? 'var(--bg-base)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.18s ease',
                        }}
                      >
                        <div style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: brandConfig.fontFamily === ff.id ? brandConfig.brandColor : 'var(--border-strong)',
                          flexShrink: 0,
                          transition: 'background 0.18s ease',
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{ff.name}</div>
                          <div style={{ fontSize: '18px', lineHeight: 1.4, color: 'var(--ink-muted)', fontFamily: ff.id === 'cairo' ? "'Cairo', system-ui, sans-serif" : ff.id === 'tajawal' ? "'Tajawal', system-ui, sans-serif" : ff.id === 'ibm-plex' ? "'IBM Plex Sans Arabic', system-ui, sans-serif" : ff.id === 'noto-kufi' ? "'Noto Kufi Arabic', system-ui, sans-serif" : "'Readex Pro', system-ui, sans-serif" }}>{ff.sample}</div>
                        </div>
                        {brandConfig.fontFamily === ff.id && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: getReadableBrandAccent(brandConfig.brandColor, 'light') }}>محدد</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 7. ANIMATION LEVEL */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ color: 'var(--ink-muted)', fontSize: '18px' }}>∿</span> <span>مستوى الحركة</span>
                  </h3>
                  <div className="dz-choice-grid">
                    {animationLevels.map((al) => (
                      <div
                        key={al.id}
                        className={`dz-choice-card ${brandConfig.animationLevel === al.id ? 'active' : ''}`}
                        onClick={() => onUpdateBrandConfig('animationLevel', al.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onUpdateBrandConfig('animationLevel', al.id); } }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '18px' }}>{al.icon}</span>
                          <span className="dz-choice-indicator" />
                        </div>
                        <span className="dz-choice-title">{al.name}</span>
                        <span className="dz-choice-desc">{al.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                )}

                {brandingCategory === 'customer' && (
                /* 9. CUSTOMER EXPERIENCE & SUPPORT */
                <div className="dz-card-box" style={{ marginBottom: '32px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--ink-muted)' }}><Icons.MessageCircle /></span> <span>تجربة الزبون والدعم المباشر (Customer Experience)</span>
                  </h3>

                  <div style={{ marginBottom: '16px' }}>
                    <label className="formLabel">رقم واتساب خدمة العملاء (اختياري)</label>
                    <input
                      type="tel"
                      value={brandConfig.supportPhone || ''}
                      onChange={(e) => onUpdateBrandConfig('supportPhone', e.target.value)}
                      placeholder="مثال: 0550123456 أو 0660..."
                      className="input"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '4px', display: 'block' }}>
                      سيظهر زر واتساب عائم أسفل صفحة التتبع، مع رسالة تتضمن رقم الطلب تلقائياً.
                    </span>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', marginBottom: '20px' }}>
                    <input
                      type="checkbox"
                      checked={brandConfig.showWhatsAppButton !== false}
                      onChange={(e) => onUpdateBrandConfig('showWhatsAppButton', e.target.checked)}
                    />
                    <span>إظهار زر واتساب العائم في صفحة التتبع</span>
                  </label>

                  <div style={{ marginBottom: '20px' }}>
                    <label className="formLabel">إعلان أو تنبيه للمشتري (Announcement Banner)</label>
                    <input
                      type="text"
                      value={brandConfig.announcementText || ''}
                      onChange={(e) => onUpdateBrandConfig('announcementText', e.target.value)}
                      placeholder="مثال: يرجى إبقاء هاتفك مشغلاً لتأكيد موعد استلام الطلب مع الموزع 📞"
                      className="input"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brandConfig.showCarrierBadge}
                        onChange={(e) => onUpdateBrandConfig('showCarrierBadge', e.target.checked)}
                      />
                      <span>إظهار شارة شركة الشحن ورقم التتبع مع زر النسخ</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brandConfig.showProductSection}
                        onChange={(e) => onUpdateBrandConfig('showProductSection', e.target.checked)}
                      />
                      <span>إظهار قسم محتويات الشحنة والمنتجات</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brandConfig.showOrderNumberBadge ?? true}
                        onChange={(e) => onUpdateBrandConfig('showOrderNumberBadge', e.target.checked)}
                      />
                      <span>إظهار رقم الطلب في أعلى البطاقة</span>
                    </label>
                  </div>
                </div>
                )}
              </form>

              {/* RIGHT COLUMN: STICKY LIVE INTERACTIVE PREVIEW */}
              <div className="dz-branding-preview-sticky">
                <div className="dz-branding-preview-status" aria-live="polite">
                  <span className="dz-preview-live-dot" />
                  <strong>معاينة مباشرة</strong>
                  <span>{hasUnsavedBrandChanges ? 'تغييرات غير محفوظة' : 'آخر نسخة محفوظة'}</span>
                </div>
                {/* Memoised phone preview — re-renders only when deferred config settles */}
                {preview}

              </div>
              </div>

              <div className={`dz-brand-savebar ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`} role="status" aria-live="polite">
                <div className="dz-brand-savebar-copy">
                  <span className={`dz-brand-save-indicator ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`} aria-hidden="true" />
                  <div>
                    <strong>{hasUnsavedBrandChanges ? 'لديك تغييرات غير محفوظة' : 'كل التغييرات محفوظة'}</strong>
                    <span>{hasUnsavedBrandChanges ? 'احفظ لتطبيق إعدادات الهوية على صفحة التتبع.' : 'يمكنك مواصلة التخصيص؛ ستظهر التغييرات هنا مباشرة.'}</span>
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
  );
}
