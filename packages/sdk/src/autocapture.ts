/**
 * Browser-only declarative form observer.
 * It does not prevent or replace native form submission; tracking is sent in parallel.
 */
import { DZTrackerClient } from './client';
import { AutoCaptureOptions, TrackOrderParams, TrackOrderResult } from './types';

export function setupAutoCapture(client: DZTrackerClient, options?: AutoCaptureOptions): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const formSelector = options?.formSelector || 'form[data-dz-checkout], form[data-dz-form], form[data-dz-order]';
  const actionSelector = options?.actionSelector || '[data-dz-status], [data-track-status]';

  const handleSubmit = async (e: Event) => {
    const form = e.target as HTMLFormElement;
    if (!form || !form.matches(formSelector)) return;

    const detectedOrderId =
      form.getAttribute('data-dz-order') ||
      extractInputValue(form, ['order_id', 'orderId', 'orderNumber', 'order_number', 'reference', 'id']);

    if (!detectedOrderId) {
      const missingIdError = new Error('DZ Tracker auto-capture needs the real store order ID. Set data-dz-order or provide an order_id field. Use server-side registration if the ID is created after checkout.');
      form.dispatchEvent(new CustomEvent('dz:track:error', {
        bubbles: true, detail: { orderId: '', error: missingIdError },
      }));
      options?.onError?.(missingIdError);
      return;
    }

    const orderId = detectedOrderId;
    const name = form.getAttribute('data-dz-name') ||
      extractInputValue(form, ['customer_name', 'name', 'fullname', 'full_name', 'client', 'nom']);
    const phone = form.getAttribute('data-dz-phone') ||
      extractInputValue(form, ['customer_phone', 'phone', 'telephone', 'tel', 'mobile']);
    const productName = form.getAttribute('data-dz-product') ||
      extractInputValue(form, ['product_name', 'product', 'item', 'produit']) || getScopedProductName(form);
    const wilaya = form.getAttribute('data-dz-wilaya') ||
      extractInputValue(form, ['wilaya', 'city', 'ville', 'state']);
    const totalPrice = form.getAttribute('data-dz-price') ||
      extractInputValue(form, ['total', 'total_price', 'price', 'amount', 'montant']);

    let params: TrackOrderParams = {
      orderId, name, phone, productName, wilaya, totalPrice,
      status: form.getAttribute('data-dz-status') || 'order_placed',
    };

    if (options?.onBeforeTrack) {
      try {
        const modified = await options.onBeforeTrack(params);
        if (modified === false) return;
        if (modified) params = modified;
      } catch (hookErr) {
        console.warn('[DZ AutoCapture onBeforeTrack Warning]:', hookErr);
      }
    }

    try {
      const result = await client.trackOrder(params);
      if (!result.success || !result.trackingUuid || !result.trackingUrl) {
        const trackingError = new Error(result.error || 'DZ Tracker did not confirm order creation.');
        form.dispatchEvent(new CustomEvent('dz:track:error', {
          bubbles: true, detail: { orderId, error: trackingError },
        }));
        options?.onError?.(trackingError);
        return;
      }

      form.dispatchEvent(new CustomEvent<TrackOrderResult>('dz:track:success', {
        bubbles: true, detail: result,
      }));
      options?.onSuccess?.(result);

      const redirectAttr = form.getAttribute('data-dz-redirect');
      const shouldAutoRedirect = redirectAttr !== 'none' &&
        (options?.autoRedirect === true || (options?.autoRedirect !== false && Boolean(redirectAttr)));

      if (shouldAutoRedirect) {
        if (redirectAttr && redirectAttr !== 'tracking' && redirectAttr !== 'true') {
          window.location.href = redirectAttr;
        } else {
          window.location.href = result.trackingUrl;
        }
      }
    } catch (err: any) {
      const trackingError = err instanceof Error ? err : new Error(String(err));
      form.dispatchEvent(new CustomEvent('dz:track:error', {
        bubbles: true, detail: { orderId, error: trackingError },
      }));
      options?.onError?.(trackingError);
    }
  };

  const handleClick = async (e: MouseEvent) => {
    const target = (e.target as HTMLElement)?.closest(actionSelector) as HTMLElement | null;
    if (!target) return;
    const status = target.getAttribute('data-dz-status') || target.getAttribute('data-track-status');
    const orderId = target.getAttribute('data-dz-order') || target.getAttribute('data-order-id');
    if (status && orderId) {
      try {
        await client.updateStatus({ orderId, status });
        target.dispatchEvent(new CustomEvent('dz:status:success', { bubbles: true, detail: { orderId, status } }));
      } catch (err) {
        target.dispatchEvent(new CustomEvent('dz:status:error', { bubbles: true, detail: { orderId, status, error: err } }));
      }
    }
  };

  const handleChange = async (e: Event) => {
    const target = e.target as HTMLInputElement | null;
    if (!target || !target.matches(`input[type="checkbox"]${actionSelector}`)) return;
    const status = target.getAttribute('data-dz-status') || target.getAttribute('data-track-status');
    const orderId = target.getAttribute('data-dz-order') || target.getAttribute('data-order-id');
    if (target.checked && status && orderId) {
      try {
        await client.updateStatus({ orderId, status });
        target.dispatchEvent(new CustomEvent('dz:status:success', { bubbles: true, detail: { orderId, status } }));
      } catch (err) {
        target.dispatchEvent(new CustomEvent('dz:status:error', { bubbles: true, detail: { orderId, status, error: err } }));
      }
    }
  };

  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', handleChange, true);
  return () => {
    document.removeEventListener('submit', handleSubmit, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('change', handleChange, true);
  };
}

function extractInputValue(form: HTMLFormElement, candidates: string[]): string | undefined {
  for (const name of candidates) {
    const el = form.elements.namedItem(name) as HTMLInputElement | null;
    if (el && typeof el.value === 'string' && el.value.trim()) return el.value.trim();
    const byAttr = form.querySelector(`[data-dz-${name}]`) as HTMLInputElement | null;
    if (byAttr && typeof byAttr.value === 'string' && byAttr.value.trim()) return byAttr.value.trim();
  }
  return undefined;
}

function getScopedProductName(form: HTMLFormElement): string | undefined {
  const localEl = form.querySelector('[data-dz-product], [data-track-product]');
  if (localEl) {
    if ('value' in localEl && typeof (localEl as HTMLInputElement).value === 'string') {
      return (localEl as HTMLInputElement).value.trim();
    }
    return localEl.textContent?.trim() || undefined;
  }
  const globalEl = document.querySelector('[data-dz-product], [data-track-product]');
  if (globalEl) {
    if ('value' in globalEl && typeof (globalEl as HTMLInputElement).value === 'string') {
      return (globalEl as HTMLInputElement).value.trim();
    }
    return globalEl.textContent?.trim() || undefined;
  }
  return undefined;
}
