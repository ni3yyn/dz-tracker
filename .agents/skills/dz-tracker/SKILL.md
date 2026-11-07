---
name: dz-tracker
description: Integrate TajerTrack / DZ Tracker order tracking into an existing e-commerce checkout, storefront, backend, or courier webhook. Use when a developer asks to install DZ Tracking, send orders to TajerTrack, connect Shopify or a custom website, or synchronize shipment statuses.
risk: safe
source: project
---

# DZ Tracker integration skill

Use this skill as the implementation contract for TajerTrack (also branded DZ Tracker). It is written for coding agents across different model families. Follow its inspect-first sequence; do not assume a framework, SDK version, checkout architecture, or provider payload.

## Mandatory behavior

1. **Inspect before coding.** Read the project's package manager, installed dependency versions and declarations, checkout/order-creation flow, database model, server routes, environment handling, and current provider adapters. Search the actual repository; don't infer files or functions.
2. **Preserve the existing checkout.** Do not replace or bypass payment, COD validation, inventory, the store's database insert, order confirmation, or customer messaging. Register tracking only after the merchant's own order is successfully saved.
3. **Use a stable external order ID.** Use the existing store order ID on both registration and subsequent updates. Never generate a new random/timestamp ID for every retry. A mismatched status update can create a second TajerTrack order.
4. **Keep the merchant API key private.** Use server-only environment variable **DZ_TRACKER_API_KEY**. Never put a real key in NEXT_PUBLIC_*, browser code, HTML, a prompt, chat, source control, screenshots, logs, or generated examples. Do not ask the user to paste a real key into the AI conversation; ask them to configure it in a private local/server environment.
5. **Do not claim success prematurely.** A tracking page exists only after an API-confirmed success response with a real tracking UUID and URL. Never fabricate a pending UUID, return a made-up tracking URL, or redirect after timeout/offline/API failure.
6. **Respect consent.** Set telegramConsent true only if the customer gave affirmative consent and that consent was collected in the actual checkout. A phone number or an order submission is not consent.
7. **Do not promise unsupported persistence.** Current source types retain totalPrice and wilaya for source compatibility, but the direct webhook/orchestrator/orders schema does not persist either field. Current supported persisted fields include order ID, customer name/phone, product name/image, raw status/description, carrier name/tracking number, and Telegram consent metadata.
8. **No guessed APIs.** If the SDK version installed in the target project does not expose a method/type/entry point, do not use it. Inspect node_modules declarations. Fall back to the documented direct REST endpoint when needed.
9. Keep the diff narrow. Preserve existing error handling, validation, idempotency, and project conventions. Do not make unrelated refactors.

## Step 1 — Separate the three integration jobs

Determine each independently:

- **Order intake:** how a newly created store order is registered in TajerTrack.
- **Shipment status updates:** whether the courier posts tracking webhooks or the store updates statuses itself.
- **Customer tracking page:** whether the store returns/redirects the customer to the real TajerTrack tracking URL.

A Shopify order-created event is an order-intake event. A Yalidine/EcoTrack/other carrier webhook is a shipment-status event. They are not interchangeable.

## Step 2 — Verify which SDK is actually installed

Package name: **dz-tracking-sdk**.

Before installation run:
~~~bash
npm view dz-tracking-sdk version
~~~

Install with the target repo's existing package manager, then inspect the installed version and its .d.ts files:
~~~bash
pnpm add dz-tracking-sdk
# or npm install dz-tracking-sdk / yarn add dz-tracking-sdk / bun add dz-tracking-sdk
~~~

The GitHub source tree currently declares SDK version **2.0.0**. The public npm release may be behind that source version. **Do not assume that installing the npm package gives you the current repository-source exports.** Verify package.json, lockfile, and node_modules declarations. If npm resolves an older version without the documented v2 APIs, either use the direct REST API below or stop and report the mismatch. Do not invent an import path to make the sample compile.

Current repository-source package entry points (available once this source version is built and published):

- **dz-tracking-sdk/core** — framework-neutral client and browser bootstrap; use this in Node/server projects so React is not imported.
- **dz-tracking-sdk** — root entry exports the same core methods plus the optional React hook; requires React to be installed.
- The package build produces CommonJS and ESM files, not a UMD/IIFE CDN global. Do not use a plain script tag pointing at dist/index.js. Do not call window.DZTracker.initTracker(); window.DZTracker is only the initialized client instance in a browser bundle.

