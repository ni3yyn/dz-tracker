'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getMerchantCarrierIntegrations, getMerchantIntegrationApiKey } from './actions';
import { EcoTrackConnectionPanel } from './EcoTrackConnectionPanel';
import { ZRExpressConnectionPanel } from './ZRExpressConnectionPanel';
import { ProcolisConnectionPanel } from './ProcolisConnectionPanel';
import { MaystroConnectionPanel } from './MaystroConnectionPanel';
import { ZimouConnectionPanel } from './ZimouConnectionPanel';
import { ElogistiaConnectionPanel } from './ElogistiaConnectionPanel';
import { EcomV2ConnectionPanel } from './EcomV2ConnectionPanel';
import { YalidineConnectionPanel } from './YalidineConnectionPanel';

type ProviderId =
  | 'yalidine'
  | 'ecotrack'
  | 'zrexpress'
  | 'procolis'
  | 'maystro'
  | 'zimou'
  | 'elogistia'
  | 'ecom_v2';

type ProviderSummary = {
  provider: string;
  sync_enabled: boolean | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_webhook_received_at: string | null;
  last_webhook_processed_at: string | null;
};

type OrderSource = 'shopify' | 'website' | 'manual';

type Props = {
  merchantId: string;
  siteUrl: string;
  onOpenOrders: () => void;
};

const PROVIDERS: Array<{ id: ProviderId; name: string; method: string; description: string }> = [
  { id: 'yalidine', name: 'Yalidine', method: 'Webhook موقّع', description: 'تحديثات الشحنات عبر Webhook موثّق' },
  { id: 'ecotrack', name: 'EcoTrack', method: 'API ومزامنة دورية', description: 'اكتشاف الشحنات ومزامنة الحالات عبر API' },
  { id: 'zrexpress', name: 'ZR Express', method: 'API وWebhook', description: 'اتصال مستقل ببيانات حساب ZR Express' },
  { id: 'procolis', name: 'Procolis', method: 'API ومزامنة دورية', description: 'قراءة حالات أرقام التتبع المسجلة في الطلبات، باتصال مستقل عن ZR Express' },
  { id: 'maystro', name: 'Maystro', method: 'API وWebhook', description: 'استقبال الأحداث وربط بيانات الطرود' },
  { id: 'zimou', name: 'Zimou Express', method: 'API ومزامنة دورية', description: 'قراءة الشحنات المرتبطة ومزامنة الحالات' },
  { id: 'elogistia', name: 'Elogistia', method: 'API ومزامنة دورية', description: 'قراءة بيانات الشحنات ومزامنة الحالات' },
  { id: 'ecom_v2', name: 'E-com Delivery v2', method: 'API ومزامنة دورية', description: 'قراءة بيانات الشحنات ومزامنة الحالات' },
];

const panelButtonStyle: React.CSSProperties = {
  border: '1px solid var(--border-soft, #dfe4dc)',
  background: 'var(--bg-surface, #fff)',
  color: 'var(--ink-main, #263b30)',
  borderRadius: 0,
  padding: '10px 13px',
  minHeight: 40,
  fontWeight: 750,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  ...panelButtonStyle,
  background: 'var(--brand-primary, #263b30)',
  color: '#fff',
  borderColor: 'var(--brand-primary, #263b30)',
};

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }) : 'لا يوجد نشاط مسجل بعد';
}

