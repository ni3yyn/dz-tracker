# DZ Tracking SDK cookbook (repository source)

This cookbook documents the SDK source in this repository. It is not a promise that the latest public npm tarball contains the same APIs.

## 0. Version check first

The repository package currently declares **2.0.0**. Before writing code against it, run:

~~~bash
npm view dz-tracking-sdk version
pnpm add dz-tracking-sdk
~~~

Then inspect the installed package version and declarations:

~~~bash
node -p "require('./node_modules/dz-tracking-sdk/package.json').version"
~~~

Use only methods and properties that actually exist in that installed version's `.d.ts` files. If npm resolves a version that does not expose the `./core` subpath and the methods below, do not pretend it is v2. Use the Direct REST example in section 2 instead, or use a pinned local/tarball build whose source you have verified. Do not invent a CDN URL or install a package called `dz-tracker-sdk`.

## 1. Recommended: server-side SDK

Register tracking only after the store has successfully saved its own order. Keep the key private.

~~~dotenv
DZ_TRACKER_API_KEY=your_merchant_api_key
DZ_TRACKER_BASE_URL=https://tajertrack.vercel.app
~~~

~~~typescript
import { DZTrackerClient } from 'dz-tracking-sdk/core';

const tracker = new DZTrackerClient({
  apiKey: process.env.DZ_TRACKER_API_KEY!,
  baseUrl: process.env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app',
});

export async function registerSavedOrder(savedOrder: {
  id: string | number;
  customerName?: string | null;
  customerPhone?: string | null;
  productName?: string | null;
  productImage?: string | null;
}) {
  const result = await tracker.trackOrder({
    orderId: String(savedOrder.id),
    name: savedOrder.customerName || undefined,
    phone: savedOrder.customerPhone || undefined,
    productName: savedOrder.productName || undefined,
    productImage: savedOrder.productImage || undefined,
    status: 'order_placed',
  });

  if (!result.success || !result.trackingUuid || !result.trackingUrl) {
    // Preserve the store order. Record a retryable sync task in the host app's
    // durable outbox and retry with the SAME external order ID.
    return { trackingCreated: false, trackingUrl: null, error: result.error };
  }

  return { trackingCreated: true, trackingUrl: result.trackingUrl };
}
~~~

Do not create a second store order inside this function. The SDK's OfflineQueue uses browser localStorage; it is not a Node durable job queue.

## 2. Direct REST (does not depend on an SDK release)

Use this when the installed npm package is behind the repository source or when a direct HTTP request is simpler.

- **POST** `{baseUrl}/api/webhooks`
- `Content-Type: application/json`
- `x-api-key: {merchantApiKey}`

~~~typescript
const response = await fetch(
  `${process.env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app'}/api/webhooks`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.DZ_TRACKER_API_KEY!,
    },
    body: JSON.stringify({
      order_id: String(savedOrder.id),
      customer_name: savedOrder.customerName ?? null,
      customer_phone: savedOrder.customerPhone ?? null,
      product_name: savedOrder.productName ?? null,
      status: 'order_placed',
      telegram_consent: false,
    }),
  }
);
const data = await response.json();
if (!response.ok || data.success !== true || !data.tracking_uuid || !data.tracking_url) {
  throw new Error(data.message || data.error || 'TajerTrack did not confirm tracking creation');
}
return data.tracking_url;
~~~

A read-only key check also exists: **GET** `{baseUrl}/api/webhooks` with `x-api-key`. It returns `valid: true` for a recognized key and does not create an order. This is a credential check, not an end-to-end order test.

## 3. SDK API signatures (repository source v2)

The server-safe entry point is `dz-tracking-sdk/core`. The main package root also exports React functionality.

`TrackOrderParams` fields:

- Required: `orderId`
- Optional: `name`, `phone`, `status`, `productName`, `productImage`, `carrierName`, `carrierTrackingNumber`, `description`, `telegramConsent`, `telegramConsentSource`
- `totalPrice` and `wilaya` remain in types for compatibility but are not persisted by the current webhook/orchestrator/orders schema.

`TrackOrderResult` provides `success`, `trackingUuid`, `trackingUrl`, `whatsappUrl`, `orderId`, and optional `deduplicated`, `isNewOrder`, `error`. Failed or unconfirmed calls have empty UUID/URL values. Never redirect unless `success === true` and a real `trackingUrl` is returned.

