import { NextResponse } from 'next/server';

const SKILL_MARKDOWN = `---
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

\`\`\`
1. Detect Tech Stack  ──>  2. Install SDK / Script  ──>  3. Configure API Key
                                                                 │
6. Verify & Smoke Test <──  5. Wire Checkout Flow   <──  4. Scan Checkout Forms
\`\`\`

---

## Step 1: Detect Tech Stack & Framework

Inspect the repository root to determine the runtime environment:

1. **Check package files**:
   - \`package.json\` present? ➔ Node/JS project.
   - Detect framework:
     - \`next\` in dependencies ➔ Next.js (App Router \`src/app\` vs Pages Router \`src/pages\`).
     - \`react\`, \`react-dom\` (Vite, CRA, Remix) ➔ React Client or Full-Stack.
     - \`vue\`, \`nuxt\` ➔ Vue / Nuxt project.
     - \`astro\` ➔ Astro project.
   - Detect package manager: \`pnpm-lock.yaml\` (pnpm), \`yarn.lock\` (yarn), \`bun.lockb\` (bun), or \`package-lock.json\` (npm).
2. **Check for Static / PHP / CMS**:
   - \`.liquid\` files / \`templates/\` / \`snippets/\` ➔ Shopify Theme.
   - \`.php\` / \`functions.php\` / \`woocommerce\` ➔ WordPress / WooCommerce.
   - Pure \`.html\` files in root or \`public/\` ➔ Static Landing Page / HTML Funnel.

---

## Step 2: Auto-Install \`dz-tracking-sdk\`

Execute the appropriate installation command proactively:

### For Node.js / React / Next.js / Vue / Astro:
- **pnpm**: \`pnpm add dz-tracking-sdk\`
- **npm**: \`npm install dz-tracking-sdk\`
- **yarn**: \`yarn add dz-tracking-sdk\`
- **bun**: \`bun add dz-tracking-sdk\`

### For Static HTML, Shopify Liquid, or WordPress:
Do **not** run npm. Instead, inject the pre-bundled CDN script in the \`<head>\` or before \`</body>\`:
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/dz-tracking-sdk@2.0.0/dist/index.js"></script>
\`\`\`

---

## Step 3: Configure Environment & Merchant API Key

1. Check for existing environment files: \`.env.local\`, \`.env\`, \`.env.development\`.
2. Inspect for \`NEXT_PUBLIC_DZ_TRACKER_KEY\`, \`DZ_TRACKER_API_KEY\`, or \`DZ_TRACKER_KEY\`.
3. If missing:
   - Add the following to \`.env.local\` or \`.env\`:
     \`\`\`bash
     # DZ Tracking Merchant API Credentials
     NEXT_PUBLIC_DZ_TRACKER_KEY=your_merchant_api_key_here
     \`\`\`
   - In static/Liquid/PHP projects, place a placeholder variable:
     \`\`\`html
     <script>
       window.DZ_TRACKER_KEY = window.DZ_TRACKER_KEY || "YOUR_MERCHANT_API_KEY";
     </script>
     \`\`\`

---

## Step 4: Scan & Locate Checkout Forms & Actions

Search the codebase for checkout endpoints and order forms:

1. **Search HTML & Templates for forms**:
   - Look for \`<form\` containing keywords: \`checkout\`, \`order\`, \`commande\`, \`cart\`, \`achat\`, \`shipping\`.
   - Look for inputs with \`name="phone"\`, \`name="telephone"\`, \`name="tel"\`, \`name="wilaya"\`.
2. **Search React / Next.js Components**:
   - \`CheckoutForm.tsx\`, \`OrderModal.tsx\`, \`CartView.tsx\`, \`BuyNowButton.tsx\`.
   - Submit handlers: \`handleSubmit\`, \`onCheckout\`, \`onSubmit\`, \`createOrder\`.
3. **Search Server Actions & API Routes**:
   - \`app/api/checkout/route.ts\`, \`app/api/orders/route.ts\`, \`actions/order.ts\`, \`server/checkout.ts\`.

---

## Step 5: Autonomous Implementation Patterns

### Pattern A: Zero-Code Declarative HTML (Shopify Liquid / HTML Funnels / Landing Pages)
Annotate the checkout \`<form>\`:
\`\`\`html
<form action="/checkout" method="POST" data-dz-checkout data-dz-redirect="tracking">
  <input type="text" name="name" data-dz-name required />
  <input type="tel" name="phone" data-dz-phone required />
  <input type="text" name="wilaya" data-dz-wilaya required />
  <button type="submit">تأكيد الطلب</button>
</form>

<script src="https://cdn.jsdelivr.net/npm/dz-tracking-sdk@2.0.0/dist/index.js"></script>
<script>
  DZTracker.initTracker({ apiKey: window.DZ_TRACKER_KEY });
</script>
\`\`\`

### Pattern B: React / Next.js Client Component (\`useTracker\` Hook)
\`\`\`tsx
'use client';
import { useTracker } from 'dz-tracking-sdk';

export function CheckoutForm({ product }) {
  const { trackAndRedirect, isLoading } = useTracker({
    apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
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
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'جاري التأكيد...' : 'تأكيد الطلبية 🚚'}
      </button>
    </form>
  );
}
\`\`\`

### Pattern C: Server Actions / Backend
\`\`\`typescript
import { DZTrackerClient } from 'dz-tracking-sdk';

const dzTracker = new DZTrackerClient({
  apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY!,
});

export async function processOrderAction(formData: FormData) {
  const tracking = await dzTracker.trackOrder({
    orderId: 'ORD-' + Date.now(),
    customerName: formData.get('name') as string,
    customerPhone: formData.get('phone') as string,
    deliveryWilaya: formData.get('wilaya') as string,
    codAmount: Number(formData.get('price') || 0),
  });
  return { trackingUrl: tracking.trackingUrl };
}
\`\`\`

---

## Step 6: Verify Integration & Build Checks
1. Run \`npm run build\` or \`pnpm build\` to confirm zero compilation errors.
2. Run \`npx dz-tracker test\` to verify API connectivity.
`;

export async function GET() {
  return new Response(SKILL_MARKDOWN, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
