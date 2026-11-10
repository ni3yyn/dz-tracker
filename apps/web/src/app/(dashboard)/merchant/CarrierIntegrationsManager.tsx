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
import { SdkIntegrationGuide } from './SdkIntegrationGuide';

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
  const [activeSubtab, setActiveSubtab] = useState<'carriers' | 'order_source' | 'sdk'>('carriers');
  const [showProviderDirectory, setShowProviderDirectory] = useState(false);
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
    const shouldLoadApiKey = activeSubtab === 'sdk' || orderSource === 'shopify' || orderSource === 'website';
    if (!shouldLoadApiKey) {
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
  }, [activeSubtab, orderSource, merchantId]);

  const connectedByProvider = useMemo(() => {
    const map = new Map<string, ProviderSummary>();
    for (const connection of connections) map.set(connection.provider, connection);
    return map;
  }, [connections]);

  const connectedProviders = useMemo(
    () => PROVIDERS.filter((provider) => connectedByProvider.has(provider.id)),
    [connectedByProvider],
  );
  const initialLoading = loadingConnections && connections.length === 0;
  const availableProviders = useMemo(
    () => PROVIDERS.filter((provider) => !connectedByProvider.has(provider.id)),
    [connectedByProvider],
  );
  const baseUrl = siteUrl.replace(/\/$/, '');
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

  const openProviderSettings = (providerId: ProviderId) => {
    setActiveProvider(providerId);
    setShowProviderDirectory(false);
  };

  const closeProviderSettings = async () => {
    setActiveProvider(null);
    await refreshConnections();
  };

  const renderProviderPanel = (providerId: ProviderId) => {
    switch (providerId) {
      case 'yalidine': return <YalidineConnectionPanel />;
      case 'ecotrack': return <EcoTrackConnectionPanel />;
      case 'zrexpress': return <ZRExpressConnectionPanel />;
      case 'procolis': return <ProcolisConnectionPanel />;
      case 'maystro': return <MaystroConnectionPanel />;
      case 'zimou': return <ZimouConnectionPanel />;
      case 'elogistia': return <ElogistiaConnectionPanel />;
      case 'ecom_v2': return <EcomV2ConnectionPanel />;
      default: return null;
    }
  };

  const renderConnectedProvider = (provider: (typeof PROVIDERS)[number]) => {
    const connection = connectedByProvider.get(provider.id);
    const hasError = Boolean(connection?.last_error);
    const lastActivity = connection?.last_webhook_processed_at
      || connection?.last_webhook_received_at
      || connection?.last_success_at
      || connection?.last_sync_at;
    const syncLabel = hasError
      ? 'يتطلب مراجعة'
      : connection?.sync_enabled === false
        ? 'التحديثات متوقفة'
        : 'متصل';

    return (
      <div
        key={provider.id}
        className="dz-connected-provider"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          padding: '16px 0',
          borderBottom: '1px solid var(--border-soft, #e5e8e2)',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--ink-main)', fontSize: 15 }}>{provider.name}</strong>
            <span style={{ color: hasError ? '#a12e27' : connection?.sync_enabled === false ? '#9a6b1f' : '#34734a', fontSize: 12, fontWeight: 750 }}>
              {syncLabel}
            </span>
          </div>
          <span style={{ display: 'block', marginTop: 4, color: 'var(--ink-muted)', fontSize: 12 }}>
            {lastActivity ? 'آخر نشاط: ' + dateLabel(lastActivity) : 'تاريخ الربط: ' + dateLabel(connection?.connected_at)}
            {connection?.last_error ? ' · ' + connection.last_error : ''}
          </span>
        </div>
        <button type="button" style={panelButtonStyle} onClick={() => openProviderSettings(provider.id)}>
          إدارة الاتصال
        </button>
      </div>
    );
  };

  const renderAvailableProvider = (provider: (typeof PROVIDERS)[number]) => (
    <article
      key={provider.id}
      className="dz-provider-card"
      style={{
        minWidth: 0,
        padding: 16,
        border: '1px solid var(--border-soft, #dfe4dc)',
        background: 'var(--bg-surface, #fff)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
        <strong style={{ color: 'var(--ink-main)', fontSize: 15 }}>{provider.name}</strong>
        <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 700 }}>{provider.method}</span>
      </div>
      <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.75, minHeight: 42 }}>
        {provider.description}
      </p>
      <button
        type="button"
        style={{ ...primaryButtonStyle, marginTop: 'auto', width: '100%' }}
        onClick={() => openProviderSettings(provider.id)}
      >
        إعداد وربط الشركة
      </button>
    </article>
  );


  return (
    <div className="dz-carrier-manager" style={{ display: 'grid', gap: 0, width: '100%', maxWidth: 1180, paddingBottom: 50 }}>
      <nav className="dz-integration-tabs" aria-label="أقسام التكاملات" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-soft, #dfe4dc)', marginBottom: 26, overflowX: 'auto' }}>
        <button
          type="button"
          className="dz-integration-tab"
          aria-pressed={activeSubtab === 'carriers'}
          onClick={() => setActiveSubtab('carriers')}
          style={{
            ...panelButtonStyle,
            border: 0,
            borderBottom: activeSubtab === 'carriers' ? '3px solid var(--brand-primary, #263b30)' : '3px solid transparent',
            background: 'transparent',
            color: activeSubtab === 'carriers' ? 'var(--ink-main)' : 'var(--ink-muted)',
            padding: '12px 18px',
            whiteSpace: 'nowrap',
          }}
        >
          شركات التوصيل <span style={{ marginInlineStart: 7, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{connectedProviders.length}</span>
        </button>
        <button
          type="button"
          className="dz-integration-tab"
          aria-pressed={activeSubtab === 'order_source'}
          onClick={() => setActiveSubtab('order_source')}
          style={{
            ...panelButtonStyle,
            border: 0,
            borderBottom: activeSubtab === 'order_source' ? '3px solid var(--brand-primary, #263b30)' : '3px solid transparent',
            background: 'transparent',
            color: activeSubtab === 'order_source' ? 'var(--ink-main)' : 'var(--ink-muted)',
            padding: '12px 18px',
            whiteSpace: 'nowrap',
          }}
        >
          مصدر الطلبات
        </button>
        <button
          type="button"
          className="dz-integration-tab"
          aria-pressed={activeSubtab === 'sdk'}
          onClick={() => setActiveSubtab('sdk')}
          style={{
            ...panelButtonStyle,
            border: 0,
            borderBottom: activeSubtab === 'sdk' ? '3px solid var(--brand-primary, #263b30)' : '3px solid transparent',
            background: 'transparent',
            color: activeSubtab === 'sdk' ? 'var(--ink-main)' : 'var(--ink-muted)',
            padding: '12px 18px',
            whiteSpace: 'nowrap',
          }}
        >
          SDK وواجهة API
        </button>
      </nav>

      {activeSubtab === 'order_source' && (
              <section className="dz-order-source" aria-labelledby="dz-order-source-title">
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
      )}

      {activeSubtab === 'sdk' && (
        <SdkIntegrationGuide
          siteUrl={siteUrl}
          merchantId={merchantId}
          apiKey={apiKey}
          loading={apiKeyLoading}
          error={apiKeyError}
        />
      )}

      {activeSubtab === 'carriers' && (
        <section aria-labelledby="dz-carrier-list-title" style={{ display: 'grid', gap: 28 }}>
          <header className="dz-carrier-overview" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '2px solid var(--ink-main, #263b30)' }}>
            <div>
              <span style={{ display: 'block', color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>إدارة شركات التوصيل</span>
              <h2 id="dz-carrier-list-title" style={{ margin: '6px 0', color: 'var(--ink-main)', fontSize: 22, fontWeight: 850 }}>اتصالات شركات التوصيل</h2>
              <p style={{ margin: 0, maxWidth: 620, color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.8 }}>
                اربط كل شركة تستخدمها بشكل مستقل. يمكنك الاحتفاظ بعدة اتصالات وإدارة بيانات كل شركة دون التأثير في البقية.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--ink-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                <strong style={{ color: 'var(--ink-main)', fontSize: 23, fontVariantNumeric: 'tabular-nums', marginInlineEnd: 5 }}>{connectedProviders.length}</strong>
                من {PROVIDERS.length} شركات مرتبطة
              </div>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => { setShowProviderDirectory((current) => !current); setActiveProvider(null); }}
                aria-expanded={showProviderDirectory}
                aria-controls="dz-provider-directory"
              >
                {showProviderDirectory ? 'إغلاق قائمة الشركات' : '+ إضافة شركة توصيل'}
              </button>
            </div>
          </header>

          {connectionError && <p role="alert" style={{ margin: 0, color: '#a12e27', fontSize: 13 }}>{connectionError}</p>}

          <section className="dz-integration-section" aria-labelledby="dz-connected-carriers-title">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
              <div>
                <h3 id="dz-connected-carriers-title" style={{ margin: 0, color: 'var(--ink-main)', fontSize: 17, fontWeight: 850 }}>الشركات المرتبطة</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--ink-muted)', fontSize: 12 }}>إدارة الاتصالات الحالية وحالة آخر مزامنة لكل شركة.</p>
              </div>
              <button type="button" style={panelButtonStyle} onClick={() => void refreshConnections()} disabled={refreshing}>
                {refreshing ? 'جارٍ التحديث...' : 'تحديث الحالة'}
              </button>
            </div>

            {loadingConnections ? (
              <p style={{ margin: 0, padding: '20px 0', color: 'var(--ink-muted)', fontSize: 13 }}>جارٍ تحميل الاتصالات...</p>
            ) : connectedProviders.length === 0 ? (
              <div style={{ padding: '22px 0', borderBlock: '1px solid var(--border-soft, #e5e8e2)' }}>
                <strong style={{ display: 'block', color: 'var(--ink-main)', fontSize: 14 }}>لم تربط أي شركة توصيل بعد</strong>
                <p style={{ margin: '5px 0 0', color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>
                  ابدأ بإضافة شركة، ثم ارجع إلى هذه القائمة لإدارة كل اتصالاتك من مكان واحد.
                </p>
              </div>
            ) : (
              <div className="dz-connected-list" style={{ borderTop: '1px solid var(--border-soft, #e5e8e2)' }}>
                {connectedProviders.map(renderConnectedProvider)}
              </div>
            )}
          </section>

          {showProviderDirectory && (
            <section id="dz-provider-directory" className="dz-provider-directory" aria-labelledby="dz-provider-directory-title" style={{ borderTop: '2px solid var(--ink-main, #263b30)', paddingTop: 22 }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>دليل الشركات</span>
                <h3 id="dz-provider-directory-title" style={{ margin: '5px 0', color: 'var(--ink-main)', fontSize: 18, fontWeight: 850 }}>اختر شركة لإضافتها</h3>
                <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>
                  الشركات المرتبطة لن تظهر هنا. إضافة شركة جديدة لا تستبدل أي اتصال موجود.
                </p>
              </div>
              {initialLoading ? (
                <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>جارٍ تحميل الشركات المتاحة...</p>
              ) : availableProviders.length === 0 ? (
                <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>جميع الشركات المدعومة مرتبطة بحسابك بالفعل.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 245px), 1fr))', gap: 10 }}>
                  {availableProviders.map(renderAvailableProvider)}
                </div>
              )}
            </section>
          )}

          {activeProvider && (
            <section className="dz-provider-editor" aria-labelledby="dz-provider-setup-title" style={{ borderTop: '2px solid var(--ink-main, #263b30)', paddingTop: 22 }}>
              <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800 }}>إعداد اتصال مستقل</span>
                  <h3 id="dz-provider-setup-title" style={{ margin: '5px 0 0', color: 'var(--ink-main)', fontSize: 19, fontWeight: 850 }}>
                    {PROVIDERS.find((provider) => provider.id === activeProvider)?.name}
                  </h3>
                </div>
                <button type="button" style={panelButtonStyle} onClick={() => void closeProviderSettings()}>
                  إغلاق الإعدادات وتحديث القائمة
                </button>
              </header>
              {renderProviderPanel(activeProvider)}
            </section>
          )}
        </section>
      )}

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

        .dz-carrier-manager .dz-integration-tabs {
          display: flex !important;
          width: fit-content;
          max-width: 100%;
          gap: 4px !important;
          padding: 4px !important;
          margin: 0 0 20px !important;
          border: 0 !important;
          border-bottom: 0 !important;
          background: var(--bg-base, #f2f5f0) !important;
          border-radius: 4px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .dz-carrier-manager .dz-integration-tabs::-webkit-scrollbar { display: none; }
        .dz-carrier-manager .dz-integration-tab {
          flex: 0 0 auto;
          min-height: 40px;
          padding: 10px 15px !important;
          border: 0 !important;
          border-bottom: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: var(--ink-muted) !important;
          font-size: 13px;
          font-weight: 750;
          transition: background-color 150ms ease, color 150ms ease;
        }
        .dz-carrier-manager .dz-integration-tab[aria-pressed="true"] {
          background: var(--brand-primary, #263b30) !important;
          color: #fff !important;
        }
        .dz-carrier-manager .dz-integration-tab:not([aria-pressed="true"]):hover {
          background: var(--bg-surface, #fff) !important;
          color: var(--ink-main) !important;
        }
        .dz-carrier-manager .dz-carrier-overview {
          padding: 18px !important;
          border: 0 !important;
          background: var(--bg-base, #f2f5f0) !important;
          border-radius: 4px;
        }
        .dz-carrier-manager .dz-integration-section,
        .dz-carrier-manager .dz-order-source,
        .dz-carrier-manager .dz-provider-directory,
        .dz-carrier-manager .dz-provider-editor {
          padding: 18px !important;
          border: 0 !important;
          background: var(--bg-base, #f2f5f0);
          border-radius: 4px;
        }
        .dz-carrier-manager .dz-integration-section {
          display: grid;
          gap: 12px;
        }
        .dz-carrier-manager .dz-connected-list {
          display: grid;
          gap: 7px;
          border: 0 !important;
          background: transparent;
        }
        .dz-carrier-manager .dz-connected-provider {
          margin: 0;
          padding: 13px 14px !important;
          border: 0 !important;
          border-radius: 3px;
          background: var(--bg-surface, #fff);
        }
        .dz-carrier-manager .dz-provider-card {
          padding: 15px !important;
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-surface, #fff) !important;
          box-shadow: 0 1px 2px rgb(20 35 24 / 5%);
        }
        .dz-carrier-manager .dz-order-source button[aria-pressed="true"] {
          background: var(--bg-surface, #fff) !important;
          box-shadow: inset 3px 0 0 var(--brand-primary, #263b30);
        }
        .dz-carrier-manager .dz-order-source [style*="borderBlock"],
        .dz-carrier-manager .dz-order-source [style*="borderTop"] {
          border: 0 !important;
        }
        .dz-carrier-manager .dz-order-source [style*="padding: 15"],
        .dz-carrier-manager .dz-order-source [style*="padding: 12"] {
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-surface, #fff);
        }
        .dz-carrier-manager .dz-int-guided-panel,
        .dz-carrier-manager .dz-int-guided-card,
        .dz-carrier-manager .dz-int-guided-result,
        .dz-carrier-manager .dz-int-guided-panel-title,
        .dz-carrier-manager .dz-int-guided-copy,
        .dz-carrier-manager .dz-int-guided-meta,
        .dz-carrier-manager .dz-int-guided-note {
          border-radius: 4px !important;
          border-color: transparent !important;
        }
        .dz-carrier-manager .dz-int-guided-panel {
          background: var(--bg-base, #f2f5f0) !important;
        }
        .dz-carrier-manager button,
        .dz-carrier-manager input {
          border-radius: 0 !important;
        }
      `}</style>
    </div>
  );
}