export function CarrierIntegrationsManager({ merchantId, siteUrl, onOpenOrders }: Props) {
  const [connections, setConnections] = useState<ProviderSummary[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);
  const [orderSource, setOrderSource] = useState<OrderSource | null>(null);
  const [sourceHydrated, setSourceHydrated] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const [apiKeyRevealed, setApiKeyRevealed] = useState(false);
  const [copied, setCopied] = useState('');

  const refreshConnections = useCallback(async () => {
    setRefreshing(true);
    setConnectionError('');
    try {
      const result = await getMerchantCarrierIntegrations();
      if (!result.success) throw new Error(result.error || 'تعذر تحميل شركات التوصيل.');
      setConnections(result.connections as ProviderSummary[]);
    } catch (error: any) {
      setConnectionError(error?.message || 'تعذر تحميل شركات التوصيل.');
    } finally {
      setLoadingConnections(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refreshConnections(); }, [refreshConnections]);

  useEffect(() => {
    setSourceHydrated(false);
    setOrderSource(null);
    try {
      const current = window.localStorage.getItem(`tajertrack:integration-source:v2:${merchantId}`);
      const legacy = window.localStorage.getItem(`tajertrack:integration-setup:v1:${merchantId}`);
      const saved = current ? JSON.parse(current) : legacy ? JSON.parse(legacy) : null;
      const source = saved?.platform;
      if (source === 'shopify' || source === 'website' || source === 'manual') setOrderSource(source);
    } catch {
      // Browser storage can be disabled or contain invalid JSON.
    } finally {
      setSourceHydrated(true);
    }
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId || !sourceHydrated) return;
    const key = `tajertrack:integration-source:v2:${merchantId}`;
    try {
      if (orderSource) {
        window.localStorage.setItem(key, JSON.stringify({ version: 2, platform: orderSource, savedAt: new Date().toISOString() }));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Keep the current selection usable even when browser storage is unavailable.
    }
  }, [merchantId, orderSource, sourceHydrated]);

  useEffect(() => {
    let cancelled = false;
    if (orderSource !== 'shopify' && orderSource !== 'website') {
      setApiKey('');
      setApiKeyError('');
      setApiKeyLoading(false);
      setApiKeyRevealed(false);
      return;
    }
    setApiKeyLoading(true);
    setApiKeyError('');
    getMerchantIntegrationApiKey()
      .then((result) => {
        if (cancelled) return;
        setApiKey(result.apiKey || '');
        if (result.error || !result.apiKey) setApiKeyError(result.error || 'تعذر تحميل مفتاح الربط.');
      })
      .catch((error: any) => {
        if (!cancelled) setApiKeyError(error?.message || 'تعذر تحميل مفتاح الربط.');
      })
      .finally(() => {
        if (!cancelled) setApiKeyLoading(false);
      });
    return () => { cancelled = true; };
  }, [orderSource, merchantId]);

  const connectedByProvider = useMemo(() => {
    const map = new Map<string, ProviderSummary>();
    for (const connection of connections) map.set(connection.provider, connection);
    return map;
  }, [connections]);

  const availableProviders = useMemo(
    () => PROVIDERS.filter((provider) => !connectedByProvider.has(provider.id)),
    [connectedByProvider],
  );

  const activeProviderDetails = PROVIDERS.find((provider) => provider.id === activeProvider) ?? null;
  const baseUrl = siteUrl.replace(/\\/$/, '');
  const shopifyWebhookUrl = apiKey ? `${baseUrl}/api/webhooks/shopify?key=${encodeURIComponent(apiKey)}` : '';
  const websiteWebhookUrl = apiKey ? `${baseUrl}/api/webhooks?key=${encodeURIComponent(apiKey)}` : '';

  const copyValue = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  };

  const handleReturnToList = async () => {
    setActiveProvider(null);
    setShowProviderPicker(false);
    await refreshConnections();
  };

  return (
    <div className="dz-carrier-manager" style={{ display: 'grid', gap: 26, maxWidth: 1100, paddingBottom: 50 }}>
      <section aria-labelledby="dz-order-source-title">
        <div style={{ marginBottom: 14 }}>
          <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>مصدر الطلبات</span>
          <h2 id="dz-order-source-title" style={{ margin: '5px 0', color: 'var(--ink-main)', fontSize: 19, fontWeight: 850 }}>من أين تصل طلبات متجرك؟</h2>
          <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.8 }}>هذا الإعداد مستقل عن شركات التوصيل. تغييره لا يفصل أي شركة مرتبطة.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
          {([
            { id: 'shopify', title: 'Shopify', description: 'استقبال الطلبات تلقائياً من متجر Shopify.' },
            { id: 'website', title: 'موقع إلكتروني خاص', description: 'ربط موقع مبرمج عبر API أو Webhook.' },
            { id: 'manual', title: 'إضافة يدوية', description: 'تسجيل الطلبات من لوحة تاجر تراك.' },
          ] as const).map((option) => {
            const selected = orderSource === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setOrderSource(option.id)}
                aria-pressed={selected}
                style={{
                  ...panelButtonStyle,
                  textAlign: 'start',
                  minHeight: 86,
                  background: selected ? 'var(--bg-base, #f1f4ef)' : 'var(--bg-surface, #fff)',
                  borderColor: selected ? 'var(--brand-primary, #52775a)' : 'var(--border-soft, #dfe4dc)',
                }}
              >
                <strong style={{ display: 'block', marginBottom: 5 }}>{option.title}</strong>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, lineHeight: 1.7, color: 'var(--ink-muted)' }}>{option.description}</span>
              </button>
            );
          })}
        </div>

        {orderSource === 'shopify' && (
          <div style={{ marginTop: 12, padding: 15, background: 'var(--bg-surface, #fff)', borderBlock: '1px solid var(--border-soft, #dfe4dc)', display: 'grid', gap: 11 }}>
            <strong>رابط استقبال طلبات Shopify</strong>
            {apiKeyLoading ? <p style={{ margin: 0, color: 'var(--ink-muted)' }}>جارٍ تحميل بيانات الربط...</p> : apiKeyError ? <p role="alert" style={{ margin: 0, color: '#a12e27' }}>{apiKeyError}</p> : (
              <>
                <code dir="ltr" style={{ overflowWrap: 'anywhere', color: 'var(--ink-main)' }}>{shopifyWebhookUrl}</code>
                <button type="button" style={{ ...primaryButtonStyle, justifySelf: 'start' }} onClick={() => copyValue(shopifyWebhookUrl, 'shopify')} disabled={!shopifyWebhookUrl}>{copied === 'shopify' ? 'تم النسخ' : 'نسخ الرابط'}</button>
                <ol style={{ margin: 0, paddingInlineStart: 22, color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.9 }}>
                  <li>افتح Shopify ثم Settings ثم Notifications.</li>
                  <li>من Webhooks أنشئ Webhook لحدث Order creation بصيغة JSON.</li>
                  <li>أضف الرابط أعلاه ثم احفظ الإعداد.</li>
                </ol>
              </>
            )}
          </div>
        )}

        {orderSource === 'website' && (
          <div style={{ marginTop: 12, padding: 15, background: 'var(--bg-surface, #fff)', borderBlock: '1px solid var(--border-soft, #dfe4dc)', display: 'grid', gap: 11 }}>
            <strong>بيانات الربط الخاصة بموقعك</strong>
            {apiKeyLoading ? <p style={{ margin: 0, color: 'var(--ink-muted)' }}>جارٍ تحميل بيانات الربط...</p> : apiKeyError ? <p role="alert" style={{ margin: 0, color: '#a12e27' }}>{apiKeyError}</p> : (
              <>
                <div style={{ display: 'grid', gap: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>مفتاح API</span>
                  <code dir="ltr" style={{ overflowWrap: 'anywhere' }}>{apiKeyRevealed ? apiKey : apiKey ? `${apiKey.slice(0, 8)}••••••••••••••••` : 'غير متاح'}</code>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button type="button" style={panelButtonStyle} onClick={() => setApiKeyRevealed((value) => !value)}>{apiKeyRevealed ? 'إخفاء المفتاح' : 'إظهار المفتاح'}</button>
                    <button type="button" style={panelButtonStyle} onClick={() => copyValue(apiKey, 'api-key')} disabled={!apiKey}>{copied === 'api-key' ? 'تم النسخ' : 'نسخ المفتاح'}</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>معرّف المتجر</span>
                  <code dir="ltr">{merchantId}</code>
                  <button type="button" style={{ ...panelButtonStyle, justifySelf: 'start' }} onClick={() => copyValue(merchantId, 'merchant-id')}>{copied === 'merchant-id' ? 'تم النسخ' : 'نسخ المعرّف'}</button>
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>رابط استقبال الطلبات المباشر</span>
                  <code dir="ltr" style={{ overflowWrap: 'anywhere' }}>{websiteWebhookUrl}</code>
                  <button type="button" style={{ ...primaryButtonStyle, justifySelf: 'start' }} onClick={() => copyValue(websiteWebhookUrl, 'website-webhook')} disabled={!websiteWebhookUrl}>{copied === 'website-webhook' ? 'تم النسخ' : 'نسخ الرابط'}</button>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.8 }}>استخدم المفتاح في الخادم فقط، ولا تضعه في كود المتصفح أو مستودع عام. راجع <a href={`${baseUrl}/skill.md`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>دليل المطور</a> لخطوات SDK وREST.</p>
              </>
            )}
          </div>
        )}

        {orderSource === 'manual' && (
          <div style={{ marginTop: 12, padding: 15, borderBlock: '1px solid var(--border-soft, #dfe4dc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>يمكنك تسجيل الطلبات مباشرة، ثم ربطها بشركة التوصيل المناسبة من قسم الشركات أدناه.</span>
            <button type="button" style={primaryButtonStyle} onClick={onOpenOrders}>فتح الطلبات</button>
          </div>
        )}
      </section>

      <section aria-labelledby="dz-carrier-list-title" style={{ borderTop: '1px solid var(--border-soft, #dfe4dc)', paddingTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>تحديثات الشحن</span>
            <h2 id="dz-carrier-list-title" style={{ margin: '5px 0', color: 'var(--ink-main)', fontSize: 19, fontWeight: 850 }}>شركات التوصيل</h2>
            <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.8 }}>اربط أكثر من شركة. لكل شركة بيانات ومزامنة مستقلة.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{connections.length} اتصال محفوظ</span>
            <button type="button" style={primaryButtonStyle} onClick={() => { setActiveProvider(null); setShowProviderPicker((value) => !value); }}>
              {showProviderPicker ? 'إغلاق القائمة' : '+ إضافة شركة'}
            </button>
          </div>
        </div>

        {connectionError && <p role="alert" style={{ color: '#a12e27', fontSize: 13 }}>{connectionError}</p>}
        {loadingConnections ? (
          <p style={{ padding: '18px 0', color: 'var(--ink-muted)', fontSize: 13 }}>جارٍ تحميل اتصالات المتجر...</p>
        ) : connections.length === 0 ? (
          <div style={{ padding: '22px 0', borderBlock: '1px solid var(--border-soft, #dfe4dc)' }}>
            <strong style={{ color: 'var(--ink-main)' }}>لم تربط أي شركة توصيل بعد</strong>
            <p style={{ margin: '6px 0 0', color: 'var(--ink-muted)', fontSize: 13 }}>أضف أول شركة تستخدمها. يمكنك إضافة شركات أخرى في أي وقت دون إعادة إعداد مصدر الطلبات.</p>
          </div>
        ) : (
          <div>
            {connections.map((connection) => {
              const provider = PROVIDERS.find((item) => item.id === connection.provider);
              if (!provider) return null;
              const active = connection.sync_enabled !== false;
              const hasError = Boolean(connection.last_error);
              const lastActivity = connection.last_webhook_processed_at || connection.last_webhook_received_at || connection.last_success_at || connection.last_sync_at;
              return (
                <div key={connection.provider} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 0', borderBottom: '1px solid var(--border-soft, #e5e8e2)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: 'block', color: 'var(--ink-main)', fontSize: 14 }}>{provider.name}</strong>
                    <span style={{ display: 'block', marginTop: 3, color: hasError ? '#a12e27' : active ? '#34734a' : 'var(--ink-muted)', fontSize: 12 }}>
                      {hasError ? 'يحتاج إلى مراجعة' : active ? 'الاتصال مفعّل' : 'الاتصال متوقف'}
                    </span>
                    <span style={{ display: 'block', marginTop: 3, color: 'var(--ink-muted)', fontSize: 11 }}>
                      {lastActivity ? `آخر نشاط: ${dateLabel(lastActivity)}` : `أضيف في: ${dateLabel(connection.connected_at)}`}
                      {connection.last_error ? ` · ${connection.last_error}` : ''}
                    </span>
                  </div>
                  <button type="button" style={panelButtonStyle} onClick={() => { setShowProviderPicker(false); setActiveProvider(provider.id); }}>إدارة</button>
                </div>
              );
            })}
          </div>
        )}

        {showProviderPicker && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border-soft, #dfe4dc)', paddingTop: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <strong>اختر شركة التوصيل</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-muted)', fontSize: 12 }}>لن تتغير الاتصالات الموجودة عند إضافة شركة جديدة.</p>
            </div>
            {availableProviders.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>جميع الشركات المدرجة لها اتصال محفوظ بالفعل.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 7 }}>
                {availableProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => { setActiveProvider(provider.id); setShowProviderPicker(false); }}
                    style={{ ...panelButtonStyle, textAlign: 'start', minHeight: 70 }}
                  >
                    <strong style={{ display: 'block' }}>{provider.name}</strong>
                    <span style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>{provider.method}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeProvider && activeProviderDetails && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border-soft, #dfe4dc)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>إعداد مستقل</span>
                <h3 style={{ margin: '4px 0', fontSize: 17, color: 'var(--ink-main)' }}>{activeProviderDetails.name}</h3>
              </div>
              <button type="button" style={panelButtonStyle} onClick={handleReturnToList}>العودة إلى الشركات</button>
            </div>
            {activeProvider === 'yalidine' && <YalidineConnectionPanel />}
            {activeProvider === 'ecotrack' && <EcoTrackConnectionPanel />}
            {activeProvider === 'zrexpress' && <ZRExpressConnectionPanel />}
            {activeProvider === 'procolis' && <ProcolisConnectionPanel />}
            {activeProvider === 'maystro' && <MaystroConnectionPanel />}
            {activeProvider === 'zimou' && <ZimouConnectionPanel />}
            {activeProvider === 'elogistia' && <ElogistiaConnectionPanel />}
            {activeProvider === 'ecom_v2' && <EcomV2ConnectionPanel />}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" style={panelButtonStyle} onClick={() => void refreshConnections()} disabled={refreshing}>
            {refreshing ? 'جارٍ التحديث...' : 'تحديث القائمة'}
          </button>
        </div>
      </section>

      <style jsx global>{`
        .dz-carrier-manager .dz-int-guided-panel,
        .dz-carrier-manager .dz-int-guided-card,
        .dz-carrier-manager .dz-int-guided-result,
        .dz-carrier-manager .dz-int-guided-panel-title,
        .dz-carrier-manager .dz-int-guided-copy,
        .dz-carrier-manager .dz-int-guided-meta,
        .dz-carrier-manager .dz-int-guided-note {
          border-radius: 0 !important;
        }
        .dz-carrier-manager .dz-btn,
        .dz-carrier-manager .dz-support-copy,
        .dz-carrier-manager button,
        .dz-carrier-manager input {
          border-radius: 0 !important;
        }
        .dz-carrier-manager .dz-int-guided-panel {
          margin: 0 !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
}
