import type { FormEvent } from 'react';
import { BrandedSelect } from '../BrandedSelect';
import { ImageUploadField } from '../ImageUploadField';
import { Icons } from '../components/DashboardIcons';
import type { EditableBrandSettings } from '../shared/branding-types';
import type { PaymentRecord, SubscriptionInfo } from '../shared/subscription-types';
import type { UpgradeTier } from '../features/settings/settings-types';

interface SettingsTabProps {
  merchantId: string;
  brandConfig: EditableBrandSettings;
  onUpdateBrandConfig: <K extends keyof EditableBrandSettings>(key: K, value: EditableBrandSettings[K]) => void;
  storeNameDraft: string;
  onStoreNameDraftChange: (value: string) => void;
  hasUnsavedBrandChanges: boolean;
  hasUnsavedStoreNameChanges: boolean;
  isSavingBrand: boolean;
  onSaveBranding: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  telegramEnabled: boolean;
  isSavingTelegram: boolean;
  onToggleTelegramTracking: () => Promise<void>;
  smsEnabled: boolean;
  isSavingSms: boolean;
  smsTrackingStorageAvailable: boolean;
  onToggleSmsTracking: () => Promise<void>;
  nativeSmsGatewayStorageAvailable: boolean;
  nativeSmsDevice: { display_name: string; enabled: boolean } | null;
  nativeSmsDownloadUrl: string | null;
  confirmationEnabled: boolean;
  isSavingConfirmation: boolean;
  hasActivePaidPlan: boolean;
  onToggleConfirmationTelegram: () => Promise<void>;
  exchangeRequestsEnabled: boolean;
  isSavingExchangeRequests: boolean;
  exchangeRequestsStorageAvailable: boolean;
  onToggleExchangeRequests: () => Promise<void>;
  subscription: SubscriptionInfo;
  normalizedLimit: number;
  isUnlimitedPlan: boolean;
  expiryDateFormatted: string | null;
  showAdvanceRenewal: boolean;
  onToggleAdvanceRenewal: () => void;
  selectedUpgradeTier: UpgradeTier;
  onSelectUpgradeTier: (tier: UpgradeTier) => void;
  onCopyToClipboard: (value: string, id: string) => void;
  payments: PaymentRecord[];
  onSubmitProof: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  isSubmittingProof: boolean;
  proofImageUrl: string;
  onProofImageUrlChange: (value: string) => void;
}

