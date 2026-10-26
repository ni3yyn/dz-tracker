---
name: dz-tracker
description: Automatically implement DZ Tracking into any e-commerce, web app, or checkout project with zero manual work. Detects tech stack (Next.js, React, HTML, Shopify Liquid, WooCommerce, Node.js), installs dz-tracking-sdk, discovers checkout forms/actions, injects auto-capture or client hooks, and verifies tracking. Use when asked to "implement dz tracker", "install dz tracking", "add dz tracker to my project", or integrate Algerian COD order tracking.
risk: safe
source: project
date_added: 2026-10-11
---

# DZ Tracker — Autonomous Implementation Skill

This skill is designed for **autonomous, zero-touch implementation** of **DZ Tracking** into any codebase or e-commerce storefront.

When invoked, the agent must **inspect, install, configure, wire up, and verify** DZ Tracking without requiring the developer to write boilerplate or manually configure forms.

---

## ⚡ Execution Workflow Overview

```
1. Detect Tech Stack  ──>  2. Install SDK / Script  ──>  3. Configure API Key
                                                                 │
6. Verify & Smoke Test <──  5. Wire Checkout Flow   <──  4. Scan Checkout Forms
```

---

## Step 1: Detect Tech Stack & Framework

Inspect the repository root to determine the runtime environment:

1. **Check package files**:
   - `package.json` present? ➔ Node/JS project.
   - Detect framework:
     - `next` in dependencies ➔ Next.js (App Router `src/app` vs Pages Router `src/pages`).
     - `react`, `react-dom` (Vite, CRA, Remix) ➔ React Client or Full-Stack.
     - `vue`, `nuxt` ➔ Vue / Nuxt project.
     - `astro` ➔ Astro project.
   - Detect package manager: `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn), `bun.lockb` (bun), or `package-lock.json` (npm).
2. **Check for Static / PHP / CMS**:
   - `.liquid` files / `templates/` / `snippets/` ➔ Shopify Theme.
   - `.php` / `functions.php` / `woocommerce` ➔ WordPress / WooCommerce.
   - Pure `.html` files in root or `public/` ➔ Static Landing Page / HTML Funnel.

---

## Step 2: Auto-Install `dz-tracking-sdk`

Execute the appropriate installation command proactively:

### For Node.js / React / Next.js / Vue / Astro:
- **pnpm**: `pnpm add dz-tracking-sdk`
- **npm**: `npm install dz-tracking-sdk`
- **yarn**: `yarn add dz-tracking-sdk`
- **bun**: `bun add dz-tracking-sdk`

### For Static HTML, Shopify Liquid, or WordPress:
Do **not** run npm. Instead, inject the pre-bundled CDN script in the `<head>` or before `</body>`:
```html
<script src="https://cdn.jsdelivr.net/npm/dz-tracking-sdk@2.0.0/dist/index.js"></script>
```

---

## Step 3: Configure Environment & Merchant API Key

1. Check for existing environment files: `.env.local`, `.env`, `.env.development`.
2. Inspect for `NEXT_PUBLIC_DZ_TRACKER_KEY`, `DZ_TRACKER_API_KEY`, or `DZ_TRACKER_KEY`.
3. If missing:
   - Add the following to `.env.local` or `.env`:
     ```bash
     # DZ Tracking Merchant API Credentials
     NEXT_PUBLIC_DZ_TRACKER_KEY=your_merchant_api_key_here
     # Optional custom backend URL (defaults to production DZ Tracker)
     # NEXT_PUBLIC_DZ_TRACKER_URL=https://app.dz-tracker.com
     ```
   - In static/Liquid/PHP projects, place a placeholder variable:
     ```html
     <script>
       window.DZ_TRACKER_KEY = window.DZ_TRACKER_KEY || "YOUR_MERCHANT_API_KEY";
     </script>
     ```

---

## Step 4: Scan & Locate Checkout Forms & Actions

Search the codebase for checkout endpoints and order forms:

1. **Search HTML & Templates for forms**:
   - Look for `<form` containing keywords: `checkout`, `order`, `commande`, `cart`, `achat`, `shipping`.
   - Look for inputs with `name="phone"`, `name="telephone"`, `name="tel"`, `name="wilaya"`.
2. **Search React / Next.js Components**:
   - `CheckoutForm.tsx`, `OrderModal.tsx`, `CartView.tsx`, `BuyNowButton.tsx`.
   - Submit handlers: `handleSubmit`, `onCheckout`, `onSubmit`, `createOrder`.
3. **Search Server Actions & API Routes**:
   - `app/api/checkout/route.ts`, `app/api/orders/route.ts`, `actions/order.ts`, `server/checkout.ts`.

---

## Step 5: Autonomous Implementation Patterns

Choose the cleanest pattern matching the detected architecture:

---

### Pattern A: Zero-Code Declarative HTML (Shopify Liquid / HTML Funnels / Landing Pages)

**No JavaScript modifications required!** Simply annotate the existing checkout `<form>`:

1. Add `data-dz-checkout` and `data-dz-redirect="tracking"` to the `<form>`:
   ```html
   <form 
     action="/checkout" 
     method="POST"
     data-dz-checkout 
     data-dz-redirect="tracking"
   >
   ```
2. Verify input names or add explicit attributes:
   - Name input: `data-dz-name` (or `name="name"`, `name="nom"`, `name="customer_name"`)
   - Phone input: `data-dz-phone` (or `name="phone"`, `name="telephone"`, `name="tel"`)
   - Wilaya input/select: `data-dz-wilaya` (or `name="wilaya"`, `name="city"`, `name="province"`)
   - Product name: `data-dz-product` (or hidden `<input type="hidden" name="product_name" value="...">`)
   - COD Amount / Price: `data-dz-amount` (or hidden `<input type="hidden" name="price" value="...">`)
3. Initialize in `<head>` or footer:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/dz-tracking-sdk@2.0.0/dist/index.js"></script>
   <script>
     document.addEventListener('DOMContentLoaded', function() {
       DZTracker.initTracker({
         apiKey: window.DZ_TRACKER_KEY || 'your_merchant_key'
       });
     });
   </script>
   ```

