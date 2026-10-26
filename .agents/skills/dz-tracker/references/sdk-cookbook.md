# DZ Tracking SDK v2.0.0 Cookbook

Quick-start recipes for integrating `dz-tracking-sdk` across storefront environments.

---

## 1. Zero-Code Shopify Liquid / Custom HTML Form

Add data attributes directly to your checkout `<form>` tag:

```html
<!-- In checkout or product landing page -->
<form 
  data-dz-checkout 
  data-dz-redirect="tracking"
  method="POST" 
  action="/api/order"
>
  <input type="text" name="name" placeholder="الاسم الكامل" required />
  <input type="tel" name="phone" placeholder="05 / 06 / 07 ..." required />
  <input type="text" name="wilaya" placeholder="الولاية (مثلاً: الجزائر، وهران...)" required />
  <input type="hidden" name="product_name" value="Pack Smart Watch Series 9" />
  <input type="hidden" name="price" value="4800" />
  
  <button type="submit">تأكيد الطلب (الدفع عند الاستلام)</button>
</form>

<!-- Include SDK script from CDN or local bundle -->
<script src="https://cdn.jsdelivr.net/npm/dz-tracking-sdk@2.0.0/dist/index.js"></script>
<script>
  DZTracker.initTracker({
    apiKey: '{{ settings.dz_tracker_api_key }}',
    baseUrl: 'https://app.dz-tracker.com'
  });
</script>
```

---

## 2. Next.js App Router (Client Component with Hook)

```tsx
'use client';

import React, { useState } from 'react';
import { useTracker } from 'dz-tracking-sdk';

export function QuickCheckoutForm() {
  const { trackAndRedirect, isLoading, error } = useTracker();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    wilaya: '16 - Alger',
    price: 3500,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await trackAndRedirect({
      orderId: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      customerName: formData.name,
      customerPhone: formData.phone,
      deliveryWilaya: formData.wilaya,
      codAmount: formData.price,
      productName: 'Original AirPods Pro 2',
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Nom & Prénom"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />
      <input
        type="tel"
        placeholder="Numéro de Téléphone"
        value={formData.phone}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        required
      />
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'جاري المعالجة...' : 'تأكيد الطلبية 🚚'}
      </button>
    </form>
  );
}
```

---

## 3. Next.js Server Action / Backend Route

```typescript
'use server';

import { DZTrackerClient } from 'dz-tracking-sdk';

const dzClient = new DZTrackerClient({
  apiKey: process.env.DZ_TRACKING_API_KEY!,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.dz-tracker.com',
});

export async function processStoreCheckout(rawData: FormData) {
  const name = rawData.get('name') as string;
  const phone = rawData.get('phone') as string;
  const wilaya = rawData.get('wilaya') as string;

  const trackingResult = await dzClient.trackOrder({
    orderId: 'DZ-' + Date.now(),
    customerName: name,
    customerPhone: phone,
    deliveryWilaya: wilaya,
    productName: 'T-Shirt Oversized Premium',
    codAmount: 2900,
  });

  // Save to merchant DB, notify courier, and redirect customer:
  return {
    success: true,
    trackingUrl: trackingResult.trackingUrl,
  };
}
```
