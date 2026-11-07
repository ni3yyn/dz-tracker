# DZ Tracking SDK

Official TypeScript client for TajerTrack / DZ Tracker order tracking.

> **Release check:** this repository's SDK source currently declares version **2.0.0**. The public npm package may lag behind the source tree. Before relying on these examples, run **npm view dz-tracking-sdk version**, install it, and inspect the installed declaration files. Never assume the published package contains unreleased GitHub source.

## Installation

~~~bash
npm install dz-tracking-sdk
# or: pnpm add dz-tracking-sdk
# yarn add dz-tracking-sdk
# bun add dz-tracking-sdk
~~~

Use the framework-neutral entry point in Node.js/server environments:

~~~typescript
import { DZTrackerClient } from 'dz-tracking-sdk/core';
~~~

The main entry point includes the React hook and expects React to be installed:

~~~typescript
import { useTracker } from 'dz-tracking-sdk';
~~~

## Choose the correct integration

Register tracking **after** your store has successfully created its own order. Do not replace checkout, payment/COD validation, inventory, store database writes, or customer notifications with a tracking request.

Keep the merchant API key private in **DZ_TRACKER_API_KEY**. A value in **NEXT_PUBLIC_*** or a browser hook is visible to every visitor. Prefer server-side registration for production.

## Server-side quick start (recommended)

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

export async function registerOrder(order: {
  id: string;
  customerName?: string | null;
  customerPhone?: string | null;
  productName?: string | null;
}) {
  // Call only after the store order has been persisted successfully.
  const result = await tracker.trackOrder({
    orderId: String(order.id), // Stable external order ID, reused for retries.
    name: order.customerName || undefined,
    phone: order.customerPhone || undefined,
    productName: order.productName || undefined,
    status: 'order_placed',
  });

  if (!result.success || !result.trackingUrl) {
    // Keep the store order. Record a retryable tracking-sync failure.
    return { trackingCreated: false, trackingUrl: null, error: result.error };
  }

  return { trackingCreated: true, trackingUrl: result.trackingUrl };
}
~~~

Do not log the API key. Do not generate a new order ID for every retry. The SDK's localStorage queue is browser-only; server-side retry must use your application's durable job/outbox mechanism.

## Client API

### Register an order

Supported **TrackOrderParams**:

| Property | Type | Meaning |
|---|---|---|
| orderId | string (required) | Stable store order ID |
| name | string | Customer name |
| phone | string | Customer phone; common Algerian formats are normalized |
| status | string | Raw initial status; defaults to order_placed |
| productName | string | Product/order summary |
| productImage | string | Product image URL |
| carrierName | string | Carrier name, if known |
| carrierTrackingNumber | string | Carrier waybill/tracking number |
| description | string | Status description |
| telegramConsent | boolean | True only after explicit customer consent |
| telegramConsentSource | string | Where that consent was collected |

The source type still accepts **totalPrice** and **wilaya** for compatibility, but the current webhook/orchestrator/orders schema does **not persist** either field. Do not promise they appear in the dashboard.

~~~typescript
const result = await tracker.trackOrder({
  orderId: 'STORE-ORDER-1042',
  name: 'Customer Name',
  phone: '0555123456',
  productName: 'Product title',
  status: 'order_placed',
  telegramConsent: false,
});

if (result.success && result.trackingUrl) {
  // A real tracking UUID was returned by the API.
  console.log(result.trackingUrl);
} else {
  // Network, authentication, subscription, account, or server failure.
  console.error(result.error || 'Tracking registration failed');
}
~~~

**TrackOrderResult** contains **success**, **trackingUuid**, **trackingUrl**, **whatsappUrl**, **orderId**, optional **deduplicated**, **isNewOrder**, and **error**. Failed or unconfirmed requests have empty tracking UUID/URL values. The SDK must not fabricate a pending tracking URL; always check **success** before redirecting.

### Update an existing shipment

Use the same external order ID that you used to register the order:

~~~typescript
await tracker.updateStatus({
  orderId: 'STORE-ORDER-1042',
  status: 'out_for_delivery',
  description: 'The parcel is with the delivery agent',
  carrierTrackingNumber: 'YAL-123456',
});
~~~