export function SettingsTab({
  merchantId,
  brandConfig,
  onUpdateBrandConfig,
  storeNameDraft,
  onStoreNameDraftChange,
  hasUnsavedBrandChanges,
  hasUnsavedStoreNameChanges,
  isSavingBrand,
  onSaveBranding,
  telegramEnabled,
  isSavingTelegram,
  onToggleTelegramTracking,
  smsEnabled,
  isSavingSms,
  smsTrackingStorageAvailable,
  onToggleSmsTracking,
  nativeSmsGatewayStorageAvailable,
  nativeSmsDevice,
  nativeSmsDownloadUrl,
  confirmationEnabled,
  isSavingConfirmation,
  hasActivePaidPlan,
  onToggleConfirmationTelegram,
  exchangeRequestsEnabled,
  isSavingExchangeRequests,
  exchangeRequestsStorageAvailable,
  onToggleExchangeRequests,
  subscription,
  normalizedLimit,
  isUnlimitedPlan,
  expiryDateFormatted,
  showAdvanceRenewal,
  onToggleAdvanceRenewal,
  selectedUpgradeTier,
  onSelectUpgradeTier,
  onCopyToClipboard,
  payments,
  onSubmitProof,
  isSubmittingProof,
  proofImageUrl,
  onProofImageUrlChange,
}: SettingsTabProps) {
  return (
            <div className="dz-settings-page">
              <div className="dz-settings-section dz-settings-profile" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: '18px', padding: '18px 20px', marginBottom: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>01 / STORE PROFILE</span>
                    <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>معلومات المتجر</h2>
                  </div>
                  <Icons.Store />
                </div>
                <form onSubmit={onSaveBranding}>
                  <div className="dz-settings-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(240px, .85fr)', gap: '16px', alignItems: 'end' }}>
                    <div>
                      <label htmlFor="merchant-settings-store-name" className="formLabel">اسم المتجر</label>
                      <input id="merchant-settings-store-name" type="text" className="input" value={storeNameDraft} maxLength={80} required onChange={(event) => onStoreNameDraftChange(event.target.value)} placeholder="اسم متجرك" />
                      <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--ink-muted)' }}>يظهر الاسم بجانب شعارك في صفحات العملاء.</p>
                    </div>
                    <div>
                      <ImageUploadField label="شعار المتجر" value={brandConfig.logoUrl || ''} onChange={(url) => onUpdateBrandConfig('logoUrl', url)} merchantId={merchantId} folder="upsell-products" quality={0.9} placeholder="ارفع شعار متجرك" />
                    </div>
                  </div>
                  <div className="dz-settings-profile-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', marginTop: '14px', paddingTop: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>يُستخدم الشعار نفسه في صفحة التتبع وصفحة تأكيد الطلب.</span>
                    <button type="submit" className="dz-btn" disabled={isSavingBrand || (!hasUnsavedBrandChanges && !hasUnsavedStoreNameChanges)} style={{ minWidth: '132px', padding: '9px 18px', opacity: isSavingBrand || (!hasUnsavedBrandChanges && !hasUnsavedStoreNameChanges) ? .55 : 1 }}>
                      {isSavingBrand ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="dz-settings-section dz-settings-telegram" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: '18px', padding: '18px 20px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>02 / TELEGRAM SERVICES</span>
                    <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>خدمات تيليجرام</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink-muted)' }}>تحكم في الرسائل التي تصل إلى عملاء متجرك.</p>
                  </div>
                  <Icons.Send />
                </div>
                <div className="dz-settings-telegram-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 0 }}>
                  <div className="dz-settings-telegram-option" style={{ padding: '11px 16px 8px 8px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '7px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--ink-main)' }}>روابط التتبع</strong>
                      <span style={{ fontSize: '11px', color: telegramEnabled ? '#267548' : 'var(--ink-muted)', fontWeight: 700 }}>{telegramEnabled ? 'مفعّل' : 'معطّل'}</span>
                    </div>
                    <p style={{ minHeight: '34px', margin: '0 0 10px', color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.6 }}>إرسال رابط تتبّع الشحنة تلقائياً إلى حساب Telegram المرتبط برقم العميل عند تسجيل الطلب.</p>
                    <button type="button" role="switch" aria-checked={telegramEnabled} aria-busy={isSavingTelegram} data-checked={telegramEnabled ? 'true' : 'false'} aria-label="تفعيل إرسال روابط التتبع عبر تيليجرام" disabled={isSavingTelegram}
                      onClick={() => void onToggleTelegramTracking()}
                      style={{ width: '48px', height: '27px', position: 'relative', display: 'block', border: 0, borderRadius: '99px', padding: '3px', direction: 'ltr', background: telegramEnabled ? '#273b30' : '#cbd1ca', cursor: isSavingTelegram ? 'wait' : 'pointer', opacity: isSavingTelegram ? .82 : 1, transition: 'background .18s ease, opacity .18s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.12)' }}>
                      <span className="dz-settings-switch-thumb">{isSavingTelegram && <span className="dz-settings-switch-spinner" aria-hidden="true" />}</span>
                    </button>
                  </div>
                  <div className="dz-settings-telegram-option dz-settings-telegram-option-secondary" style={{ padding: '11px 8px 8px 16px', minWidth: 0, borderInlineStart: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '7px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--ink-main)' }}>تأكيد الطلب</strong>
                      <span style={{ fontSize: '11px', color: confirmationEnabled && hasActivePaidPlan ? '#267548' : 'var(--ink-muted)', fontWeight: 700 }}>{!hasActivePaidPlan ? 'للباقات المدفوعة' : confirmationEnabled ? 'مفعّل' : 'معطّل'}</span>
                    </div>
                    <p style={{ minHeight: '34px', margin: '0 0 10px', color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.6 }}>إرسال رابط آمن للعميل لتأكيد الطلب أو طلب إلغائه.</p>
                    <button type="button" role="switch" aria-checked={confirmationEnabled && hasActivePaidPlan} aria-busy={isSavingConfirmation} data-checked={confirmationEnabled && hasActivePaidPlan ? 'true' : 'false'} aria-label="تفعيل طلب تأكيد الطلب عبر تيليجرام" disabled={!hasActivePaidPlan || isSavingConfirmation}
                      onClick={() => void onToggleConfirmationTelegram()}
                      style={{ width: '48px', height: '27px', position: 'relative', display: 'block', border: 0, borderRadius: '99px', padding: '3px', direction: 'ltr', background: confirmationEnabled && hasActivePaidPlan ? '#273b30' : '#cbd1ca', cursor: !hasActivePaidPlan || isSavingConfirmation ? 'not-allowed' : 'pointer', opacity: !hasActivePaidPlan ? .55 : isSavingConfirmation ? .82 : 1, transition: 'background .18s ease, opacity .18s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.12)' }}>
                      <span className="dz-settings-switch-thumb">{isSavingConfirmation && <span className="dz-settings-switch-spinner" aria-hidden="true" />}</span>
                    </button>
                  </div>
                </div>
                {!hasActivePaidPlan && <p style={{ margin: '8px 0 0', paddingTop: '9px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '11px' }}>ميزة تأكيد الطلب متاحة في الباقات المدفوعة Basic وGrowth وScale.</p>}
              </div>
              <div className="dz-settings-section dz-settings-sms" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 0, padding: '18px 20px', marginBottom: '20px', boxShadow: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>03 / SMS DELIVERY</span>
                    <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>رسائل التتبع عبر SMS</h2>
                    <p style={{ margin: '5px 0 0', fontSize: '12px', lineHeight: 1.7, color: 'var(--ink-muted)' }}>إرسال رسالة SMS واحدة عند تسجيل كل طلب جديد، تحتوي على رابط صفحة التتبع. عند ربط تطبيق TajerTrack Phone، تُرسل الرسالة من شريحة هاتفك المختارة.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={smsEnabled} aria-busy={isSavingSms} data-checked={smsEnabled ? 'true' : 'false'} aria-label="تفعيل إرسال رابط التتبع عبر SMS" disabled={!smsTrackingStorageAvailable || isSavingSms} onClick={() => void onToggleSmsTracking()} style={{ width: '48px', height: '27px', flex: '0 0 48px', position: 'relative', display: 'block', border: 0, borderRadius: '99px', padding: '3px', direction: 'ltr', background: smsEnabled ? '#273b30' : '#cbd1ca', cursor: isSavingSms ? 'wait' : 'pointer', opacity: isSavingSms ? .7 : 1, transition: 'background .18s ease, opacity .18s ease', boxShadow: 'none' }}>
                    <span className="dz-settings-switch-thumb">{isSavingSms && <span className="dz-settings-switch-spinner" aria-hidden="true" />}</span>
                  </button>
                </div>
                {!smsTrackingStorageAvailable && <p role="status" style={{ margin: '10px 0 0', paddingTop: '10px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '12px', lineHeight: 1.7 }}>يلزم تطبيق تحديث قاعدة البيانات الخاص برسائل SMS أولاً لتفعيل هذه الميزة.</p>}
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: smsEnabled ? '#267548' : 'var(--ink-muted)', fontWeight: 700 }}>{smsEnabled ? 'إرسال رابط التتبع برسالة واحدة لكل طلب مفعّل' : 'إرسال SMS معطّل'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>لا تُرسل رسائل عند تغيّر حالات الشحنة.</span>
                </div>
              </div>

              <section className="dz-settings-section dz-settings-native-sms" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 0, padding: '18px 20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>ANDROID SMS PHONE</span>
                    <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>اربط هاتفك لإرسال الرسائل من شريحتك</h2>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.75, color: 'var(--ink-muted)' }}>استخدم هاتف Android وشريحة الاتصال الخاصة بك. بعد الربط، يرسل التطبيق رابط التتبع مرة واحدة لكل طلب جديد، دون Termux أو إعدادات تقنية.</p>
                  </div>
                  <div style={{ flex: '0 0 auto', minWidth: '150px', textAlign: 'start' }}>
                    <strong style={{ display: 'block', fontSize: '13px', color: nativeSmsDevice ? (nativeSmsDevice.enabled ? '#267548' : '#946b2d') : 'var(--ink-muted)' }}>
                      {!nativeSmsGatewayStorageAvailable ? 'الربط غير متاح حالياً' : nativeSmsDevice ? (nativeSmsDevice.enabled ? 'الهاتف مرتبط' : 'الهاتف موقوف') : 'لا يوجد هاتف مرتبط'}
                    </strong>
                    {nativeSmsDevice && <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: 'var(--ink-muted)' }}>{nativeSmsDevice.display_name || 'هاتف Android'}</span>}
                  </div>
                </div>
                {!nativeSmsGatewayStorageAvailable ? (
                  <p role="status" style={{ margin: '12px 0 0', paddingTop: '11px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '12px', lineHeight: 1.7 }}>سيظهر الربط بعد نشر تحديث خدمة الهاتف وتطبيق ترحيل قاعدة البيانات.</p>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', marginTop: '13px', paddingTop: '12px' }}>
                    {nativeSmsDevice && !nativeSmsDevice.enabled ? (
                      <p role="status" style={{ margin: 0, color: '#946b2d', fontSize: '11px', lineHeight: 1.7 }}>تم إيقاف هذا الهاتف من إدارة تاجر تراك. تواصل مع الدعم لإعادة تفعيله.</p>
                    ) : (
                      <>
                        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.7 }}>افتح هذه الصفحة من الهاتف الذي ثبّت عليه التطبيق، ثم وافق على ربطه بمتجرك.</p>
                        <a href="/mobile/sms-gateway/connect?redirect_uri=tajertrack-sms%3A%2F%2Fpair" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '42px', padding: '0 16px', background: 'var(--ink-main)', color: 'var(--surface)', textDecoration: 'none', fontSize: '12px', fontWeight: 700, borderRadius: 0, whiteSpace: 'nowrap' }}>
                          {nativeSmsDevice ? 'إعادة ربط الهاتف' : 'ربط الهاتف'}
                        </a>
                      </>
                    )}
                  </div>
                )}
                {nativeSmsDownloadUrl ? (
                  <a href={nativeSmsDownloadUrl} download style={{ display: 'inline-flex', marginTop: '12px', color: 'var(--ink-main)', fontSize: '12px', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}>تحميل تطبيق TajerTrack Phone</a>
                ) : (
                  <p style={{ margin: '10px 0 0', color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.6 }}>رابط تنزيل التطبيق سيظهر هنا بعد نشر نسخة Android الموقّعة.</p>
                )}
              </section>

              <div className="dz-settings-section dz-settings-exchange" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 0, padding: '18px 20px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: 0 }}><span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>04 / AFTER-SALES</span><h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>خدمات ما بعد البيع</h2><p style={{ margin: '5px 0 0', fontSize: '12px', lineHeight: 1.7, color: 'var(--ink-muted)' }}>اسمح للزبائن بطلب استبدال المنتجات بعد استلامها، وتابع الطلبات من لوحة التحكم.</p></div>
                  <button type="button" role="switch" aria-checked={exchangeRequestsEnabled} aria-busy={isSavingExchangeRequests} data-checked={exchangeRequestsEnabled ? 'true' : 'false'} aria-label="تفعيل طلبات الاستبدال" disabled={!exchangeRequestsStorageAvailable || isSavingExchangeRequests} onClick={() => void onToggleExchangeRequests()} style={{ width: '48px', height: '27px', flex: '0 0 48px', position: 'relative', display: 'block', border: 0, borderRadius: '99px', padding: '3px', direction: 'ltr', background: exchangeRequestsEnabled ? '#273b30' : '#cbd1ca', cursor: !exchangeRequestsStorageAvailable || isSavingExchangeRequests ? 'not-allowed' : 'pointer', opacity: !exchangeRequestsStorageAvailable || isSavingExchangeRequests ? .62 : 1, transition: 'background .18s ease, opacity .18s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.12)' }}><span className="dz-settings-switch-thumb">{isSavingExchangeRequests && <span className="dz-settings-switch-spinner" aria-hidden="true" />}</span></button>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}><span style={{ fontSize: '12px', color: exchangeRequestsEnabled ? '#267548' : 'var(--ink-muted)', fontWeight: 700 }}>{exchangeRequestsEnabled ? 'طلبات الاستبدال مفعّلة' : 'طلبات الاستبدال معطّلة'}</span>{!exchangeRequestsStorageAvailable && <p role="status" style={{ width: '100%', margin: 0, paddingTop: '10px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '12px', lineHeight: 1.7 }}>يلزم تطبيق تحديث قاعدة البيانات الخاص بطلبات الاستبدال أولاً لتفعيل هذه الميزة.</p>}</div>
              </div>

              <section className="dz-settings-billing">
              <div className="dz-settings-billing-heading" style={{ margin: '0 0 13px' }}>
                <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>04 / SUBSCRIPTION</span>
                <h2 style={{ margin: '3px 0 0', fontSize: '19px', fontWeight: 800, color: 'var(--ink-main)' }}>الاشتراك والاستهلاك</h2>
              </div>

              {/* Unlimited Plan Status Card (brand-aligned, no emoji) */}
              {isUnlimitedPlan && (
                <div className="dz-unlimited-card" role="status" aria-live="polite">
                  <div className="dz-unlimited-card-content">
                    <div className="dz-unlimited-header">
                      <span className="dz-unlimited-badge">
                        <Icons.Zap /> اشتراك سابق مفتوح
                      </span>
                      <span className="dz-unlimited-pill">
                        <Icons.Check /> نشطة
                      </span>
                    </div>
                    <h3 className="dz-unlimited-title">
                      كان اشتراكك يمنحك سقفاً مفتوحاً؛ الباقة الجديدة بسعر 2,500 دج تمنح 500 رابط تتبّع شهرياً.
                    </h3>
                    <p className="dz-unlimited-desc">
                      عند التجديد، ستكون باقة 2,500 دج محدودة بـ 500 رابط تتبّع شهرياً.
                    </p>
                  </div>
                  <div className="dz-unlimited-aside">
                    <span className="dz-unlimited-symbol">∞</span>
                    <span className="dz-unlimited-symbol-label">سقف الاشتراك السابق</span>
                  </div>
                </div>
              )}

              <div className="dz-stats-bar dz-settings-subscription-stats" style={{ marginBottom: '20px' }}>
                <div className="dz-stat-item">
                  <span className="dz-stat-title">الباقة الحالية</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span className="dz-stat-value" style={{ margin: 0, textTransform: 'capitalize' }}>
                      {subscription.tier === 'scale' && isUnlimitedPlan ? 'غير محدودة (اشتراك قائم)' : ({ starter: 'مجانية (30 رابطاً)', basic: '100 رابط', growth: '200 رابط', scale: '500 رابط' }[subscription.tier] || subscription.tier)}
                    </span>
                    <span className={`dz-pill ${subscription.status === 'active' ? 'dz-pill-success' : 'dz-pill-danger'}`}>
                      {subscription.status === 'active' ? 'نشط' : 'موقوف'}
                    </span>
                  </div>
                  <span className="dz-stat-sub">
                    {subscription.expiresAt ? `تاريخ الانتهاء: ${new Date(subscription.expiresAt).toLocaleDateString('ar-DZ')}` : subscription.tier === 'starter' ? 'لا تحتاج الباقة المجانية إلى تجديد مدفوع' : 'تُفعّل الباقة بعد مراجعة وصل الدفع'}
                  </span>
                </div>
                
                <div className="dz-stat-item">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="dz-stat-title" style={{ margin: 0 }}>استهلاك روابط التتبّع شهرياً</span>
                    {isUnlimitedPlan && <span className="dz-unlimited-stat-tag">∞ سقف الاشتراك الحالي</span>}
                  </div>
                  <span className="dz-stat-value" style={{ marginBottom: '16px' }}>
                    {subscription.used}{' '}
                    <span style={{ fontSize: '14px', color: isUnlimitedPlan ? '#16a34a' : 'var(--ink-muted)', fontWeight: 600 }}>
                      / {isUnlimitedPlan ? '∞ (غير محدود)' : normalizedLimit}
                    </span>
                  </span>
                  {isUnlimitedPlan ? (
                    <div className="dz-unlimited-progress-track">
                      <div className="dz-unlimited-progress-fill" />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-base)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(Math.round((subscription.used / (normalizedLimit || 1)) * 100), 100)}%`, height: '100%', background: subscription.used >= normalizedLimit ? '#ef4444' : 'var(--ink-main)', transition: 'width 0.5s ease' }} />
                    </div>
                  )}
                </div>
              </div>
              <p className="dz-billing-usage-note">
                {isUnlimitedPlan 
                  ? 'سقف اشتراكك الحالي مفتوح حتى انتهائه؛ عند التجديد ستكون باقة 2,500 دج محدودة بـ 500 رابط شهرياً.' 
                  : `تبقّى لك ${Math.max(normalizedLimit - subscription.used, 0)} رابطاً من أصل ${normalizedLimit} لهذا الشهر. عند الاقتراب من الحد، يمكنك اختيار باقة أعلى من هنا. تُطبّق الباقة بعد مراجعة الدفع وتأكيده.`}
              </p>

              {/* PLAN SELECTION SECTION — conditional on active paid plan */}
              {hasActivePaidPlan && isUnlimitedPlan ? (
                /* Scale plan active: no need to pick a pack, offer advance renewal only */
                <div className="dz-active-plan-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span className="dz-unlimited-badge"><Icons.Shield /> الباقة غير المحدودة نشطة</span>
                    {expiryDateFormatted && (
                      <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>حتى {expiryDateFormatted}</span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                    أنت على الباقة غير المحدودة. لا حاجة لاختيار باقة أخرى حالياً.
                    {expiryDateFormatted && ` تجديد الباقة الحالية سيكون في ${expiryDateFormatted}.`}
                  </p>
                  <button
                    type="button"
                    className="dz-btn dz-btn-outline"
                    style={{ fontSize: '13px' }}
                    onClick={() => onToggleAdvanceRenewal()}
                  >
                    {showAdvanceRenewal ? 'إلغاء الدفع المسبق' : 'دفع تجديد الشهر القادم مسبقاً'}
                  </button>
                  {!showAdvanceRenewal && (
                    <p style={{ margin: '12px 0 0', fontSize: '11px', color: 'var(--ink-muted)' }}>
                      يمكنك تحويل مبلغ التجديد مسبقاً قبل انتهاء الباقة وإرسال وصل الدفع للمراجعة.
                    </p>
                  )}
                </div>
              ) : (
                /* Not on scale or no active paid plan: show full plan chooser */
                <section className="dz-billing-pricing" aria-labelledby="dz-billing-pricing-title" dir="rtl">
                  {hasActivePaidPlan && expiryDateFormatted && (
                    <div className="dz-billing-next-cycle-banner">
                      <strong>اختيار الباقة للشهر القادم</strong>
                      <p>
                        باقتك الحالية نشطة حتى {expiryDateFormatted}. أي باقة تختارها وتدفع لها الآن ستُفعَّل تلقائياً في الدورة القادمة ابتداءً من ذلك التاريخ.
                      </p>
                    </div>
                  )}
                  <div className="dz-billing-pricing-head"><span className="dz-setup-eyebrow">الأسعار الشهرية</span><h3 id="dz-billing-pricing-title">اختَر الباقة حسب عدد روابط التتبّع</h3><p>يُحسب الحد حسب روابط التتبّع الجديدة خلال الشهر.</p></div>
                  <div className="dz-billing-plan-list">
                    <div className={`dz-billing-plan ${subscription.tier === 'starter' ? 'is-current' : ''}`}><div><strong>مجانية</strong><small>حتى 30 رابط تتبّع شهرياً</small></div><b>0 <small>دج / شهر</small></b><span>{subscription.tier === 'starter' ? 'باقتك الحالية' : 'للتجربة والبدء'}</span><div className="dz-billing-plan-benefit">إدارة أساسية للطلبات ورابط تتبّع لكل شحنة.</div></div>
                    <div className={`dz-billing-plan ${subscription.tier === 'basic' ? 'is-current' : ''} ${selectedUpgradeTier === 'basic' ? 'is-selected' : ''}`}>
                      <div><strong>100 رابط</strong><small>حتى 100 رابط تتبّع شهرياً</small></div>
                      <b>1,000 <small>دج / شهر</small></b>
                      <div className="dz-billing-plan-benefit">للمتاجر التي تحتاج مساحة أكبر للطلبات.</div>
                      {subscription.tier === 'basic' && hasActivePaidPlan ? (
                        <span style={{ fontSize: '11px', color: '#263b30', fontWeight: 700, textAlign: 'center', padding: '6px 0' }}>
                          باقتك الحالية{expiryDateFormatted ? ` (حتى ${expiryDateFormatted})` : ''}
                        </span>
                      ) : (
                        <button type="button" onClick={() => onSelectUpgradeTier('basic')}>
                          {selectedUpgradeTier === 'basic' ? 'الباقة المختارة' : (hasActivePaidPlan ? 'اختيار للشهر القادم' : 'اختيار الباقة')}
                        </button>
                      )}
                    </div>
                    <div className={`dz-billing-plan ${subscription.tier === 'growth' ? 'is-current' : ''} ${selectedUpgradeTier === 'growth' ? 'is-selected' : ''}`}>
                      <div><strong>200 رابط</strong><small>حتى 200 رابط تتبّع شهرياً</small></div>
                      <b>1,800 <small>دج / شهر</small></b>
                      <div className="dz-billing-plan-benefit">للنمو مع متابعة عدد أكبر من الشحنات.</div>
                      {subscription.tier === 'growth' && hasActivePaidPlan ? (
                        <span style={{ fontSize: '11px', color: '#263b30', fontWeight: 700, textAlign: 'center', padding: '6px 0' }}>
                          باقتك الحالية{expiryDateFormatted ? ` (حتى ${expiryDateFormatted})` : ''}
                        </span>
                      ) : (
                        <button type="button" onClick={() => onSelectUpgradeTier('growth')}>
                          {selectedUpgradeTier === 'growth' ? 'الباقة المختارة' : (hasActivePaidPlan ? 'اختيار للشهر القادم' : 'اختيار الباقة')}
                        </button>
                      )}
                    </div>
                    <div className={`dz-billing-plan ${subscription.tier === 'scale' ? 'is-current' : ''} ${selectedUpgradeTier === 'scale' ? 'is-selected' : ''}`}>
                      <div><strong>500 رابط</strong><small>حتى 500 رابط تتبّع شهرياً</small></div>
                      <b>2,500 <small>دج / شهر</small></b>
                      <div className="dz-billing-plan-benefit">للمتاجر ذات حجم الشحنات المرتفع.</div>
                      <button type="button" onClick={() => onSelectUpgradeTier('scale')}>
                        {selectedUpgradeTier === 'scale' ? 'الباقة المختارة' : (hasActivePaidPlan ? 'اختيار للشهر القادم' : 'اختيار الباقة')}
                      </button>
                    </div>
                  </div>
                  <div className="dz-billing-selected-summary"><div><strong>الباقة المحددة للدفع: {{ basic: '100 رابط', growth: '200 رابط', scale: '500 رابط' }[selectedUpgradeTier]}{hasActivePaidPlan && expiryDateFormatted ? ` (تبدأ ${expiryDateFormatted})` : ''}</strong><p>حوّل المبلغ عبر BaridiMob ثم أرسل رقم العملية ورابط صورة الوصل في النموذج أدناه. لن تتغير باقتك حتى تتم مراجعة الدفع.</p></div><div className="dz-billing-selected-price">{{ basic: '1,000', growth: '1,800', scale: '2,500' }[selectedUpgradeTier]} <small>دج / شهر</small></div></div>
                </section>
              )}

              <div className="dz-billing-custom-plan" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginTop: '18px', padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 0 }}>
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <strong style={{ display: 'block', color: 'var(--ink-main)', fontSize: '14px' }}>خطة مخصصة</strong>
                  <span style={{ display: 'block', marginTop: '5px', color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.7 }}>لأكثر من 500 رابط تتبّع شهرياً أو لاحتياجات تشغيل خاصة. نتفق معك على السقف والسعر.</span>
                </div>
                <a href="/#pricing" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '39px', padding: '0 14px', background: 'var(--ink-main)', color: 'var(--surface)', textDecoration: 'none', fontSize: '11px', fontWeight: 700, borderRadius: 0, whiteSpace: 'nowrap' }}>ناقش باقة مخصصة <span aria-hidden="true" style={{ marginInlineStart: '8px' }}>↗</span></a>
              </div>

              {/* BaridiMob payment form: always shown except when scale plan is active and advance renewal is not requested */}
              {(!hasActivePaidPlan || !isUnlimitedPlan || showAdvanceRenewal) && (
              <>
              <h3 className="dz-settings-payment-title" style={{ fontSize: '18px', fontWeight: 800, margin: '32px 0 24px' }}>تأكيد التحويل عبر BaridiMob</h3>
              
              <div className="dz-settings-payment-layout" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                
                {/* Form Side */}
                <div className="dz-card-box dz-settings-payment-form" style={{ flex: '1 1 400px' }}>
                  
                  <div className="dz-settings-rip-card" style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>رقم الحساب البريدي الجاري (RIP):</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                      <strong className="dz-mono" style={{ fontSize: '16px', background: 'transparent', border: 'none', padding: 0 }}>00799999123456789</strong>
                      <button className="dz-icon-btn" onClick={() => onCopyToClipboard('00799999002233445566', 'rip')}><Icons.Copy /></button>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '8px' }}>صاحب الحساب: تاجر تراك </div>
                  </div>

                  <form onSubmit={onSubmitProof}>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="formLabel">اختر الباقة</label>
                      <BrandedSelect
                        ariaLabel="اختر الباقة"
                        value={selectedUpgradeTier}
                        onChange={(value) => onSelectUpgradeTier(value as UpgradeTier)}
                        variant="field"
                        options={[
                          { value: 'basic', label: '100 رابط تتبّع شهرياً — 1,000 دج' },
                          { value: 'growth', label: '200 رابط تتبّع شهرياً — 1,800 دج' },
                          { value: 'scale', label: '500 رابط تتبّع شهرياً — 2,500 دج' },
                        ]}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="formLabel">رقم العملية (Transaction Ref)</label>
                      <input type="text" name="transaction_ref" placeholder="BM-..." className="input" required />
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                      <ImageUploadField
                        label="صورة وصل التحويل"
                        required
                        value={proofImageUrl}
                        onChange={onProofImageUrlChange}
                        merchantId={merchantId}
                        folder="payment-receipts"
                        quality={0.78}
                        placeholder="ارفع صورة الوصل (CCP / BaridiMob)"
                      />
                      <small style={{ display: 'block', marginTop: '6px', color: 'var(--ink-muted)', fontSize: '11px' }}>
                        الصورة تُرفع مباشرة وتُحفظ تلقائياً — لا تحتاج لرابط خارجي
                      </small>
                    </div>
                    <button type="submit" disabled={isSubmittingProof} className="dz-btn" style={{ width: '100%' }}>
                      {isSubmittingProof ? 'جاري الإرسال...' : 'إرسال وصل التحويل للمراجعة'}
                    </button>
                  </form>
                </div>

                {/* History Side */}
                <div className="dz-settings-payment-history" style={{ flex: '2 1 500px' }}>
                  <div className="dz-table-wrap">
                    <div className="dz-table-header">
                      <h3>سجل المدفوعات</h3>
                    </div>
                    <div className="dz-table-scroll" style={{ maxHeight: '420px' }}>
                      <table className="dz-settings-payment-table">
                        <thead>
                          <tr>
                            <th>الباقة والمبلغ</th>
                            <th>المرجع</th>
                            <th>الحالة</th>
                            <th>التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-muted)' }}>لم تقم بأي تحويلات بعد.</td></tr>
                          ) : (
                            payments.map((p) => (
                              <tr key={p.id}>
                                <td data-label="الباقة والمبلغ">
                                   <div className="dz-settings-payment-plan-cell">
                                     <strong>{p.plan_tier.toUpperCase()}</strong>
                                     <span className="dz-mono" style={{ fontSize: '11px', border: 'none', background: 'transparent', padding: 0 }}>{p.amount_dzd.toLocaleString()} DZD</span>
                                   </div>
                                 </td>
                                <td data-label="المرجع"><span className="dz-mono">{p.transaction_ref || '—'}</span></td>
                                <td data-label="الحالة">
                                   {p.status === 'approved' && <span className="dz-pill dz-pill-success">مقبول</span>}
                                  {p.status === 'pending' && <span className="dz-pill dz-pill-warning">قيد المراجعة</span>}
                                  {p.status === 'rejected' && <span className="dz-pill dz-pill-danger">مرفوض</span>}
                                </td>
                                <td data-label="التاريخ" style={{ color: 'var(--ink-muted)' }}>{new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              </>
              )}
              </section>

              <section
                className="dz-settings-section dz-settings-legal"
                aria-labelledby="dz-settings-legal-title"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: '18px', padding: '18px 20px', marginBottom: '14px', boxShadow: 'var(--shadow-sm)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>05 / LEGAL & PRIVACY</span>
                    <h2 id="dz-settings-legal-title" style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>الوثائق القانونية</h2>
                    <p style={{ margin: '5px 0 0', fontSize: '12px', color: 'var(--ink-muted)', lineHeight: 1.8 }}>راجع شروط استخدام المنصة وكيفية التعامل مع بيانات متجرك وزبائنك.</p>
                  </div>
                  <Icons.Shield />
                </div>
                <nav aria-label="الوثائق القانونية" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 26px', paddingTop: '8px' }}>
                  <a href="/privacy" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--green, #294b37)', fontSize: '12px', fontWeight: 750, textDecoration: 'none', borderBottom: '1px solid var(--border-soft)' }}>
                    سياسة الخصوصية <span aria-hidden="true">↗</span>
                  </a>
                  <a href="/terms" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--green, #294b37)', fontSize: '12px', fontWeight: 750, textDecoration: 'none', borderBottom: '1px solid var(--border-soft)' }}>
                    شروط الاستخدام <span aria-hidden="true">↗</span>
                  </a>
                </nav>
              </section>
            </div>
  );
}