## Step 3 — Preferred production pattern: server-side registration

This is the recommended pattern for Next.js Server Actions/Route Handlers, Node services, Shopify apps, and custom backends. The merchant key stays server-side.

Private environment values:
~~~dotenv
DZ_TRACKER_API_KEY=your_merchant_api_key
DZ_TRACKER_BASE_URL=https://tajertrack.vercel.app
~~~

If the SDK version actually installed exposes the v2 core entry:
~~~typescript
import { DZTrackerClient } from 'dz-tracking-sdk/core';

const tracker = new DZTrackerClient({
  apiKey: process.env.DZ_TRACKER_API_KEY!,
  baseUrl: process.env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app',
});

// Invoke only after your store's own database insert has succeeded.
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
    // Do not claim tracking was created. Keep the store order intact and enqueue
    // a retryable sync task in the host application's durable job/outbox system.
    return { trackingCreated: false as const, trackingUrl: null, error: result.error };
  }

  return { trackingCreated: true as const, trackingUrl: result.trackingUrl };
}
~~~

Adapt the property names to the store's real order type. Do not add a second store order insert. The SDK localStorage queue is browser-only and best-effort; it is not a server-side durable retry system. Server integrations need their own outbox/job retry with the **same order ID**.

## Step 4 — Direct REST API (works without SDK v2)

Use this if the installed npm version is behind, if the project does not need the SDK, or if a server-side HTTP call is simpler.

- Method: **POST**
- URL: **{baseUrl}/api/webhooks**
- Headers: **Content-Type: application/json**, **x-api-key: {merchantApiKey}**
- Keep the key in server environment. Do not expose it to the browser.

Supported request shape:
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

Use an HTTP client appropriate for the target runtime:
~~~typescript
const response = await fetch(`${process.env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app'}/api/webhooks`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.DZ_TRACKER_API_KEY!,
  },
  body: JSON.stringify({
    order_id: String(savedOrder.id),
    customer_name: savedOrder.customerName ?? null,
    customer_phone: savedOrder.customerPhone ?? null,
    status: 'order_placed',
    product_name: savedOrder.productName ?? null,
  }),
});

const payload = await response.json();
if (!response.ok || payload.success !== true || !payload.tracking_uuid || !payload.tracking_url) {
  throw new Error(payload.message || payload.error || 'TajerTrack did not confirm order registration');
}
return payload.tracking_url;
~~~

Successful POST responses contain **success**, **isNewOrder**, **deduplicated**, **order**, **status**, **tracking_uuid**, and **tracking_url**. Expected error statuses include 400 malformed/empty payload, 401 missing/invalid key, 402 subscription limit/expiry, 403 suspended account, and 500 internal failure. Keep the store order intact when the tracking sync fails; retry out-of-band using the same ID.

A read-only credential check is available at **GET {baseUrl}/api/webhooks** with the **x-api-key** header. It returns **valid: true** for a recognized key. It does not create an order, consume order quota, or trigger customer notifications. This is for CLI credential checks only; do not treat it as an order test.

### Subsequent status updates

POST to the same direct endpoint with the **same order_id** and the new **status**, plus optional **description** and **carrier_tracking_number**. The orchestrator tries to find the existing order using external order ID, then carrier tracking number. If it cannot find a match, it may create a new order. Verify the ID before sending updates.

## Step 5 — Current v2 SDK API (verify installed declarations first)

The repository-source v2 client API:

~~~typescript
import { DZTrackerClient } from 'dz-tracking-sdk/core';

const tracker = new DZTrackerClient({
  apiKey: process.env.DZ_TRACKER_API_KEY!,
  baseUrl: process.env.DZ_TRACKER_BASE_URL,
});

const created = await tracker.trackOrder({
  orderId: 'STORE-ORDER-1042',
  name: 'Customer Name',
  phone: '0555123456',
  productName: 'Product title',
  status: 'order_placed',
  telegramConsent: false,
});

if (created.success && created.trackingUrl) {
  console.log(created.trackingUrl);
} else {
  console.error(created.error || 'Tracking registration failed');
}

await tracker.updateStatus({
  orderId: 'STORE-ORDER-1042',
  status: 'out_for_delivery',
  description: 'Parcel handed to the delivery agent',
});

const order = await tracker.getOrder(created.trackingUuid);
~~~

