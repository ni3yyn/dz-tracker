'use client';

import React, { useMemo, useState } from 'react';

type Props = {
  siteUrl: string;
  merchantId: string;
  apiKey: string;
  loading: boolean;
  error: string;
};

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
type ExampleTab = 'node' | 'rest' | 'react' | 'browser' | 'html' | 'ai';

const packageCommands: Record<PackageManager, string> = {
  npm: 'npm install dz-tracking-sdk',
  pnpm: 'pnpm add dz-tracking-sdk',
  yarn: 'yarn add dz-tracking-sdk',
  bun: 'bun add dz-tracking-sdk',
};

const codeTabs: Array<{ id: ExampleTab; label: string }> = [
  { id: 'node', label: 'Node.js / Server' },
  { id: 'rest', label: 'REST API' },
  { id: 'react', label: 'React Hook' },
  { id: 'browser', label: 'Browser SDK' },
  { id: 'html', label: 'HTML form' },
  { id: 'ai', label: 'AI Agent Prompt' },
];

const baseButton: React.CSSProperties = {
  border: 0,
  borderRadius: 0,
  background: 'var(--bg-base, #f2f5f0)',
  color: 'var(--ink-main, #263b30)',
  padding: '9px 12px',
  minHeight: 38,
  fontSize: 12,
  fontWeight: 750,
  cursor: 'pointer',
};

const codeStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  overflowX: 'auto',
  padding: 16,
  border: 0,
  borderRadius: 3,
  background: 'var(--bg-surface, #fff)',
  color: 'var(--ink-main, #263b30)',
  fontSize: 12,
  lineHeight: 1.8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  direction: 'ltr',
  textAlign: 'left',
  whiteSpace: 'pre',
};

const apiPayload = [
  '{',
  '  "order_id": "STORE-ORDER-1042",',
  '  "customer_name": "Customer Name",',
  '  "customer_phone": "0555123456",',
  '  "status": "order_placed",',
  '  "description": "Order received",',
  '  "product_name": "Product title",',
  '  "product_image": "https://store.example/product.jpg",',
  '  "carrier_name": "Yalidine Express",',
  '  "carrier_tracking_number": "YAL-123456",',
  '  "telegram_consent": false',
  '}',
].join('\n');

function CodePanel({
  title,
  description,
  code,
  copied,
  onCopy,
}: {
  title: string;
  description?: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section style={{ display: 'grid', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: 'var(--ink-main)', fontSize: 14 }}>{title}</strong>
          {description && <p style={{ margin: '3px 0 0', color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.7 }}>{description}</p>}
        </div>
        <button type="button" style={baseButton} onClick={onCopy}>{copied ? 'تم النسخ' : 'نسخ الكود'}</button>
      </div>
      <pre style={codeStyle}>{code}</pre>
    </section>
  );
}

