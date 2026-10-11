export interface TrackerConfig {
  apiKey: string;
  baseUrl?: string;
  autoCapture?: boolean;
}

export interface TrackOrderParams {
  orderId: string;
  name?: string;
  phone?: string;
  status?: string;
}

export interface TrackOrderResult {
  success: boolean;
  trackingUuid: string;
  trackingUrl: string;
  whatsappUrl: string;
}

let globalConfig: TrackerConfig | null = null;
let listenerAttached = false;

/**
 * 🚀 تهيئة النظام مرة واحدة في التطبيق بالكامل
 */
export function initTracker(config: TrackerConfig) {
  globalConfig = {
    baseUrl: (config.baseUrl || 'http://localhost:3000').replace(/\/$/, ''),
    autoCapture: config.autoCapture !== false,
    ...config,
  };

  // تفعيل الاستماع التلقائي لعناصر data-track-status
  if (typeof window !== 'undefined' && globalConfig.autoCapture && !listenerAttached) {
    setupAutoCapture();
  }
}

function getConfig(): TrackerConfig {
  if (!globalConfig) {
    throw new Error('[dz-tracking-sdk]: You must call initTracker({ apiKey }) first in your app root.');
  }
  return globalConfig;
}

/**
 * ⚡ إنشاء طلب جديد برمجياً
 */
export async function trackOrder(params: TrackOrderParams): Promise<TrackOrderResult> {
  const config = getConfig();

  const response = await fetch(`${config.baseUrl}/api/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify({
      order_id: params.orderId,
      customer_name: params.name,
      customer_phone: params.phone,
      status: params.status || 'order_placed',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`[dz-tracking-sdk Error]: ${err.error || response.statusText}`);
  }

  const data = await response.json();
  const trackingUrl = data.tracking_url as string;
  const trackingUuid = data.tracking_uuid as string;

  let cleanPhone = (params.phone || '').replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '213' + cleanPhone.substring(1);

  const msg = `مرحباً ${params.name || ''}، رابط تتبع شحنتك رقم ${params.orderId} هو:\n${trackingUrl}`;
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

  return {
    success: true,
    trackingUuid,
    trackingUrl,
    whatsappUrl,
  };
}

/**
 * 📦 تحديث حالة طلب برمجياً (سطر واحد بدون أي نصوص عربية)
 */
export async function updateStatus(orderId: string, status: string): Promise<any> {
  const config = getConfig();

  const response = await fetch(`${config.baseUrl}/api/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify({
      order_id: orderId,
      status: status,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`[dz-tracking-sdk Error]: ${err.error || response.statusText}`);
  }

  return response.json();
}

/**
 * 🕵️‍♂️ محرك الالتقاط التلقائي (Autocapture Engine)
 */
function setupAutoCapture() {
  listenerAttached = true;

  // 1. التقاط الضغط على الأزرار التي تحمل data-track-status
  document.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement)?.closest('[data-track-status]') as HTMLElement | null;
    if (!target) return;

    const status = target.getAttribute('data-track-status');
    const orderId = target.getAttribute('data-order-id');

    if (status && orderId) {
      try {
        await updateStatus(orderId, status);
        target.dispatchEvent(new CustomEvent('track:success', { bubbles: true, detail: { orderId, status } }));
      } catch (err) {
        target.dispatchEvent(new CustomEvent('track:error', { bubbles: true, detail: { orderId, status, error: err } }));
      }
    }
  });

  // 2. التقاط تغيير الـ Checkbox التي تحمل data-track-status
  document.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement | null;
    if (!target || !target.matches('input[type="checkbox"][data-track-status]')) return;

    const status = target.getAttribute('data-track-status');
    const orderId = target.getAttribute('data-order-id');

    if (target.checked && status && orderId) {
      try {
        await updateStatus(orderId, status);
        target.dispatchEvent(new CustomEvent('track:success', { bubbles: true, detail: { orderId, status } }));
      } catch (err) {
        target.dispatchEvent(new CustomEvent('track:error', { bubbles: true, detail: { orderId, status, error: err } }));
      }
    }
  });
}

/**
 * 🚀 النمط الأسرع: ينشئ الطلب ويحول المتصفح فوراً لصفحة التتبع (Zero-UI)
 */
export async function trackAndRedirect(params: TrackOrderParams): Promise<void> {
  const { trackingUrl } = await trackOrder(params);
  if (typeof window !== 'undefined' && trackingUrl) {
    window.location.href = trackingUrl;
  }
}