The source API exposes **DZTrackerClient**, **initTracker**, **getTrackerClient**, **trackOrder**, **updateStatus**, **trackAndRedirect**, **setupAutoCapture**, **OfflineQueue**, phone helpers, and types. The current React hook returns **track**, **updateStatus**, **isLoading**, **lastResult**, and **error**. It does **not** return trackAndRedirect. Check the installed .d.ts instead of trusting this source list if using a different release.

TrackOrderParams uses **orderId**, **name**, **phone**, **status**, **productName**, **productImage**, **carrierName**, **carrierTrackingNumber**, **description**, **telegramConsent**, and **telegramConsentSource**. Do not use imaginary names such as customerName, customerPhone, deliveryWilaya, codAmount, or trackAndRedirect on the hook.

A failed/unconfirmed SDK registration returns **success: false**, empty trackingUuid/trackingUrl/whatsappUrl, orderId, and an error message. No pending tracking URL is generated. Only redirect after **success === true** and a non-empty real URL.

## Step 6 — React hook (not preferred for confidential keys)

The browser hook is available only from a package release that exports the current root entry and has React installed. Passing an API key here exposes it to every site visitor; use only if that disclosure is knowingly acceptable.

~~~tsx
'use client';

import { useTracker } from 'dz-tracking-sdk';

export function TrackSavedOrder({ orderId, name, phone }: {
  orderId: string;
  name: string;
  phone: string;
}) {
  const { track, isLoading, error } = useTracker({
    apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY,
    baseUrl: process.env.NEXT_PUBLIC_DZ_TRACKER_BASE_URL,
  });

  async function register() {
    const result = await track({ orderId, name, phone, status: 'order_placed' });
    if (result.success && result.trackingUrl) {
      window.location.assign(result.trackingUrl);
    } else {
      console.error(result.error || error?.message || 'Tracking registration failed');
    }
  }

  return <button type="button" disabled={isLoading} onClick={register}>Open tracking</button>;
}
~~~

Use the real saved orderId; don't generate a new ID in the browser each time the customer clicks.

## Step 7 — Declarative form auto-capture (bundled browser entry only)

The current repository source supports **initTracker()** and **setupAutoCapture()** when imported by a JavaScript bundler in a browser/client-only entry. It does not ship a UMD/IIFE CDN build. Do not use a plain CDN script tag for dist/index.js, and do not assume window.DZTracker is a global namespace with an initTracker method.

~~~typescript
import { initTracker } from 'dz-tracking-sdk/core';

initTracker({
  apiKey: 'PUBLICLY_EXPOSED_KEY_ONLY_IF_ACCEPTABLE',
  baseUrl: 'https://tajertrack.vercel.app',
});
~~~

Observed selectors: **form[data-dz-checkout]**, **form[data-dz-form]**, and **form[data-dz-order]**.

Supported fields are collected from form attributes, named controls, or matching data attributes:

| Data | Form attribute / input names |
|---|---|
| Order ID | form data-dz-order; otherwise order_id, orderId, orderNumber, order_number, reference, id |
| Customer name | data-dz-name; otherwise customer_name, name, fullname, full_name, client, nom |
| Phone | data-dz-phone; otherwise customer_phone, phone, telephone, tel, mobile |
| Product | data-dz-product; otherwise product_name, product, item, produit, or scoped data-dz-product text |
| Wilaya | data-dz-wilaya; otherwise wilaya, city, ville, state (not persisted by server) |
| Total price | data-dz-price; accepted by client for compatibility but not persisted by server |

Important limitations:

- The observer listens to submit but does **not** call preventDefault() or cancel/replace the store's native form submit. It sends the tracking request alongside the existing submission. A native page navigation can race the request.
- For checkout handlers that navigate immediately, React/server actions, or reliable post-persistence behavior, prefer the server-side pattern after the order has been saved.
- The observer refuses to send a tracking request when the real order ID is missing. It emits dz:track:error instead; provide the store's stable ID through data-dz-order or an explicit order_id field.
- Redirect is opt-in through **data-dz-redirect="tracking"** or a custom URL. Set **data-dz-redirect="none"** to suppress SDK redirect. Do not combine redirect with native navigation unless the race is intentionally managed.
- **dz:track:success** is emitted only when API confirms a real tracking UUID. Failures emit **dz:track:error** and never redirect to a fake URL.
- Browser offline queue stores events and the API key in localStorage. This is best-effort browser functionality, not appropriate for a confidential server key.