---

### Pattern B: React / Next.js Client Component (`useTracker` Hook)

In components with interactive state (e.g., `CheckoutForm.tsx`):

```tsx
// 1. Add import
import { useTracker } from 'dz-tracking-sdk';

export function CheckoutForm({ product }) {
  // 2. Initialize the hook
  const { trackAndRedirect, isLoading, error } = useTracker({
    apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // 3. Track and automatically redirect the customer to their branded tracking page
    await trackAndRedirect({
      orderId: 'ORD-' + Date.now(),
      customerName: formData.get('name') as string,
      customerPhone: formData.get('phone') as string,
      deliveryWilaya: formData.get('wilaya') as string,
      productName: product.title,
      codAmount: product.price,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Existing form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'جاري تأكيد الطلب...' : 'تأكيد الطلبية (الدفع عند الاستلام) 🚚'}
      </button>
    </form>
  );
}
```

---

### Pattern C: Next.js Server Actions / Node.js Backend API

If order creation happens strictly on the server:

```typescript
// in app/actions/checkout.ts or similar
import { DZTrackerClient } from 'dz-tracking-sdk';

const dzTracker = new DZTrackerClient({
  apiKey: process.env.DZ_TRACKER_API_KEY || process.env.NEXT_PUBLIC_DZ_TRACKER_KEY!,
});

export async function processOrderAction(formData: FormData) {
  // 1. Process store DB insertion (existing logic)
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  
  // 2. Register tracking with DZ Tracking
  const tracking = await dzTracker.trackOrder({
    orderId,
    customerName: formData.get('name') as string,
    customerPhone: formData.get('phone') as string,
    deliveryWilaya: formData.get('wilaya') as string,
    codAmount: Number(formData.get('price') || 0),
    productName: formData.get('product') as string,
  });

  // 3. Return tracking URL to redirect the customer
  return {
    success: true,
    trackingUrl: tracking.trackingUrl,
  };
}
```

---

### Pattern D: WhatsApp 1-Click COD Recovery Automation

For merchant dashboards or post-failure contact buttons:

```tsx
import { DZTrackerClient, normalizeAlgerianPhone } from 'dz-tracking-sdk';

const client = new DZTrackerClient({ apiKey: '...' });

// Generate high-converting WhatsApp recovery link
const waUrl = client.generateWhatsAppUrl(
  customerPhone,        // e.g., '0555123456' -> auto-normalizes to '213555123456'
  orderId,              // e.g., '#ORD-9021'
  trackingUrl,          // e.g., 'https://yourstore.com/t/uuid'
  customerName          // e.g., 'Yacine'
);

// Renders 1-click WhatsApp rescue button in dashboard or email:
<a href={waUrl} target="_blank" rel="noopener noreferrer">
  📱 إرسال تذكير عبر واتساب
</a>
```

---

## Step 6: Verify Integration & Run Build Checks

1. **Verify TypeScript & Build**:
   - Next.js: Run `npm run build` or `pnpm build` to confirm zero compilation errors.
   - TypeScript: Run `npx tsc --noEmit`.
2. **Run the CLI verification toolkit**:
   ```bash
   npx dz-tracker test
   ```
3. **Verify Algerian Phone Formatting**:
   Ensure all numbers sent are properly formatted or let the SDK normalize them automatically:
   - `0555123456` ➔ `213555123456`
   - `+213 6 12 34 56 78` ➔ `213612345678`

---

## Step 7: Completion Report for the Developer

Always summarize the autonomous implementation cleanly:
1. **Files Modified**: List every file where the SDK, attributes, or hooks were added.
2. **Implementation Strategy Applied**: (Declarative HTML auto-capture, React hook, or Server Action).
3. **Tracking URL Flow**: Explain where the customer lands after checkout (`/t/[uuid]`).
4. **Environment Variables Needed**: Confirm the exact environment variable name to fill in production.