The direct endpoint may create a new order if it cannot resolve the external order ID or carrier tracking number. Verify the identifier before sending updates.

### Read a tracking record

~~~typescript
const order = await tracker.getOrder('TRACKING_UUID_FROM_CREATE_RESPONSE');
console.log(order.currentStatus, order.timeline);
~~~

The SDK calls **GET /api/track/{trackingUuid}** and returns the response's **data** object.

### Other exports

- **getTrackingUrl(uuid)** returns the public **/t/{uuid}** URL.
- **generateWhatsAppUrl(phone, orderId, trackingUrl, customerName?)** returns a WhatsApp deep link, or an empty string when the phone cannot be normalized.
- **normalizeAlgerianPhone(value)** removes formatting and normalizes common Algerian local/international forms. It is not complete phone-number validation.
- **formatAlgerianPhoneDisplay(value)** formats a normalized Algerian number for display.
- **initTracker(config)** initializes the singleton and (in a browser bundle) enables form auto-capture unless disabled.
- **trackAndRedirect(params)** is a standalone export that uses the initialized singleton and throws when API-confirmed registration fails.

## React hook

Only use the browser hook if exposing the merchant API key to all visitors is explicitly acceptable. A server action/API route is preferred.

~~~tsx
'use client';

import { useTracker } from 'dz-tracking-sdk';

export function TrackButton({ orderId, name, phone }: {
  orderId: string;
  name: string;
  phone: string;
}) {
  // Any NEXT_PUBLIC_* key is visible to site visitors.
  const { track, isLoading, lastResult, error } = useTracker({
    apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY!,
    baseUrl: process.env.NEXT_PUBLIC_DZ_TRACKER_BASE_URL,
  });

  async function onClick() {
    const result = await track({ orderId, name, phone, status: 'order_placed' });
    if (result.success && result.trackingUrl) {
      window.location.assign(result.trackingUrl);
    }
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={isLoading}>View tracking</button>
      {error && <p role="alert">{error.message}</p>}
      {lastResult && !lastResult.success && <p role="alert">{lastResult.error}</p>}
    </>
  );
}
~~~

The hook returns **track**, **updateStatus**, **isLoading**, **lastResult**, and **error**. It does **not** return **trackAndRedirect**. The standalone **trackAndRedirect()** export is separate and requires **initTracker()** first.

## Declarative form auto-capture

The source supports **initTracker()** and **setupAutoCapture()** when imported through a JavaScript bundler in a browser/client-only entry. It does not ship an official UMD/IIFE browser-global bundle. Do not load **dist/index.js** as a plain script tag and do not call **window.DZTracker.initTracker()**.

~~~typescript
import { initTracker } from 'dz-tracking-sdk/core';

initTracker({
  apiKey: 'PUBLICLY_EXPOSED_KEY_ONLY_IF_ACCEPTABLE',
  baseUrl: 'https://tajertrack.vercel.app',
});
~~~

Auto-capture selectors:

- **form[data-dz-checkout]**
- **form[data-dz-form]**
- **form[data-dz-order]**

Supported form/data field values:

| Value | Supported form attribute or control names |
|---|---|
| Order ID | form data-dz-order; otherwise order_id, orderId, orderNumber, order_number, reference, id |
| Name | data-dz-name; otherwise customer_name, name, fullname, full_name, client, nom |
| Phone | data-dz-phone; otherwise customer_phone, phone, telephone, tel, mobile |
| Product | data-dz-product; otherwise product_name, product, item, produit, or scoped data-dz-product text |
| Wilaya | data-dz-wilaya; otherwise wilaya, city, ville, state |
| Total price | data-dz-price; accepted by the client but not persisted by the current server |

Important behavior:

- The SDK observes the submit event but does **not** call **preventDefault()** or cancel/replace the store's native submission. It sends tracking alongside the existing form submission.
- For native forms that navigate immediately, tracking can race the page navigation. For React/server-action checkout or a store that needs reliable order persistence first, call the server-side client after saving the store order.
- Automatic navigation is opt-in via **data-dz-redirect="tracking"** or a custom URL. Use **data-dz-redirect="none"** to suppress SDK navigation.
- A **dz:track:success** event is emitted only after a real tracking UUID has been returned. Failed/unconfirmed requests emit **dz:track:error** and do not redirect.

Example markup (requires the SDK to have been initialized by a bundled browser entry):
~~~html
<form data-dz-checkout data-dz-redirect="none">
  <input name="order_id" value="STORE-ORDER-1042" />
  <input name="name" value="Customer Name" />
  <input name="phone" value="0555123456" />
  <input name="product_name" value="Product title" />
  <button type="submit">Submit existing checkout</button>
</form>
~~~

The data attributes add tracking capture; they do not replace the store's order endpoint or validation.

## Direct REST webhook contract

The current direct endpoint is **POST {baseUrl}/api/webhooks**, with **Content-Type: application/json** and **x-api-key: {merchantApiKey}**.

Supported JSON fields:
~~~json
{
  "order_id": "STORE-ORDER-1042",
  "customer_name": "Customer Name",
  "customer_phone": "0555123456",
  "status": "order_placed",
  "description": "Order received",
  "product_name": "Product title",
  "product_image": "https://store.example/product.jpg",
  "carrier_name": "Yalidine Express",
  "carrier_tracking_number": "YAL-123456",
  "telegram_consent": false
}
~~~

Successful responses contain **success**, **isNewOrder**, **deduplicated**, **order**, **status**, **tracking_uuid**, and **tracking_url**. Non-2xx responses are failures: 400 malformed/empty body, 401 missing/invalid key, 402 subscription limit/expiry, 403 suspended account, 500 internal error.

The same endpoint handles status updates. Send the same **order_id** plus a new **status**. Never send updates with an invented or mismatched ID, because the orchestrator may create a new order when it cannot find a match.

## Shopify and courier webhooks

Repository endpoints:

| Event source | Endpoint |
|---|---|
| Custom direct order/status event | /api/webhooks |
| Shopify order webhook | /api/webhooks/shopify |
| Yalidine | /api/webhooks/yalidine |
| EcoTrack | /api/webhooks/ecotrack |
| ZR Express | /api/webhooks/zrexpress |
| Procolis | /api/webhooks/procolis |
| Maystro | /api/webhooks/maystro |
| Odoo carrier normalization | /api/webhooks/odoo |

Courier endpoints use provider-specific adapters. Inspect the selected adapter and the provider's current payload requirements; do not guess a generic carrier payload.

The shared handler accepts an API key in the **key** query parameter for courier services requiring URL authentication. Treat those URLs as secrets. The Shopify route currently normalizes incoming payloads but does not call its adapter's HMAC verification helper. Do not claim Shopify signatures are verified unless HMAC verification has been implemented and tested.

## Offline behavior

The browser queue uses localStorage, keeps up to 50 pending events, and attempts limited retries after connectivity returns. This is best-effort, not a guaranteed delivery mechanism or a server-side durable queue. Server integrations must use the host application's own durable retry/outbox mechanism.

## CLI

~~~bash
npx dz-tracker help
npx dz-tracker init
npx dz-tracker test
npx dz-tracker snippet
npx dz-tracker install-skill
~~~

- **init** writes private server environment values only; it does not inject code into application entry files.
- **test** performs a read-only credential check and must not create a real order or trigger customer notifications.
- **snippet** prints a server-side integration example.
- **install-skill** fetches the canonical current skill from the configured TajerTrack **/skill.md** endpoint.

## Verification checklist

1. Inspect the final diff. The store's original order creation must still happen exactly once.
2. Run the host project's typecheck, lint and build.
3. Confirm the CLI test is read-only before running it.
4. Use a dedicated test merchant/staging environment for end-to-end order creation.
5. Verify a real response includes a tracking UUID before redirecting.
6. Verify later status updates use the same external order ID and update the same tracking record.
7. Never claim tests or builds passed unless they were actually run and observed.

## License

MIT