Example form markup (requires the SDK already initialized by a bundled client entry):
~~~html
<form data-dz-checkout data-dz-redirect="none">
  <input name="order_id" value="STORE-ORDER-1042" />
  <input name="name" value="Customer Name" />
  <input name="phone" value="0555123456" />
  <input name="product_name" value="Product title" />
  <button type="submit">Submit existing checkout</button>
</form>
~~~

The attributes do not replace the merchant's own form action, backend endpoint, or validation.

## Step 8 — Shopify and courier integrations

Use the endpoint matching the actual event source:

| Source | Endpoint |
|---|---|
| Custom direct order/status event | /api/webhooks |
| Shopify order event | /api/webhooks/shopify |
| Yalidine | /api/webhooks/yalidine |
| EcoTrack | /api/webhooks/ecotrack |
| ZR Express | /api/webhooks/zrexpress |
| Procolis | /api/webhooks/procolis |
| Maystro | /api/webhooks/maystro |
| Odoo carrier normalization | /api/webhooks/odoo |

The courier adapters are provider-specific. Inspect the selected repository adapter and the provider's current documented payload before changing anything. Do not send a generic payload to all carrier endpoints. **Procolis implementation caveat:** the current `/api/webhooks/procolis` route imports `ProcolisAdapter`, but that export is currently an alias of `ZRExpressAdapter`; both use the same normalizer and it emits `carrierName: 'ZR Express'`. Do not claim a distinct Procolis normalizer exists. The Odoo route also has explicit string-based adapter selection; read its source before assuming it chooses a carrier correctly.

Courier webhook URLs can use **?key={merchantApiKey}** when the provider cannot send a custom header. Treat the complete URL as a secret; don't commit it or put it into prompts/issues/logs.

The Shopify route currently normalizes Shopify's order payload but does not call the ShopifyAdapter.verifyHmac helper. Do not claim Shopify signature verification is active. Implement and test Shopify HMAC verification before relying on signed-webhook authenticity.

## Step 9 — Tracking read and phone utility behavior

- Public customer page: **{baseUrl}/t/{tracking_uuid}**.
- API lookup: **GET {baseUrl}/api/track/{tracking_uuid}**; the SDK getOrder method returns the response's data object.
- normalizeAlgerianPhone removes formatting and normalizes common local 10-digit and international 12-digit Algerian formats. It is not a full numbering-plan validator; keep checkout validation in the store application.

## Step 10 — CLI and verification

Current source CLI commands:
~~~bash
npx dz-tracker help
npx dz-tracker init
npx dz-tracker test
npx dz-tracker snippet
npx dz-tracker install-skill
~~~

- **init** writes **DZ_TRACKER_API_KEY** and **DZ_TRACKER_BASE_URL** to .env.local; it must not inject frontend code or NEXT_PUBLIC secrets.
- **test** performs only GET /api/webhooks with x-api-key. Never change it to POST a test order; that consumes quota and may start customer notifications.
- **snippet** prints a server-side example using the existing order ID and a real result check.
- **install-skill** fetches the canonical public /skill.md and writes it to supported local agent skill locations.

Before declaring the task complete:

1. Inspect the exact diff and confirm the original store order path still executes once.
2. Run typecheck, lint, and build using the target project's scripts.
3. Confirm the actual CLI test is a GET/read-only request before running it.
4. Use a dedicated staging/test merchant for any real POST test.
5. Verify API success and a real tracking UUID before returning a URL.
6. Verify a later status update uses the same external ID and updates the same record.
7. Do not state that a test or build passed unless it was run and observed.

## Required completion report

Summarize the detected stack, order-intake and status-update paths, installed SDK version, changed files, API-key storage location, stable ID strategy, failure/retry behavior, checks actually run, and any unresolved limitation. Clearly distinguish repository-source capabilities from the currently published npm package.



## Repository reference files

When working from a checkout of this repository, also read these supporting references before implementing a carrier-specific or SDK-specific change:

- `.agents/skills/dz-tracker/references/sdk-cookbook.md` — SDK source v2 entry points, safe server-side patterns, direct REST fallback, real result checks, and CLI behavior.
- `.agents/skills/dz-tracker/references/carrier-matrix.md` — exact route-to-adapter map and field candidates read by the current source. It explicitly distinguishes repository code from vendor API guarantees.

Treat source code, installed package declarations, and a real redacted provider payload as authoritative. A prose reference never overrides the implementation.