function InfoSection({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dz-sdk-info-section" style={{ display: 'grid', gap: 12, padding: '20px 0', borderTop: '1px solid var(--border-soft, #dfe4dc)' }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--ink-main)', fontSize: 17, fontWeight: 850 }}>{title}</h3>
        {intro && <p style={{ margin: '5px 0 0', color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.8 }}>{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export function SdkIntegrationGuide({ siteUrl, merchantId, apiKey, loading, error }: Props) {
  const [packageManager, setPackageManager] = useState<PackageManager>('npm');
  const [exampleTab, setExampleTab] = useState<ExampleTab>('node');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState('');
  const baseUrl = siteUrl.replace(/\/$/, '');
  const directEndpoint = baseUrl + '/api/webhooks';
  const apiEndpoint = baseUrl + '/api/webhooks';
  const shopifyEndpoint = baseUrl + '/api/webhooks/shopify';

  const agentPrompt = useMemo(() => [
    'Read ' + baseUrl + '/skill.md completely before changing code.',
    'Inspect the repository package manager, order-save flow, installed dz-tracking-sdk version, package.json exports, and .d.ts declarations before choosing an API.',
    'Run npm view dz-tracking-sdk version, install using the existing package manager, then verify the actual installed exports.',
    'The repository source declares SDK 2.0.0, while the public npm release may be behind. Do not invent a v2 import or method if installed declarations do not expose it; use the documented POST /api/webhooks REST contract instead.',
    'Register tracking only after the store has successfully saved its order. Preserve payment, COD, inventory, messaging, and the original checkout.',
    'Keep the merchant key in a private server-only variable named DZ_TRACKER_API_KEY. Never put it in NEXT_PUBLIC_*, browser source, HTML, prompts, chat, logs, or source control.',
    'Use the existing stable external order ID. Never generate a new ID for each retry or status update.',
    'Only return or redirect to a tracking URL when the API confirms success and a real tracking UUID and URL.',
    'Set telegramConsent true only when the customer explicitly consented in the actual checkout.',
    'Inspect the chosen courier adapter and verified provider payload instead of guessing webhook fields.',
    'TajerTrack base URL: ' + baseUrl,
  ].join('\n'), [baseUrl]);

  const examples = useMemo<Record<ExampleTab, string>>(() => ({
    node: [
      "import { DZTrackerClient } from 'dz-tracking-sdk/core';",
      '',
      'const tracker = new DZTrackerClient({',
      '  apiKey: process.env.DZ_TRACKER_API_KEY!,',
      "  baseUrl: process.env.DZ_TRACKER_BASE_URL || '" + baseUrl + "',",
      '});',
      '',
      '// Call this only after your store has saved its own order.',
      'export async function registerSavedOrder(savedOrder) {',
      '  const result = await tracker.trackOrder({',
      '    orderId: String(savedOrder.id),',
      '    name: savedOrder.customerName || undefined,',
      '    phone: savedOrder.customerPhone || undefined,',
      '    productName: savedOrder.productName || undefined,',
      "    status: 'order_placed',",
      '  });',
      '',
      '  if (!result.success || !result.trackingUuid || !result.trackingUrl) {',
      '    // Keep the store order intact; retry later with the SAME order ID.',
      '    return { trackingCreated: false, trackingUrl: null, error: result.error };',
      '  }',
      '  return { trackingCreated: true, trackingUrl: result.trackingUrl };',
      '}',
      '',
      'await tracker.updateStatus({',
      '  orderId: String(savedOrder.id),',
      "  status: 'out_for_delivery',",
      "  description: 'Parcel handed to the delivery agent',",
      '});',
      '',
      'const order = await tracker.getOrder(result.trackingUuid);',
    ].join('\n'),
    rest: [
      "const response = await fetch('" + apiEndpoint + "', {",
      "  method: 'POST',",
      '  headers: {',
      "    'Content-Type': 'application/json',",
      "    'x-api-key': process.env.DZ_TRACKER_API_KEY,",
      '  },',
      '  body: JSON.stringify({',
      '    order_id: String(savedOrder.id),',
      '    customer_name: savedOrder.customerName ?? null,',
      '    customer_phone: savedOrder.customerPhone ?? null,',
      "    status: 'order_placed',",
      '    product_name: savedOrder.productName ?? null,',
      '  }),',
      '});',
      '',
      'const payload = await response.json();',
      'if (!response.ok || payload.success !== true || !payload.tracking_uuid || !payload.tracking_url) {',
      "  throw new Error(payload.message || payload.error || 'TajerTrack did not confirm registration');",
      '}',
      'return payload.tracking_url;',
    ].join('\n'),
    react: [
      "'use client';",
      '',
      "import { useTracker } from 'dz-tracking-sdk';",
      '',
      '// Browser keys are visible to every visitor. Prefer server-side registration.',
      'export function TrackSavedOrder({ orderId, name, phone }) {',
      '  const { track, isLoading, error } = useTracker({',
      '    apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY,',
      '    baseUrl: process.env.NEXT_PUBLIC_DZ_TRACKER_BASE_URL,',
      '  });',
      '',
      '  async function register() {',
      "    const result = await track({ orderId, name, phone, status: 'order_placed' });",
      '    if (result.success && result.trackingUrl) {',
      '      window.location.assign(result.trackingUrl);',
      '    } else {',
      "      console.error(result.error || error?.message || 'Tracking registration failed');",
      '    }',
      '  }',
      '',
      '  return <button type="button" disabled={isLoading} onClick={register}>Open tracking</button>;',
      '}',
    ].join('\n'),
    browser: [
      "import { initTracker } from 'dz-tracking-sdk/core';",
      '',
      'initTracker({',
      "  apiKey: 'PUBLICLY_EXPOSED_KEY_ONLY_IF_ACCEPTABLE',",
      "  baseUrl: '" + baseUrl + "',",
      '});',
      '',
      '// The current source supports form[data-dz-checkout],',
      '// form[data-dz-form], and form[data-dz-order].',
    ].join('\n'),
    html: [
      '<!-- Requires the SDK to be initialized from a bundled client entry. -->',
      '<!-- This does not replace the store form action or backend validation. -->',
      '<form data-dz-checkout data-dz-redirect="none">',
      '  <input name="order_id" value="STORE-ORDER-1042" />',
      '  <input name="name" value="Customer Name" />',
      '  <input name="phone" value="0555123456" />',
      '  <input name="product_name" value="Product title" />',
      '  <button type="submit">Submit existing checkout</button>',
      '</form>',
    ].join('\n'),
    ai: agentPrompt,
  }), [apiEndpoint, baseUrl, agentPrompt]);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  };

  return (
    <div className="dz-sdk-guide" style={{ display: 'grid', gap: 0, width: '100%', maxWidth: 1180, paddingBottom: 40 }}>
      <header className="dz-sdk-overview" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', paddingBottom: 20, borderBottom: '2px solid var(--ink-main, #263b30)' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 850, letterSpacing: '.08em' }}>DEVELOPER INTEGRATION</span>
          <h2 style={{ margin: '6px 0', color: 'var(--ink-main)', fontSize: 23, fontWeight: 900 }}>SDK وواجهة API</h2>
          <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13, lineHeight: 1.9 }}>
            اربط نظام متجرك بتاجر تراك بعد حفظ الطلب. ستجد هنا التثبيت، مفاتيح الربط، أمثلة جاهزة، مرجع الطلبات، وإعدادات الأنظمة المخصصة.
          </p>
        </div>
        <a href={baseUrl + '/skill.md'} target="_blank" rel="noreferrer" style={{ ...baseButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          فتح دليل المطور الكامل ↗
        </a>
      </header>

      <InfoSection title="1. ابدأ بالتثبيت" intro="حزمة dz-tracking-sdk مخصّصة لتسجيل الطلبات وإرجاع رابط التتبع. استخدم مدير الحزم الموجود أصلاً في مشروعك.">
        <div className="dz-sdk-package-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(['npm', 'pnpm', 'yarn', 'bun'] as PackageManager[]).map((manager) => (
            <button
              key={manager}
              type="button"
              aria-pressed={packageManager === manager}
              onClick={() => setPackageManager(manager)}
              style={{
                ...baseButton,
                background: packageManager === manager ? 'var(--brand-primary, #263b30)' : 'var(--bg-surface, #fff)',
                color: packageManager === manager ? '#fff' : 'var(--ink-main)',
                borderColor: packageManager === manager ? 'var(--brand-primary, #263b30)' : 'var(--border-soft, #dfe4dc)',
              }}
            >
              {manager}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: 12, border: '1px solid var(--border-soft, #dfe4dc)', background: 'var(--bg-base, #f5f7f3)' }}>
          <code dir="ltr" style={{ color: 'var(--ink-main)', fontSize: 13 }}>{packageCommands[packageManager]}</code>
          <button type="button" style={baseButton} onClick={() => void copy(packageCommands[packageManager], 'install')}>{copied === 'install' ? 'تم النسخ' : 'نسخ أمر التثبيت'}</button>
        </div>
        <div style={{ display: 'grid', gap: 8, padding: 14, borderInlineStart: '3px solid #b58a42', background: 'var(--bg-base, #f5f7f3)' }}>
          <strong style={{ color: 'var(--ink-main)', fontSize: 13 }}>تحقق من النسخة قبل كتابة الكود</strong>
          <code dir="ltr" style={{ fontSize: 12 }}>npm view dz-tracking-sdk version</code>
          <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>
            مصدر المستودع يعرّف الإصدار 2.0.0، وقد يتأخر الإصدار المنشور على npm عن المصدر. تحقّق من النسخة وملفات .d.ts وexports داخل node_modules؛ عند غياب واجهات v2 استخدم REST أدناه، ولا تخمّن مسارات الاستيراد.
          </p>
          <a href="https://www.npmjs.com/package/dz-tracking-sdk" target="_blank" rel="noreferrer" style={{ color: 'var(--ink-main)', fontSize: 12, fontWeight: 800, textDecoration: 'underline' }}>dz-tracking-sdk على npm ↗</a>
        </div>
      </InfoSection>

      <InfoSection title="2. بيانات حسابك" intro="هذه البيانات تربط خادم متجرك بحساب تاجر تراك. استخدم المفتاح في الخادم فقط، ولا تضفه إلى كود الواجهة الأمامية.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
          <div style={{ display: 'grid', gap: 8, padding: 14, border: '1px solid var(--border-soft, #dfe4dc)', minWidth: 0 }}>
            <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800 }}>مفتاح API</span>
            {loading ? (
              <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>جارٍ تحميل بيانات الربط...</span>
            ) : error ? (
              <span role="alert" style={{ color: '#a12e27', fontSize: 12 }}>{error}</span>
            ) : (
              <>
                <code dir="ltr" style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{keyRevealed ? apiKey || 'غير متاح' : apiKey ? apiKey.slice(0, 7) + '••••••••••••••••' : 'غير متاح'}</code>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button" style={baseButton} onClick={() => setKeyRevealed((value) => !value)} disabled={!apiKey}>{keyRevealed ? 'إخفاء المفتاح' : 'إظهار المفتاح'}</button>
                  <button type="button" style={baseButton} onClick={() => void copy(apiKey, 'api-key')} disabled={!apiKey}>{copied === 'api-key' ? 'تم النسخ' : 'نسخ المفتاح'}</button>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'grid', gap: 8, padding: 14, border: '1px solid var(--border-soft, #dfe4dc)', minWidth: 0 }}>
            <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 800 }}>معرّف المتجر</span>
            <code dir="ltr" style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{merchantId}</code>
            <button type="button" style={{ ...baseButton, justifySelf: 'start' }} onClick={() => void copy(merchantId, 'merchant-id')}>{copied === 'merchant-id' ? 'تم النسخ' : 'نسخ المعرّف'}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6, padding: 13, background: 'var(--bg-base, #f5f7f3)' }}>
          <strong style={{ fontSize: 12, color: 'var(--ink-main)' }}>متغيرات البيئة الموصى بها</strong>
          <pre style={{ ...codeStyle, padding: 11 }}>DZ_TRACKER_API_KEY=your_merchant_api_key{'\n'}DZ_TRACKER_BASE_URL={baseUrl}</pre>
          <span style={{ color: 'var(--ink-muted)', fontSize: 11, lineHeight: 1.7 }}>ضع المفتاح في إعدادات الخادم أو ملف .env.local غير المرفوع إلى Git. لا تستخدم NEXT_PUBLIC_DZ_TRACKER_API_KEY للمفتاح السري.</span>
        </div>
      </InfoSection>

      <InfoSection title="3. أمثلة التكامل" intro="ابدأ بالتسجيل من الخادم بعد حفظ الطلب في قاعدة بيانات متجرك. غيّر المثال ليتوافق مع بنية الطلب الفعلية لديك.">
        <div className="dz-sdk-example-tabs" style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-soft, #dfe4dc)', overflowX: 'auto' }}>
          {codeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={exampleTab === tab.id}
              onClick={() => setExampleTab(tab.id)}
              style={{
                ...baseButton,
                border: 0,
                borderBottom: exampleTab === tab.id ? '3px solid var(--brand-primary, #263b30)' : '3px solid transparent',
                background: 'transparent',
                color: exampleTab === tab.id ? 'var(--ink-main)' : 'var(--ink-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CodePanel
          title={codeTabs.find((tab) => tab.id === exampleTab)?.label || 'Code'}
          description={exampleTab === 'node' ? 'الطريقة الموصى بها: المفتاح يبقى في الخادم.' : exampleTab === 'rest' ? 'خيار مباشر يعمل دون الاعتماد على نسخة SDK معينة.' : exampleTab === 'react' ? 'متاح عند دعم إصدار الحزمة للمدخل React؛ المفتاح هنا مكشوف للمتصفح.' : exampleTab === 'browser' ? 'يحتاج إلى حزمة browser bundle مستوردة في تطبيق العميل؛ لا يوجد CDN global جاهز.' : 'خصائص التقاط النموذج بعد تهيئة SDK من مدخل JavaScript bundle.'}
          code={examples[exampleTab]}
          copied={copied === 'example-' + exampleTab}
          onCopy={() => void copy(examples[exampleTab], 'example-' + exampleTab)}
        />
        {exampleTab === 'react' || exampleTab === 'browser' ? (
          <p style={{ margin: 0, padding: 12, background: '#fff5e6', color: '#795520', fontSize: 12, lineHeight: 1.8 }}>
            تنبيه أمني: أي API key يستخدم داخل المتصفح يمكن استخراجه من زوار الموقع. لا تستخدم المفتاح السري هنا؛ فضّل تكامل الخادم باستخدام DZ_TRACKER_API_KEY.
          </p>
        ) : null}
      </InfoSection>

      <InfoSection title="4. مرجع SDK v2" intro="هذه الواجهات تخص مصدر المستودع v2. تحقّق من النسخة المنشورة وملفات .d.ts قبل استخدامها في مشروعك؛ قد لا يحتوي npm حالياً على جميع exports المصدر.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 8 }}>
          {[
            ['DZTrackerClient', 'عميل الخادم الأساسي من dz-tracking-sdk/core'],
            ['trackOrder', 'تسجيل طلب محفوظ وإرجاع نتيجة التتبع'],
            ['updateStatus', 'تحديث الطلب نفسه باستخدام orderId الأصلي'],
            ['getOrder', 'قراءة طلب التتبع بواسطة tracking UUID'],
            ['initTracker', 'تهيئة عميل المتصفح من JavaScript bundle'],
            ['setupAutoCapture', 'التقاط نموذج الدفع المهيأ بخصائص data-dz'],
            ['OfflineQueue', 'طابور متصفح best-effort فقط'],
            ['normalizeAlgerianPhone', 'تطبيع تنسيق رقم هاتف جزائري؛ ليس بديلاً عن تحقق المتجر'],
          ].map(([name, description]) => (
            <div key={name} style={{ display: 'grid', gap: 5, padding: 12, border: '1px solid var(--border-soft, #dfe4dc)' }}>
              <code dir="ltr" style={{ color: 'var(--ink-main)', fontSize: 12 }}>{name}</code>
              <span style={{ color: 'var(--ink-muted)', fontSize: 11, lineHeight: 1.7 }}>{description}</span>
            </div>
          ))}
        </div>
        <CodePanel
          title="استيراد وقراءة الطلب"
          description="مدخل core لا يستورد React؛ مناسب لخوادم Node وServer Actions."
          code={[
            "import { DZTrackerClient } from 'dz-tracking-sdk/core';",
            '',
            'const tracker = new DZTrackerClient({',
            '  apiKey: process.env.DZ_TRACKER_API_KEY!,',
            '  baseUrl: process.env.DZ_TRACKER_BASE_URL,',
            '});',
            '',
            "const result = await tracker.trackOrder({ orderId: 'STORE-ORDER-1042', status: 'order_placed' });",
            "await tracker.updateStatus({ orderId: 'STORE-ORDER-1042', status: 'out_for_delivery' });",
            'const order = await tracker.getOrder(result.trackingUuid);',
          ].join('\n')}
          copied={copied === 'sdk-methods'}
          onCopy={() => void copy([
            "import { DZTrackerClient } from 'dz-tracking-sdk/core';",
            '',
            'const tracker = new DZTrackerClient({',
            '  apiKey: process.env.DZ_TRACKER_API_KEY!,',
            '  baseUrl: process.env.DZ_TRACKER_BASE_URL,',
            '});',
            '',
            "const result = await tracker.trackOrder({ orderId: 'STORE-ORDER-1042', status: 'order_placed' });",
            "await tracker.updateStatus({ orderId: 'STORE-ORDER-1042', status: 'out_for_delivery' });",
            'const order = await tracker.getOrder(result.trackingUuid);',
          ].join('\n'), 'sdk-methods')}
        />
        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>
          النتيجة غير الناجحة لا تحتوي على tracking UUID أو tracking URL صالحين. لا تنشئ رابطاً مؤقتاً ولا تعِد توجيه العميل حتى تكون success === true ويوجد رابط حقيقي. صفحة العميل العامة هي /t/{'{tracking_uuid}'}، وقراءة API تكون عبر /api/track/{'{tracking_uuid}'}.
        </p>
      </InfoSection>

      <InfoSection title="5. عقد REST API" intro="استخدم هذا المسار إذا كانت نسخة npm المنشورة أقدم من واجهات المصدر، أو إذا كان تنفيذ HTTP في خادمك أبسط.">
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong style={{ padding: '5px 9px', background: 'var(--brand-primary, #263b30)', color: '#fff', fontSize: 11 }}>POST</strong>
            <code dir="ltr" style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{apiEndpoint}</code>
            <button type="button" style={baseButton} onClick={() => void copy(apiEndpoint, 'endpoint')}>{copied === 'endpoint' ? 'تم النسخ' : 'نسخ الرابط'}</button>
          </div>
          <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12 }}>Headers: Content-Type: application/json · x-api-key: DZ_TRACKER_API_KEY</p>
          <CodePanel title="البيانات المدعومة" code={apiPayload} copied={copied === 'payload'} onCopy={() => void copy(apiPayload, 'payload')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
          {[
            ['400', 'طلب غير صالح أو بيانات ناقصة'],
            ['401', 'مفتاح API غير موجود أو غير صالح'],
            ['402', 'حد الباقة أو الاشتراك منتهي'],
            ['403', 'الحساب موقوف'],
            ['500', 'خطأ داخلي في الخادم'],
          ].map(([code, label]) => (
            <div key={code} style={{ padding: 10, border: '1px solid var(--border-soft, #dfe4dc)', display: 'flex', gap: 9, alignItems: 'center' }}>
              <strong style={{ fontSize: 13, color: 'var(--ink-main)' }}>{code}</strong>
              <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 8, padding: 13, borderInlineStart: '3px solid #477a50', background: 'var(--bg-base, #f5f7f3)' }}>
          <strong style={{ color: 'var(--ink-main)', fontSize: 12 }}>تحقق قراءة المفتاح دون إنشاء طلب</strong>
          <span style={{ color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>GET /api/webhooks مع ترويسة x-api-key يعيد valid: true للمفتاح الصحيح. لا ينشئ طلباً ولا يستهلك حد الباقة ولا يشغّل إشعارات العميل. مخصص لفحص بيانات الاعتماد من CLI.</span>
          <span style={{ color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>استجابة POST الناجحة تتضمن success وisNewOrder وdeduplicated وorder وstatus وtracking_uuid وtracking_url. لا تعرض رابط تتبع قبل تأكيد success ووجود UUID ورابط حقيقي.</span>
        </div>
      </InfoSection>

      <InfoSection title="6. تحديث الحالة لاحقاً" intro="أرسل التحديثات على نفس نقطة REST مع نفس order_id الذي استخدمته عند تسجيل الطلب.">
        <CodePanel
          title="مثال تحديث حالة"
          code={[
            "await fetch('" + apiEndpoint + "', {",
            "  method: 'POST',",
            '  headers: {',
            "    'Content-Type': 'application/json',",
            "    'x-api-key': process.env.DZ_TRACKER_API_KEY,",
            '  },',
            '  body: JSON.stringify({',
            '    order_id: String(savedOrder.id),',
            "    status: 'out_for_delivery',",
            "    description: 'Parcel handed to the delivery agent',",
            '  }),',
            '});',
          ].join('\n')}
          copied={copied === 'status-example'}
          onCopy={() => void copy([
            "await fetch('" + apiEndpoint + "', {",
            "  method: 'POST',",
            '  headers: {',
            "    'Content-Type': 'application/json',",
            "    'x-api-key': process.env.DZ_TRACKER_API_KEY,",
            '  },',
            '  body: JSON.stringify({',
            '    order_id: String(savedOrder.id),',
            "    status: 'out_for_delivery',",
            "    description: 'Parcel handed to the delivery agent',",
            '  }),',
            '});',
          ].join('\n'), 'status-example')}
        />
        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>
          يحاول النظام مطابقة الطلب بمعرّف الطلب الخارجي ثم رقم تتبع شركة التوصيل. إذا لم يجد تطابقاً قد ينشئ طلباً جديداً؛ لذلك تحقق دائماً من المعرّف وأعد استخدامه في كل محاولة وتحديث.
        </p>
      </InfoSection>

      <InfoSection title="7. التقاط الطلب من HTML" intro="يدعم مصدر SDK الحالي التقاط النماذج التي تحمل data-dz-checkout أو data-dz-form أو data-dz-order، بعد تهيئة SDK من حزمة JavaScript مجمّعة.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'start' }}>
            <thead>
              <tr>
                {['البيانات', 'الخاصية أو أسماء الحقول', 'ملاحظات'].map((heading) => (
                  <th key={heading} style={{ padding: 10, borderBottom: '2px solid var(--ink-main)', color: 'var(--ink-main)', textAlign: 'start' }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['رقم الطلب', 'data-dz-order, order_id, orderId, orderNumber, order_number, reference, id', 'مطلوب؛ يجب أن يكون معرّف الطلب الحقيقي المحفوظ.'],
                ['اسم العميل', 'data-dz-name, customer_name, name, fullname, full_name, client, nom', 'اختياري.'],
                ['الهاتف', 'data-dz-phone, customer_phone, phone, telephone, tel, mobile', 'اختياري.'],
                ['المنتج', 'data-dz-product, product_name, product, item, produit', 'اختياري.'],
                ['الولاية', 'data-dz-wilaya, wilaya, city, ville, state', 'تُقبل في العميل لكنها غير محفوظة حالياً من الخادم.'],
                ['السعر', 'data-dz-price', 'للتوافق في العميل فقط؛ لا يُحفظ حالياً من الخادم.'],
              ].map(([field, names, note]) => (
                <tr key={field}>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--border-soft)', color: 'var(--ink-main)', fontWeight: 750 }}>{field}</td>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--border-soft)' }}><code dir="ltr" style={{ fontSize: 11 }}>{names}</code></td>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--border-soft)', color: 'var(--ink-muted)' }}>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.9 }}>
          <li>الـ observer يستمع إلى submit لكنه لا يمنع الإرسال الأصلي ولا يستبدله؛ قد يتسابق طلب التتبع مع انتقال الصفحة.</li>
          <li>يرفض التسجيل عند غياب رقم الطلب الحقيقي ويرسل dz:track:error. لا ينشئ معرفاً عشوائياً نيابة عنك.</li>
          <li>إعادة التوجيه اختيارية عبر data-dz-redirect="tracking"؛ استخدم "none" لتعطيلها.</li>
          <li>طابور عدم الاتصال في المتصفح best-effort ويخزّن الأحداث ومفتاح API في localStorage؛ لا تستخدمه مع مفتاح خادم سري.</li>
        </ul>
      </InfoSection>

      <InfoSection title="8. Shopify وأنظمة ERP وشركات التوصيل" intro="استخدم endpoint الخاص بمصدر الحدث. استقبال الطلبات وتحديث حالة الشحن عمليتان منفصلتان.">
        <div style={{ display: 'grid', gap: 0, borderTop: '1px solid var(--border-soft, #dfe4dc)' }}>
          {[
            ['طلب أو تحديث مباشر', '/api/webhooks'],
            ['Shopify order event', '/api/webhooks/shopify'],
            ['Yalidine', '/api/webhooks/yalidine'],
            ['EcoTrack', '/api/webhooks/ecotrack'],
            ['ZR Express', '/api/webhooks/zrexpress'],
            ['Procolis', '/api/webhooks/procolis'],
            ['Maystro', '/api/webhooks/maystro'],
            ['Odoo carrier normalization', '/api/webhooks/odoo'],
          ].map(([name, endpoint]) => (
            <div key={endpoint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--border-soft, #dfe4dc)' }}>
              <strong style={{ color: 'var(--ink-main)', fontSize: 12 }}>{name}</strong>
              <code dir="ltr" style={{ color: 'var(--ink-muted)', fontSize: 11 }}>{endpoint}</code>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>
          لا ترسل payload عاماً إلى نقاط شركات التوصيل. افحص محوّل الشركة والحمولة الحقيقية الموثّقة. يمكن استخدام ?key={'{merchantApiKey}'} عندما لا يستطيع المزود إرسال ترويسة مخصصة؛ اعتبر رابط webhook الكامل سراً.
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ color: 'var(--ink-main)', fontSize: 13 }}>Odoo / ERP</strong>
          <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>يمكن إعداد Automated Action أو Webhook في نظام ERP لإرسال الطلبات أو أحداث الشحن إلى نقطة الاستقبال المخصصة. حافظ على رقم الطلب الخارجي نفسه بين التسجيل والتحديثات.</p>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ color: 'var(--ink-main)', fontSize: 13 }}>Shopify</strong>
          <code dir="ltr" style={{ fontSize: 12 }}>{shopifyEndpoint}</code>
          <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.8 }}>المسار الحالي يطبّع payload الطلب، لكن توثيق المصدر ينبه إلى أن Shopify HMAC verification لم يكن مفعّلاً في المصدر الموصوف. لا تعتمد على التحقق من التوقيع حتى يُنفّذ ويُختبر.</p>
        </div>
      </InfoSection>

      <InfoSection title="9. أدوات CLI والتحقق" intro="الأوامر الموجودة في مصدر SDK الحالي تساعدك على إعداد بيئة التطوير وفحص مفتاح API.">
        <CodePanel
          title="أوامر CLI"
          code={'npx dz-tracker help\nnpx dz-tracker init\nnpx dz-tracker test\nnpx dz-tracker snippet\nnpx dz-tracker install-skill'}
          copied={copied === 'cli'}
          onCopy={() => void copy('npx dz-tracker help\nnpx dz-tracker init\nnpx dz-tracker test\nnpx dz-tracker snippet\nnpx dz-tracker install-skill', 'cli')}
        />
        <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--ink-muted)', fontSize: 12, lineHeight: 1.9 }}>
          <li><strong>init</strong> يكتب DZ_TRACKER_API_KEY وDZ_TRACKER_BASE_URL في .env.local؛ لا يحقن كوداً في الواجهة ولا يضيف مفتاح NEXT_PUBLIC.</li>
          <li><strong>test</strong> ينفذ GET /api/webhooks فقط؛ لا ينشئ طلباً تجريبياً ولا يستهلك حصة الطلبات.</li>
          <li><strong>snippet</strong> يطبع مثالاً server-side يستخدم رقم الطلب الموجود وفحص النتيجة.</li>
          <li><strong>install-skill</strong> يجلب دليل /skill.md إلى مواقع مهارات الوكلاء المحلية المدعومة.</li>
        </ul>
        <div style={{ display: 'grid', gap: 7, padding: 14, background: 'var(--bg-base, #f5f7f3)' }}>
          <strong style={{ color: 'var(--ink-main)', fontSize: 13 }}>قائمة التحقق قبل النشر</strong>
          {[
            'تأكد أن مسار الطلب الأصلي لا يزال يُنفّذ مرة واحدة فقط.',
            'سجّل التتبع بعد نجاح حفظ طلب المتجر.',
            'احتفظ بمفتاح API على الخادم ولا تسجله في logs.',
            'تحقق من نجاح API ووجود tracking_uuid وtracking_url حقيقيين.',
            'أعد استخدام order_id نفسه في إعادة المحاولة وتحديث الحالة.',
            'اختبر في حساب staging مخصص قبل تنفيذ POST حقيقي.',
          ].map((item) => <span key={item} style={{ color: 'var(--ink-muted)', fontSize: 12 }}>□ {item}</span>)}
        </div>
      </InfoSection>

      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '2px solid var(--ink-main, #263b30)', paddingTop: 16 }}>
        <div>
          <strong style={{ color: 'var(--ink-main)', fontSize: 13 }}>مرجع المطور الكامل</strong>
          <p style={{ margin: '3px 0 0', color: 'var(--ink-muted)', fontSize: 11 }}>التوثيق الحي هو المصدر المرجعي لأحدث exports والحقول ومسارات الربط.</p>
        </div>
        <a href={baseUrl + '/skill.md'} target="_blank" rel="noreferrer" style={{ ...baseButton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>فتح skill.md ↗</a>
      </footer>

      <style jsx global>{`
        .dz-sdk-guide { gap: 10px !important; }
        .dz-sdk-guide > .dz-sdk-overview {
          padding: 18px !important;
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-base, #f2f5f0);
        }
        .dz-sdk-guide > .dz-sdk-info-section {
          padding: 16px !important;
          margin: 0 !important;
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-base, #f2f5f0);
        }
        .dz-sdk-guide > footer {
          padding: 16px !important;
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-base, #f2f5f0);
        }
        .dz-sdk-guide [style*="border: 1px solid"],
        .dz-sdk-guide [style*="border: '1px solid"] {
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-surface, #fff);
        }
        .dz-sdk-guide pre {
          border: 0 !important;
          border-radius: 3px;
          background: var(--bg-surface, #fff) !important;
        }
        .dz-sdk-guide .dz-sdk-package-tabs,
        .dz-sdk-guide .dz-sdk-example-tabs {
          width: fit-content;
          max-width: 100%;
          gap: 4px !important;
          padding: 4px;
          border: 0 !important;
          border-radius: 4px;
          background: var(--bg-surface, #fff);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .dz-sdk-guide .dz-sdk-package-tabs button,
        .dz-sdk-guide .dz-sdk-example-tabs button {
          border: 0 !important;
          border-bottom: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: var(--ink-muted) !important;
          padding: 9px 12px !important;
          min-height: 36px;
          white-space: nowrap;
        }
        .dz-sdk-guide .dz-sdk-package-tabs button[aria-pressed="true"],
        .dz-sdk-guide .dz-sdk-example-tabs button[aria-pressed="true"] {
          background: var(--brand-primary, #263b30) !important;
          color: #fff !important;
        }
        .dz-sdk-guide section { min-width: 0; }
        .dz-sdk-guide button { border-radius: 0 !important; }
        .dz-sdk-guide th,
        .dz-sdk-guide td { border-color: transparent !important; }
      `}</style>
    </div>
  );
}
