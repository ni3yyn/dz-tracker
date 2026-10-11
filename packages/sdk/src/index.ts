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
  productName?: string;
}

export interface TrackOrderResult {
  success: boolean;
  trackingUuid: string;
  trackingUrl: string;
  whatsappUrl: string;
}

let globalConfig: TrackerConfig | null = null;
let listenerAttached = false;

export function initTracker(config: TrackerConfig) {
  globalConfig = {
    baseUrl: (config.baseUrl || 'http://localhost:3000').replace(/\/$/, ''),
    autoCapture: config.autoCapture !== false,
    ...config,
  };

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

export async function trackOrder(params: TrackOrderParams): Promise<TrackOrderResult> {
  const config = getConfig();

  // ✅ التصحيح: البحث عن productName أولاً، وإن لم يوجد يفحص الـ DOM تلقائياً
  const finalProductName = getAutoCapturedProductName(params.productName);

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
      product_name: finalProductName,
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

function setupAutoCapture() {
  listenerAttached = true;

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

export async function trackAndRedirect(params: TrackOrderParams): Promise<void> {
  const { trackingUrl } = await trackOrder(params);
  if (typeof window !== 'undefined' && trackingUrl) {
    window.location.href = trackingUrl;
  }
}

function getAutoCapturedProductName(explicitName?: string): string | undefined {
  if (explicitName && explicitName.trim()) {
    return explicitName.trim();
  }

  if (typeof document !== 'undefined') {
    const el = document.querySelector('[data-track-product]');
    if (el) {
      if ('value' in el && typeof (el as HTMLInputElement).value === 'string') {
        return (el as HTMLInputElement).value.trim();
      }
      return el.textContent?.trim() || undefined;
    }
  }

  return undefined;
}