# 📦 DZ Tracking SDK (`dz-tracking-sdk`)

> **Enterprise-grade, post-purchase tracking infrastructure for Algerian e-commerce.**  
> Reduce Cash on Delivery (COD) return rates (*Retours*), automate tracking updates, and deliver 1-click WhatsApp delivery recovery links with minimal code.

---

## 🚀 Key Highlights

* **Zero-Code Form Auto-Capture:** Add `data-dz-checkout` to your checkout form and track orders with **zero lines of JavaScript**.
* **Isomorphic & Multi-Tenant:** Works seamlessly across Browser, Shopify Liquid themes, React / Next.js, and backend runtimes (Node.js, Next.js Server Actions, Remix).
* **Algerian Phone Intelligence:** Automatically normalizes local `05 / 06 / 07` mobile formats into standardized international format (`213XXXXXXXXX`).
* **Flaky Mobile Network Shield:** Features `navigator.sendBeacon` fallback and an offline `localStorage` queue so checkout events are never lost on unstable 3G/4G connections.
* **1-Click WhatsApp COD Recovery:** Generates contextual Arabic recovery links directly to the customer's WhatsApp to resolve *"Client ne répond pas"* issues.
* **Pixel-Ready Custom Events:** Automatically emits `dz:track:success` for Facebook Pixel, TikTok Pixel, and Google Analytics.
* **Lightweight:** Dual ESM & CJS builds with zero heavy dependencies.

---

## 📥 Installation

```bash
# npm
npm install dz-tracking-sdk

# pnpm
pnpm add dz-tracking-sdk

# yarn
yarn add dz-tracking-sdk
```

Or initialize automatically in your project using the interactive CLI:

```bash
npx dz-tracker init
```

---

## ⚡ Quickstart Guide

### Option 1: Zero-Code HTML / Shopify Liquid (Recommended)

Just add `initTracker` once in your app layout or theme header, and annotate your checkout `<form>`:

```html
<!-- 1. Initialize once in your header / layout -->
<script type="module">
  import { initTracker } from 'dz-tracking-sdk';

  initTracker({
    apiKey: 'your_merchant_api_key',
    baseUrl: 'https://dz-tracker-three.vercel.app' // or your custom domain
  });
</script>

<!-- 2. Annotate your checkout form (Zero custom JS needed!) -->
<form data-dz-checkout data-dz-redirect="tracking">
  <input type="text" name="name" placeholder="الاسم الكامل" required />
  <input type="tel" name="phone" placeholder="05 / 06 / 07..." required />
  <input type="text" name="wilaya" placeholder="الولاية" required />
  <input type="hidden" name="product_name" value="Pack Smart Watch Ultra" />
  
  <button type="submit">تأكيد الطلب والدفع عند الاستلام</button>
</form>
```

> **What happens automatically?**  
> 1. When the customer submits, the SDK extracts customer details and normalizes their phone to Algerian `213...`.  
> 2. It creates the tracking record in DZ Tracking.  
> 3. It automatically redirects the customer to their branded tracking page (`/t/[uuid]`).

---

### Option 2: React & Next.js (`useTracker` Hook)

For modern React, Next.js (App Router), or Remix storefronts:

```tsx
'use client';

import React, { useState } from 'react';
import { useTracker } from 'dz-tracking-sdk';

export function CheckoutForm() {
  const { track, isLoading, error } = useTracker({
    apiKey: process.env.NEXT_PUBLIC_DZ_API_KEY!,
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await track({
      orderId: `#DZ-${Date.now().toString().slice(-5)}`,
      name,
      phone,
      productName: 'AirPods Pro 2',
      status: 'order_placed',
    });

    // 🚀 Redirect to the live tracking page
    window.location.href = result.trackingUrl;
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        value={name} 
        onChange={(e) => setName(e.target.value)} 
        placeholder="الاسم" 
        required 
      />
      <input 
        value={phone} 
        onChange={(e) => setPhone(e.target.value)} 
        placeholder="رقم الهاتف" 
        required 
      />
      
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'جاري تأكيد الطلب...' : 'تأكيد الطلب والدفع عند الاستلام 🚚'}
      </button>

      {error && <p style={{ color: 'red' }}>{error.message}</p>}
    </form>
  );
}
```

---

### Option 3: Backend / Server Actions / Node.js (`DZTrackerClient`)

For backend webhooks, server actions, or multi-tenant instances where global state cannot be shared:

```typescript
// app/actions/checkout.ts (Next.js Server Action)
'use server';

import { DZTrackerClient } from 'dz-tracking-sdk';

const tracker = new DZTrackerClient({
  apiKey: process.env.DZ_MERCHANT_KEY!,
  baseUrl: process.env.DZ_API_URL || 'https://dz-tracker-three.vercel.app',
});