~~~typescript
const result = await tracker.trackOrder({
  orderId: 'STORE-ORDER-1042',
  name: 'Customer Name',
  phone: '0555123456',
  productName: 'Product name',
});
if (result.success && result.trackingUrl) {
  // Safe to render or redirect to this API-confirmed URL.
}
~~~

Status updates must use the same external order ID:

~~~typescript
await tracker.updateStatus({
  orderId: 'STORE-ORDER-1042',
  status: 'out_for_delivery',
  description: 'Parcel handed to the delivery agent',
});
~~~

The client also exposes `getOrder(trackingUuid)`, `getTrackingUrl(uuid)`, `generateWhatsAppUrl(...)`, `normalizeAlgerianPhone(...)`, and `formatAlgerianPhoneDisplay(...)`.

## 4. React hook (browser key exposure warning)

The root export's hook returns **track**, **updateStatus**, **isLoading**, **lastResult**, and **error**. It does not return `trackAndRedirect`.

~~~tsx
'use client';

import { useTracker } from 'dz-tracking-sdk';

const { track, isLoading, error } = useTracker({
  apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY,
});

async function registerExistingOrder(existingSavedOrderId: string) {
  const result = await track({ orderId: existingSavedOrderId });
  if (result.success && result.trackingUrl) {
    window.location.assign(result.trackingUrl);
    return;
  }
  console.error(result.error || error?.message || 'Tracking registration failed');
}
~~~

Any key supplied to a browser hook or `NEXT_PUBLIC_*` variable is delivered to visitors. The server-side pattern is preferred for merchant keys. Do not generate an ID in the browser before the store order exists.

## 5. Form auto-capture (bundled browser entry only)

The repository source supports `initTracker()` / `setupAutoCapture()` when bundled into a browser/client entry. It does not ship a UMD/IIFE global bundle. A plain script tag for `dist/index.js` and `window.DZTracker.initTracker()` are not supported.

~~~typescript
import { initTracker } from 'dz-tracking-sdk/core';

initTracker({
  apiKey: 'PUBLICLY_EXPOSED_KEY_ONLY_IF_ACCEPTABLE',
  baseUrl: 'https://tajertrack.vercel.app',
});
~~~

Observed selectors: `form[data-dz-checkout]`, `form[data-dz-form]`, `form[data-dz-order]`.

- The real saved order ID must be present in form `data-dz-order` or an `order_id`-family named control. The SDK skips capture and emits `dz:track:error` if missing; it does not invent an ID.
- It does not call `preventDefault()` or cancel native submit; it sends a parallel request. Native navigation may race the tracking request.
- Redirect is opt-in via `data-dz-redirect="tracking"` or a custom URL; use `data-dz-redirect="none"` to disable.
- `dz:track:success` is emitted only after the API returns a real tracking UUID and URL.
- Browser OfflineQueue stores the API key and event data in localStorage, so it is not suitable for confidential credentials.

Example markup (only after a browser bundle has initialized the SDK):

~~~html
<form data-dz-checkout data-dz-redirect="none">
  <input name="order_id" value="EXISTING_STORE_ORDER_ID" />
  <input name="name" value="Customer Name" />
  <input name="phone" value="0555123456" />
  <button type="submit">Submit existing checkout</button>
</form>
~~~

## 6. CLI

- `npx dz-tracker init`: writes private `DZ_TRACKER_API_KEY` and `DZ_TRACKER_BASE_URL` to local `.env.local`; it does not alter app source.
- `npx dz-tracker test`: read-only GET credential check; it must never create an order.
- `npx dz-tracker snippet`: prints a server-side example.
- `npx dz-tracker install-skill`: fetches the canonical deployed `/skill.md` and writes it to supported agent directories.

## 7. API contract reminders

- Successful create response contains `success`, `tracking_uuid`, and `tracking_url` (plus order/status/deduplication metadata).
- Relevant failures: 400 malformed/empty payload, 401 invalid/missing key, 402 subscription limit/expiry, 403 suspended account, 500 internal.
- A status event with a wrong/unmatched external order ID can create a new tracking order. Verify IDs.
- The server does not persist `totalPrice` or `wilaya`.
- Telegram consent must only be true when affirmative consent was collected in the store checkout.

For the exact provider route mapping and adapter source paths, read `references/carrier-matrix.md`.