export async function processOrderAction(formData: FormData) {
  const order = await tracker.trackOrder({
    orderId: `#ORD-${Date.now()}`,
    name: formData.get('name') as string,
    phone: formData.get('phone') as string,
    productName: 'Chaussures Cuir Véritable',
    status: 'order_placed',
  });

  return {
    success: true,
    trackingUrl: order.trackingUrl,
    whatsappUrl: order.whatsappUrl,
  };
}
```

---

## 🏷️ Declarative HTML Data-Attributes Reference

The SDK auto-capture engine scans your DOM for the following declarative attributes:

| Attribute | Target Element | Description | Example |
| :--- | :--- | :--- | :--- |
| `data-dz-checkout` | `<form>` | Activates zero-code auto-capture on form submission. | `<form data-dz-checkout>` |
| `data-dz-redirect` | `<form>` | Defines post-submit navigation: `'tracking'` (default consumer page), `'none'`, or a custom URL. | `data-dz-redirect="/merci"` |
| `data-dz-order` | `<form>` or `<input>` | Explicit Order ID override. If omitted, checks input `name="order_id"` or auto-generates `#ORD-XXXXX`. | `data-dz-order="#ORD-9021"` |
| `data-dz-name` | `<input>` | Explicit customer name selector (auto-falls back to `name="name"`, `name="customer_name"`). | `<input data-dz-name />` |
| `data-dz-phone` | `<input>` | Explicit customer phone selector (auto-falls back to `name="phone"`, `name="tel"`). | `<input data-dz-phone />` |
| `data-dz-product` | Form, input, or text element | Product title to associate with this order. | `<span data-dz-product>Pack 3 T-Shirts</span>` |
| `data-dz-price` | `<input>` or element | Total price in DZD. | `<input name="total" data-dz-price />` |
| `data-dz-wilaya` | `<select>` or `<input>` | Algerian Wilaya name or code. | `<select name="wilaya" data-dz-wilaya>` |
| `data-dz-status` | Button, link, or checkbox | Triggers a 1-click status update on click or toggle. | `<button data-dz-order="#101" data-dz-status="shipped">تم الشحن</button>` |

---

## 📊 Analytics & Pixel Integration (CustomEvents)

Forms managed by `data-dz-checkout` automatically dispatch standard browser events that bubble up:

```javascript
document.addEventListener('dz:track:success', (event) => {
  const { orderId, trackingUuid, trackingUrl, whatsappUrl } = event.detail;

  // 1. Trigger Facebook Pixel Purchase Event
  if (typeof fbq === 'function') {
    fbq('track', 'Purchase', {
      content_name: orderId,
      currency: 'DZD',
    });
  }

  // 2. Trigger TikTok Pixel
  if (typeof ttq === 'object') {
    ttq.track('CompletePayment', { content_id: orderId });
  }

  console.log(`✅ Order ${orderId} successfully tracked at ${trackingUrl}`);
});

document.addEventListener('dz:track:error', (event) => {
  console.warn('⚠️ Tracking failed:', event.detail.error);
});
```

---

## 📱 Algerian Phone Utilities

Included out-of-the-box for clean, robust numbers:

```typescript
import { normalizeAlgerianPhone, formatAlgerianPhoneDisplay } from 'dz-tracking-sdk';

// Normalizes any format to international standard:
normalizeAlgerianPhone('0555 12 34 56');   // '213555123456'
normalizeAlgerianPhone('+213 6 61 22 33'); // '2136612233'
normalizeAlgerianPhone('0770-99-88-77');   // '213770998877'

// Pretty print for user interfaces:
formatAlgerianPhoneDisplay('213555123456'); // '05 55 12 34 56'
```

---

## 🛠️ Developer CLI Tools

The package ships with a built-in CLI accessible via `npx`:

```bash
# Initialize and inject tracking into your project
npx dz-tracker init

# Verify that your Merchant API Key connects successfully
npx dz-tracker test

# Print ready-to-copy HTML & React code snippets
npx dz-tracker snippet

# View help
npx dz-tracker help
```

---

## 🛡️ Network Resiliency & Offline Queuing

Mobile connectivity in Algeria can fluctuate during checkout. The SDK guarantees:
1. **Zero Frozen Checkouts:** Network calls timeout after 3500ms max, returning an optimistic tracking URL so the customer is never stuck on a frozen button.
2. **`sendBeacon` Support:** Uses `navigator.sendBeacon` so tracking payloads complete even if the customer immediately closes the browser tab after ordering.
3. **Local Cache Retry:** Queues failed events in `localStorage` and automatically syncs them when the device reconnects to the network.

---

## 📄 License

MIT © DZ Tracking
