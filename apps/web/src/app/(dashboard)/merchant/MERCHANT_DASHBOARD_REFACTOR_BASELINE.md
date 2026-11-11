# Merchant Dashboard Architecture Refactor — Phase 0 Baseline

## Scope and safety contract

This document records the source baseline and migration inventory before any production component is moved.

**Refactor contract**
- Architecture-only: no UI redesign, no changed copy, no changed spacing, typography, colors, dimensions, responsive breakpoints, animations, or interaction behavior.
- No feature removal, backend/API/server-action changes, database changes, or dependency upgrades.
- Existing JSX, CSS declarations, handlers, action arguments, hook behavior, and accessibility behavior are preserved unless a later phase explicitly proves a move requires a mechanical import/export adjustment.
- No old implementation is deleted until its replacement is integrated and verified.
- Work happens on `refactor/merchant-dashboard-architecture`; production `main` is not modified during the refactor.

## Immutable starting point

| Item | Baseline |
|---|---|
| Repository | `ni3yyn/dz-tracker` |
| Base branch | `main` |
| Base commit | `a9cec3087935fe95cc28d9bea4070c5d78cb25b7` |
| Baseline component | `apps/web/src/app/(dashboard)/merchant/MerchantDashboardView.tsx` |
| Baseline blob SHA | `eb7c5e12db6c16e371f9f1b2f5c6aa55c7665304` |
| Exact source line count | 9,927 |
| Source size | 578,725 bytes |
| Current web package | Next.js 16 / React 19 workspace app |
| Working branch | `refactor/merchant-dashboard-architecture` |

The baseline file is preserved in Git at the base commit above. All refactor commits must descend from that commit on the dedicated branch.

## Existing component inventory

The dashboard is not a blank slate. These modules already exist and must be reused rather than reimplemented:

- `StatusSelector.tsx`
- `ShipmentExceptionsPanel.tsx`
- `shipment-exceptions.ts`
- `BrandedSelect.tsx`
- `MappingForm.tsx`
- `ImageUploadField.tsx`
- `CarrierIntegrationsManager.tsx`
- `actions.ts`
- `../useDashboardBackHandler`
- `../../SiteHeader`
- `../../../components/GlobalDialogProvider`

Other route-level files and existing feature components remain in their current locations unless the dependency map proves a move is necessary.

## Source responsibility map

The following line ranges are from the immutable baseline blob. They are initial extraction boundaries, not permission to rewrite the implementation.

| Baseline lines | Responsibility | Planned destination |
|---:|---|---|
| 1–621 | Imports, shared types, order helpers, branding defaults/presets, palettes and contrast utilities | `shared/types`, `shared/constants`, feature-specific types/utils |
| 622–841 | Order details side panel and its imperative handle | `features/orders/OrderDetailsSidePanel.tsx` |
| 842–921 | Dashboard panel transition | `dashboard/DashboardPanelTransition.tsx` |
| 922–1,868 | Main component state, derived values, effects and event handlers | Feature hooks plus composition root, extracted incrementally |
| 1,869–7,409 | Embedded dashboard CSS | `merchant-dashboard.css`, preserving declaration and selector order |
| 7,410–7,681 | Dashboard shell, background (starts at line 7,412), sidebar, navigation and header | `dashboard/` |
| 7,682–7,818 | Overview tab | `tabs/OverviewTab.tsx` |
| 7,819–8,206 | Orders tab | `tabs/OrdersTab.tsx` and order subcomponents |
| 8,207–8,264 | Exceptions and analytics tab content | `tabs/ExceptionsTab.tsx`, `tabs/AnalyticsTab.tsx` |
| 8,265–8,766 | Branding studio and live preview | `tabs/BrandingTab.tsx`, `features/branding/` |
| 8,767–9,094 | Upsells management | `tabs/UpsellsTab.tsx`, `features/upsells/` |
| 9,095–9,103 | Carrier integrations | Existing `CarrierIntegrationsManager.tsx`, wrapped by tab |
| 9,104–9,211 | Status mappings | `tabs/MappingsTab.tsx` |
| 9,212–9,927 | Settings, subscription/payment UI and trailing overlays/portal content | `tabs/SettingsTab.tsx` plus dedicated dialog/panel components where appropriate |

Important: line ranges can shift after the first extraction. Every phase must re-map the current source before applying a move; never use stale line numbers as patch instructions.

## Proposed target architecture

Keep the route and current merchant feature modules in place. Add focused folders under the existing merchant route:

```text
merchant/
├── MerchantDashboardView.tsx       # thin composition root
├── merchant-dashboard.css          # existing CSS, mechanically extracted
├── dashboard/
│   ├── MerchantDashboardShell.tsx
│   ├── DashboardSidebar.tsx
│   ├── DashboardHeader.tsx
│   ├── DashboardMobileMenu.tsx
│   └── DashboardPanelTransition.tsx
├── tabs/
│   ├── OverviewTab.tsx
│   ├── OrdersTab.tsx
│   ├── ExceptionsTab.tsx
│   ├── AnalyticsTab.tsx
│   ├── BrandingTab.tsx
│   ├── UpsellsTab.tsx
│   ├── IntegrationsTab.tsx
│   ├── MappingsTab.tsx
│   └── SettingsTab.tsx
├── components/
│   ├── DashboardStatCard.tsx
│   ├── DashboardSectionHeading.tsx
│   ├── DashboardStatusFilterGroup.tsx
│   ├── DashboardEmptyState.tsx
│   ├── DashboardActionButton.tsx
│   ├── DashboardIconButton.tsx
│   ├── DashboardFormField.tsx
│   └── DashboardLoadingState.tsx
├── features/
│   ├── orders/
│   ├── branding/
│   ├── upsells/
│   ├── settings/
│   └── dashboard/
└── shared/
    ├── types.ts
    ├── constants.ts
    └── formatters.ts
```

This is a target map, not a mandate to create empty files. A shared component is created only after confirming at least two real usages with the same visual/behavior contract. Existing `BrandedSelect`, `StatusSelector`, `MappingForm` and other shared modules stay the canonical implementations; no parallel replacement is allowed.

## Shared visual component policy

The repeated UI must be centralized so future changes stay visually consistent. Before extracting each shared component, inventory its callsites and record the exact DOM structure, classes, inline styles, icon sizing, disabled/loading states, keyboard behavior and responsive rules.

Initial candidates to audit:
- Statistics cards used by Overview and Analytics.
- Section title/description patterns.
- Shared status filter button groups in Orders and Exceptions.
- Empty states and loading states.
- Primary/secondary/icon-only action buttons.
- Form labels, field wrappers and validation/error presentation.
- Confirmation dialogs and side-panel headers/actions, where the DOM and behavior genuinely match.

Do not force superficially similar elements into one abstraction. If two cards differ in hierarchy, spacing, semantics or behavior, keep separate variants with explicit props rather than silently normalizing their UI. Shared components must retain the current class names and exact rendered structure where possible.

## State and logic ownership map

The following is the intended destination for existing state, not a request to change defaults or timing:

| Feature owner | Existing responsibilities to isolate |
|---|---|
| Dashboard navigation | Active tab, mobile menu state, tab selection and back navigation coordination |
| Orders | Search, status/carrier filters, sorting, visible-order pagination, selection, bulk deletion and order-detail opening |
| Manual order | Add-order panel lifecycle, form state, creation/loading/error/success result and product URL metadata |
| Branding | Brand configuration, category selection, presets, history/undo-redo, deferred preview, upload and save state |
| Upsells | List, scraper, create/edit form, save, toggle, delete and reorder states |
| Settings | Store name draft, Telegram tracking, confirmation Telegram and associated saving states |
| Billing | Upgrade tier, advance renewal, proof image, payment submission and history display |
| Toast/dialog | Toast lifecycle and global dialog integration |

Cross-feature state remains a single source of truth. For example, Overview shortcuts must continue to set the same Orders search/filter/tab state; they must not create a second copy of those filters. The existing order drawer's isolated state/ref behavior must remain intact.

## Phase 0 verification baseline

At the time this baseline was recorded for commit `a9cec3087935fe95cc28d9bea4070c5d78cb25b7`:

- Web TypeScript GitHub Actions run `43014485444`: **success**.
- Courier/worker integration GitHub Actions run `43014485361`: **success**.
- Combined status contexts for Telegram worker, Vercel and Web Push: **success**.

These checks establish the pre-refactor baseline only. Every refactor commit must run the applicable checks again.

## Detailed source inventory (verified against the baseline blob)

### React state and hooks

The source contains **56 state declarations** across the dashboard, transition component and order details panel. The main dashboard owns the majority; the order drawer and transition component have their own local state and should stay isolated.

Hook-call inventory from the baseline source:
- `useState`: 56 state declarations (generic type arguments mean a simple textual call count undercounts these).
- `useMemo`: 9
- `useCallback`: 10
- `useEffect`: 7
- `useLayoutEffect`: 3
- `useRef`: 2
- `useDeferredValue`: 1
- `useImperativeHandle`: 1

The main dashboard's state groups are:
- Navigation/store identity: active tab, mobile menu, store-name draft and saved name.
- Upsells: list, scraper URL/loading/error, editing ID, product fields, active flag, save/toggle/delete/reorder progress.
- Branding: selected category, unsaved-change flag, brand configuration, history tick and active preset.
- Orders: search, status and carrier filters, sort order, copied key, selected IDs, deletion state and visible-order count.
- Messaging/settings: Telegram tracking and confirmation enabled/saving states.
- Manual order: modal/panel mounted/open state, creation state, error and success payload.
- Mapping editor: modal open, editing mapping ID, display status and save state.
- Billing: proof submission, proof image URL, selected upgrade tier and advance renewal.
- Shared presentation: toast message.

The two state-owning child components are:
- `OrderDetailsSidePanel`: selected order ID and open state; exposes `open` and `closeIfDeleted` through an imperative ref.
- `DashboardPanelTransition`: measured height and transition direction.

### Effects, derived data and callbacks

The main component includes:
- Effects for synchronizing store identity and initial state.
- Branding history/configuration callbacks, deferred preview state and preset/reset operations.
- Shipment-exception detection and derived visible exception/order ID collections.
- Recent-order and seven-day analytics derivations.
- Carrier collection and filtered-order derivation.
- Layout/resize measurement and keyboard/back-dismiss behavior.
- Event handlers for Telegram settings, confirmation settings, selection/deletion, clipboard, manual order creation, product scraping, upsell CRUD/reordering, payment proof, branding save, inline mapping edits and cross-tab shipment navigation.

The baseline has **three portal render paths**: order details, custom status mapping modal and add-order panel. Dialog accessibility attributes and dismissal behavior must be preserved when these are extracted. The custom mapping and add-order portals are not interchangeable: they have different form state, close guards, transitions and lifecycle.

### Repeated visual patterns observed

A source scan found the following repeated class families (counts are occurrences in static className literals, not a claim that every occurrence has identical markup):

| Pattern | Occurrences | Initial shared-component audit |
|---|---:|---|
| `.dz-order-detail-field` | 43 | Order detail field renderer / field row |
| `.dz-btn` | 18 | Button variants; audit semantics and inline style differences before abstraction |
| `.dz-btn-outline` | 9 | Secondary action variant |
| `.dz-nav-icon` | 9 | Navigation icon wrapper |
| `.formLabel` | 9 | Form label |
| `.dz-order-action-btn` | 8 | Order drawer actions |
| `.dz-card-box` | 8 | Card surface; check structural differences |
| `.dz-overview-kpi-label` / `.dz-overview-kpi-value` | 7 each | Metric card typography |
| `.dz-overview-section-head` / title / subtitle | 6 each | Section heading |
| `.dz-overview-kpi` | 6 | Metric card; Overview uses buttons, Analytics uses non-button divs |
| `.dz-stat-item` / title / value | 6 each | Orders summary metric, distinct class family |
| `.dz-choice-grid` / title / desc | 6 each | Branding choice-card groups |
| `.dz-overview-item` | 5 | Repeated overview row |
| `.dz-upsell-action-btn` | 5 | Upsell-specific actions |
| `.dz-input-field` | 5 | Form control wrapper |
| `.dz-sub-alert-banner` / action | 4 each | Subscription alert |
| `.dz-mapping-preset` / action | 4 each | Mapping-specific UI |
| `.dz-billing-plan-benefit` | 4 | Plan benefit row |
| `.dz-overview-action` | 4 | Overview shortcut |
| `.dz-settings-section` | 3 | Settings section |

This scan is a shortlist, not automatic permission to merge markup. For example, Overview KPI cards are interactive buttons while Analytics KPI cards are static divs; a shared metric component must preserve the exact element semantics through an explicit element mode. Orders' `.dz-stat-item` is visually related but has a different class family and must not be silently restyled.

### Shared components already in use

- `BrandedSelect.tsx`: used in Orders and the Exceptions panel; keep it canonical.
- `StatusSelector.tsx`: existing status selector used in the order detail surface; keep it canonical.
- `ImageUploadField.tsx`: reused by existing upload flows; do not duplicate it in Branding or Billing.
- `ShipmentExceptionsPanel.tsx`: already separate and imports the canonical `BrandedSelect`.
- `CarrierIntegrationsManager.tsx`, `MappingForm.tsx` and `GlobalDialogProvider`: retain their current ownership and contracts.

The new shared UI layer should be added under `components/` only for verified repeated contracts. Initial candidate files:
- `DashboardMetricCard.tsx` (supports the existing button/static semantics without changing DOM structure).
- `DashboardSectionHeading.tsx` (only where the current heading DOM and spacing are identical).
- `DashboardStatusFilterGroup.tsx` (Orders and Exceptions may share a renderer while receiving different state/action options).
- `DashboardEmptyState.tsx` (only where the same empty-state DOM is actually repeated).
- `DashboardActionButton.tsx` and `DashboardIconButton.tsx` (preserve current element, class, icon size, disabled/loading behavior and per-instance style).
- `DashboardFormField.tsx` (only where label/control/error structure is identical).
- `OrderDetailField.tsx` (for the repeated order detail field contract).
- `BrandingChoiceCard.tsx` (for the repeated branding option cards).

Each candidate must be checked against all callsites before implementation. If a pattern differs, retain separate components or explicit variants rather than forcing a common visual result.

## Visual and behavioral baseline capture checklist

Screenshots/recordings are a manual gate before Phase 1. Capture the same seeded merchant/account data and viewport dimensions before and after extraction:

- Desktop: 1440 × 900.
- Tablet: 768 × 1024.
- Mobile: 390 × 844.
- Narrow mobile: 360 × 800.

Capture Overview, Orders (including filters and selected order drawer), Exceptions, Analytics, Branding Studio, Upsells, Integrations, Mappings, Settings/Billing, mobile navigation, add-order panel, dialogs and toast states.

No screenshot capture is claimed. The user has explicitly waived this requirement for starting Phase 1. Runtime preview/build and functional regression checks remain required as available; screenshot comparison can be revisited later without blocking the architecture-only refactor.

## Required validation gates

- Existing workspace build and lint commands; verify their current scripts before running.
- Web TypeScript workflow.
- Courier/worker integration workflow (to catch accidental cross-workspace changes).
- Vercel preview deployment status.
- Screenshot comparison at identical viewport/data/state (waived as a Phase 1 entry gate by the user; retain as later manual QA).
- Browser console and hydration check when an interactive browser session is available.
- Manual interaction regression checklist for every tab and modal.

Do not merge to `main` while any required check is failing or pending.

## Phase 0 completion criteria

- [x] Immutable base commit and component blob SHA recorded.
- [x] Dedicated refactor branch created from the exact base commit.
- [x] Existing shared components and external dependencies inventoried.
- [x] First-pass source responsibility and state ownership maps recorded.
- [x] Existing CI/deployment baseline recorded.
- [x] Runtime screenshot/recording baseline explicitly waived by the user for Phase 1 entry; no screenshots are claimed.
- [~] Repeated visual pattern scan recorded. Callsite-level audit completed for the first extracted shared primitives; remaining pattern candidates stay deferred until their own extraction.
- [ ] Final extraction manifest remains in progress and will be maintained incrementally as each state/effect/handler/modal/portal/CSS block moves.

The user explicitly authorized Phase 1 on 2026-11-11. The remaining visual capture and full-manifest items are tracked as open QA/documentation work, not blockers to incremental architecture extraction.


## Phase 1 — Shared components and dashboard shell

User authorization: 2026-11-11. Screenshot capture was explicitly waived as an entry gate by the user.

### Completed extractions

| Commit | Extracted module(s) | Preserved contract |
|---|---|---|
| `e23ff64201d8c33ecdf940bfb73f187e12f26f77` | `components/OrderDetailField.tsx`, `components/DashboardSectionHeading.tsx` | 43 order metadata fields and 6 Overview/Analytics section headings now use shared renderers. Existing class names, element hierarchy, conditional rendering, text, direction, and inline layout/value styles are retained. |
| `3ea2067b3013dcc13fc919fca0ce8477da6c0c2a` | `components/DashboardIcons.tsx`, `dashboard/DashboardSidebar.tsx` | The existing inline SVG icon registry was moved unchanged. The sidebar and mobile backdrop were moved as a fragment component; navigation updates are delegated to the parent with the same tab selection, Orders/Exceptions filter reset, and mobile-menu-close behavior. |
| `1f134c72eb1d4aad918040a63274c967afd70060` | `dashboard/DashboardPanelTransition.tsx` | The measured-height transition was moved with its ResizeObserver fallback, requestAnimationFrame scheduling/cancellation, tab-direction calculation, existing classes and inline height style. The original tab-order map is passed from the composition root. |
| `43ad065ad85a2fabfe9719f1cac0d31a85cfc872` | `dashboard/DashboardHeader.tsx` | Header title/description, mobile-menu toggle, Overview search, search-submit navigation and manual-order action were moved. State changes remain callbacks owned by the composition root. |
| `8c2a8136a36dab5b8b88125254cbc55cfd1acaa4` | Analytics heading correction | Preserved the Analytics total label inside the shared heading's action slot and removed duplicate closing markup after the first static review caught it. |
| `27c0d7580b1983223aa60dc7e59322faebe032fc` | `components/DashboardMetricCard.tsx` | Seven KPI cards now share one renderer: four Overview cards remain `button` elements with their original callbacks; three Analytics cards remain static `div` elements, including the conditional alert class. |

### Build issue found and corrected

The first Vercel preview for `83bc795` failed because the extracted `DashboardHeader.tsx` retained the old relative import `../../SiteHeader`. Moving the component one directory deeper required changing this to `../../../SiteHeader`. Corrected in commit `6a3d35523985992af529a6052bb7d1e665942a62`; the corrected extraction was subsequently verified by a successful Vercel preview for `ca02fb8eacdafacb874419c89eb387741834391b`.

### Current ownership boundaries

- `MerchantDashboardView.tsx` remains the composition root and still owns feature state, data derivations, mutations, and cross-tab handlers.
- `components/` owns verified reusable rendering primitives (order-detail fields, section headings, KPI cards) and the shared SVG icon registry.
- `dashboard/` owns shell/navigation (header and sidebar) and panel-transition rendering.
- Existing feature components and server actions remain in their prior locations.
- No CSS declarations, API contracts, database logic, feature behavior, copy, responsive rules, or animation values have been intentionally changed.

### Remaining Phase 1 validation

- [x] Static source-level callsite review completed for all current extractions: 43 order-detail fields, 6 section headings, 7 KPI cards (4 button / 3 div), header, sidebar, icon registry and panel transition.
- [x] Production `main` remains unchanged; all work is isolated on `refactor/merchant-dashboard-architecture`.
- [x] Vercel preview build/deployment completed successfully for the corrected Phase 1 extraction.
- [x] Repeated shared-component and tab-rendering callsites were reviewed before extraction; element semantics and canonical existing controls were preserved.
- [x] The extraction manifest was extended to track tab boundaries and the state/effect/portal/CSS work carried into Phase 3.


## Phase 2 — Feature tab boundaries (completed)

The Phase 1 baseline preview build completed successfully for commit `ca02fb8eacdafacb874419c89eb387741834391b`. The completed Phase 2 source commit `4a2aa0462822b7ccdf36b69b4eb7417fe3320685` also has a successful Vercel preview: https://vercel.com/ni3yyns-projects/dz-tracker/5GVzsJZEJS8BSRMheqK3TFdhGxVM. Production `main` remains unchanged.

Phase 2 moves tab-level rendering into dedicated modules while leaving feature state, derived data, server actions, mutations, cross-tab navigation, and existing feature modules in their current owners. Each tab is extracted only after its dependencies and event callbacks are explicit.

### Completed first batch

| Module | Extraction contract |
|---|---|
| `tabs/ExceptionsTab.tsx` | Thin typed adapter over the existing `ShipmentExceptionsPanel`; no duplicate exception state or feature logic. |
| `tabs/AnalyticsTab.tsx` | Analytics JSX moved without changing its DOM/classes/copy/styles. It receives existing derived counts/series and the two original navigation callbacks; calculations remain in the composition root. |
| `tabs/IntegrationsTab.tsx` | Thin typed adapter over the existing `CarrierIntegrationsManager`; provider state and integration actions remain in that canonical feature component. |

### Phase 2 completion checklist

- [x] Overview tab — tabs/OverviewTab.tsx.
- [x] Orders tab — tabs/OrdersTab.tsx; filter/selection/deletion/drawer/manual-order state remains parent-owned.
- [x] Branding Studio — tabs/BrandingTab.tsx and shared/branding-types.ts.
- [x] Upsells — tabs/UpsellsTab.tsx and shared/upsell-types.ts.
- [x] Mappings — tabs/MappingsTab.tsx; custom-mapping modal remains parent-owned.
- [x] Settings/Billing — tabs/SettingsTab.tsx and shared/subscription-types.ts.
- [x] Exceptions, Analytics and Integrations — tabs/ExceptionsTab.tsx, tabs/AnalyticsTab.tsx and tabs/IntegrationsTab.tsx.
- [x] Remaining portal ownership reviewed and recorded below.
- [x] Successful Vercel preview for the completed tab-boundary source commit 4a2aa0462822b7ccdf36b69b4eb7417fe3320685.

No tab receives a second copy of state. Existing feature components and CSS remain canonical; tab extraction preserves the existing JSX structure, classes, element semantics, handlers, conditional rendering, and responsive behavior.


### Completed second batch — Overview

| Module | Extraction contract |
|---|---|
| `tabs/OverviewTab.tsx` | The Overview JSX is moved into a typed tab component. Existing order/exception summaries, four interactive metric buttons, empty setup state, recent/exception rows and quick actions are retained. Data remains derived in the composition root; shipment-list and tab-navigation actions are passed as callbacks. |

The Overview tab receives minimal display-only order fields rather than importing the root's private order type. Its original navigation behavior is preserved: choosing Branding or Integrations changes the active tab and closes the mobile menu; shipment shortcuts use the original `openShipmentList` handler.


### Completed third batch — Orders

| Module | Extraction contract |
|---|---|
| `tabs/OrdersTab.tsx` | Desktop table, mobile cards, metrics, filters, bulk-selection toolbar, paging and per-order actions moved into a presentation component. The component receives the existing filtered lists, state values and callbacks as props. |

All Orders state remains owned by `MerchantDashboardView.tsx`: search/status/carrier/sort filters, pagination count, selected IDs, deletion/loading state, clipboard state and the order-details ref. The existing manual-order panel lifecycle and form remain in the parent; the tab's “add order” button invokes the same callback that opens it and clears its prior error/success state. The original `StatusSelector` and `BrandedSelect` are reused.


### Completed fourth batch — Branding Studio

| Module | Extraction contract |
|---|---|
| `tabs/BrandingTab.tsx` | Branding controls, preset picker, category navigation, undo/redo/reset controls, option selectors, save bar and preview placement moved into a typed tab component. The existing memoized phone preview is supplied as a React node so its renderer and deferred configuration remain untouched. |
| `shared/branding-types.ts` | Shared branded configuration, preset, category and timeline-line-style types now have one importable definition for the composition root and Branding tab. |

Brand configuration/history, save behavior, selected category, active preset, deferred preview calculation and all option/preset constants remain owned by the composition root. The extracted tab invokes the same callbacks and retains the original JSX/classes/inline styles.


### Completed fifth batch — Upsells

| Module | Extraction contract |
|---|---|
| `tabs/UpsellsTab.tsx` | Product recommendation hero, scraper, editor form, image upload, list, metrics, reordering controls, active toggle and CRUD actions moved into a typed presentation boundary. |
| `shared/upsell-types.ts` | The existing `MerchantUpsellItem` interface is centralized and re-exported from the composition module to preserve its named type export. |

Scraper/form draft values, loading/error states, list data, confirmation-backed delete/toggle/reorder/save handlers and optimistic updates remain in the parent. The existing `ImageUploadField` and SVG icon registry are reused unchanged.


### Completed sixth batch — Mappings

| Module | Extraction contract |
|---|---|
| `tabs/MappingsTab.tsx` | Status-mapping presets, active mappings list and inline edit controls moved into a typed component. The original mapping trigger ref is passed through so focus can still return to the same button after the parent-owned modal closes. |

The mapping editor modal, focus/keyboard lifecycle, inline edit state, save handler and server action/toast wrappers remain in the parent. The tab receives only the required display data and callbacks.


### Completed seventh batch — Settings and Billing

| Module | Extraction contract |
|---|---|
| `tabs/SettingsTab.tsx` | Store profile/logo form, Telegram switches, subscription summary, upgrade plans, payment proof form/history and legal links moved into a typed tab component. The existing save/toggle/proof handlers and state values are passed through as props. |
| `shared/subscription-types.ts` | `SubscriptionInfo` and `PaymentRecord` are centralized and re-exported from the composition module to preserve their named type exports. |

Brand settings and store-name save logic remain parent-owned and continue using the same handler as the Branding tab. Telegram optimistic state/loading, active-plan checks, billing selection, renewal toggle, proof upload/submission and payment data remain in the composition root. Existing BrandedSelect, ImageUploadField and SVG icons are reused.

### Portal and overlay ownership review

The composition root still owns the three imperative overlay paths. They were intentionally not moved into the tab files because their lifecycles are tied to cross-tab state, focus restoration, or animated mount/unmount behavior.

| Overlay | Current owner | Preserved lifecycle |
|---|---|---|
| Order details side panel | OrderDetailsSidePanel remains in MerchantDashboardView.tsx and opens through its existing imperative ref. | Local selected-order/open state and portal rendering remain self-contained; Orders invokes the same parent callback/ref. |
| Custom status mapping modal | MerchantDashboardView.tsx. | Parent state, body-scroll lock, Escape listener, trigger focus restoration and MappingForm portal remain together. MappingsTab receives the original trigger ref and an open callback. |
| Add-order panel | MerchantDashboardView.tsx. | Parent state and layout effect retain requestAnimationFrame opening, transition-end unmount, backdrop guard, close guard while creating, and create/success/error state. Orders invokes the existing open callback only. |

No portal lifecycle, modal state or CSS was moved as part of Phase 2. Runtime interaction checks for these overlays remain part of later manual QA; Vercel build success does not claim that browser-level interaction testing was run.


## Phase 3 — Domain state and hook extraction (in progress)

Phase 3 begins only after the tab-boundary source commit passed its Vercel preview. Its goal is to reduce the composition root further by moving feature-owned state, derived selectors, effects and action orchestration into focused hooks. The tabs remain presentation components and receive values/callbacks from the composition root.

### Extraction contract

- Move one feature state group per commit. Do not combine unrelated domains in a single hook migration.
- Preserve initial values, state update order, async optimistic updates/rollback, error handling, toast text, confirmation dialogs, server-action arguments, refresh behavior and effect dependencies.
- Keep cross-tab navigation and state shared by multiple tabs at the composition root unless the shared contract is explicitly redesigned in a separate task.
- Hooks must be called unconditionally at the top level. No action or effect may be delayed or silently discarded during extraction.
- Avoid changing API/server action files, database behavior, CSS, tab markup, or dependencies in this phase.
- After each migration, statically compare the original handler/state block and all hook callsites, then require a successful Vercel preview before beginning the next domain.

### First candidate — Merchant Upsells

- [ ] Extract the existing Upsells draft/list state and related scrape/save/edit/cancel/toggle/delete/reorder handlers into features/upsells/useMerchantUpsells.ts.
- [ ] Keep confirmDialog and toast behavior supplied by the composition root, preserving their existing semantics.
- [ ] Keep MerchantUpsellItem from shared/upsell-types.ts as the single item contract.
- [ ] Keep UpsellsTab as presentation only; it should receive the hook's existing state and callbacks with no local duplicated domain state.
- [ ] Verify the first hook extraction with Vercel before selecting the next domain.


### Completed first batch — Merchant Upsells hook

| Module | Extraction contract |
|---|---|
| features/upsells/useMerchantUpsells.ts | The Upsells list and form state, scraper state, saving/error flags, per-item action flags, and scrape/save/edit/cancel/toggle/delete/reorder handlers were moved into one feature hook. |

The hook receives merchantId and initialUpsells as its existing inputs, plus the parent-owned toast and global confirmation functions. All server action names/arguments, optimistic updates and rollback, list refresh calls, temporary fallback item construction, confirmation copy/tone, error copy, and success toasts were preserved. MerchantDashboardView destructures the returned values and continues passing the same props to UpsellsTab; the tab remains presentation-only.

- [x] Upsells feature state and handlers removed from the composition root.
- [x] No Upsells presentation state was added inside UpsellsTab.
- [ ] Vercel preview for this first Phase 3 hook extraction must pass before moving another domain.

### Completed second batch — Mappings hook

| Module | Extraction contract |
|---|---|
| features/mappings/useMerchantMappings.ts | Inline mapping editor state, save handler and preset/delete action wrappers moved into a focused hook. |

The hook receives merchantId and the existing toast callback. The inline-save handler retains its dynamic action import (with the relative path rebased to the hook location), FormData keys, no-op condition for an empty display value, loading-state order and success message. Preset/delete action arguments and success toasts are unchanged. The custom mapping modal, trigger ref, body scroll lock, Escape handling and focus restoration remain in MerchantDashboardView.

- [x] Inline mapping state and handlers removed from the composition root.
- [x] Custom mapping modal and focus lifecycle remain in the parent.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed third batch — Branding editor hook

| Module | Extraction contract |
|---|---|
| features/branding/useBrandingEditor.ts | Brand configuration initialization, refs, undo/redo stacks, history operations, preset application, category reset, deferred preview value, unsaved-state tracking and the shared save handler moved into a focused hook. |

The hook receives the same server-provided brand defaults, merchant/store inputs, category reset map and parent-owned toast callback. The single save handler is still shared by Branding Studio and Settings, including store-name persistence, FormData fields, action call, browser alert behavior, success toast and saving-state transitions. The root continues to pass the same values and callbacks to both tabs.

- [x] Brand state/history and save handler removed from the composition root.
- [x] Shared Branding/Settings save handler remains one hook callback.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed fourth batch — Settings domain hook

| Module | Extraction contract |
|---|---|
| features/settings/useMerchantSettings.ts | Telegram tracking and confirmation state/toggle handlers, plan eligibility/limit/date derivations, upgrade selection, advance-renewal toggle, and payment-proof state/submission moved into one focused hook. |

The hook preserves the optimistic toggle and rollback paths, server action names/arguments, console error messages, merchant-facing toasts, browser alert copy, payment FormData fields and amount mapping. The Settings tab remains presentation-only; the root continues to provide its same values and callbacks.

- [x] Telegram and confirmation state/handlers removed from the composition root.
- [x] Subscription eligibility/limit derivations are shared by the existing root banner and Settings tab through hook outputs.
- [x] Payment proof and upgrade state/handler removed from the composition root.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed fifth batch — Manual-order workflow hook

| Module | Extraction contract |
|---|---|
| features/orders/useManualOrder.ts | Manual-order modal/panel state, requestAnimationFrame mount/open lifecycle, create action, error/success state and open/close/transition callbacks moved into a focused hook. |

The portal markup itself remains in MerchantDashboardView. The hook preserves the original FormData and createManualOrder call, Telegram result flags, success/error messages, toast branches, and creating-state transitions. The original requestAnimationFrame/cancelAnimationFrame layout effect is moved verbatim. Both existing open entry points now call the same openAddOrder action; backdrop/header/cancel/back navigation and transition-end handling call focused hook actions.

- [x] Manual-order form and animation state/logic removed from the composition root.
- [x] Portal rendering and DOM structure remain in the composition root.
- [x] Back-handler guard still prevents closing while an order is being created.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed sixth batch — Order selection and deletion hook

| Module | Extraction contract |
|---|---|
| features/orders/useOrderSelection.ts | Selected-order IDs, deleting state, individual/bulk selection handlers, clear-selection action, confirmation-backed delete handler, error alerts and success/error toasts moved into a focused hook. |

The hook receives the existing filtered order IDs, global confirm/alert functions and toast callback. The order-details side-panel ref remains in the composition root; the hook reports successfully deleted IDs through a callback so the same panel closes if its selected order was deleted. Confirmation text/tone, delete action arguments, alert copy, catch behavior and loading lifecycle are unchanged.

- [x] Selection and delete state/handlers removed from the composition root.
- [x] Existing side-panel portal and imperative ref remain in the parent.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed seventh batch — Shared order filters hook

| Module | Extraction contract |
|---|---|
| features/orders/useOrderFilters.ts | Shared search/status/carrier/sort state, unique carrier derivation, filtered/sorted order selection, visible-order paging state and page-reset effect moved into one hook. |

The same search state continues to feed DashboardHeader, OrdersTab and ExceptionsTab. Status updates from Overview/Exceptions navigation continue to use the hook setter; shipment-list shortcuts continue resetting visible paging to 20. The existing status matching, risk-first ordering, date sort direction and exact effect dependencies are preserved. The shared isAttentionStatus predicate remains in the root because the order-details side panel also uses it; the hook receives it as a callback rather than creating a second status classifier.

- [x] Shared filter state and derived filtered orders removed from the composition root.
- [x] Header, Orders and Exceptions keep the same shared state and prop bindings.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed eighth batch — Shipment analytics and exception selectors

| Module | Extraction contract |
|---|---|
| features/analytics/useShipmentAnalytics.ts | Delivery-status counts, exception detection/resolution filtering, unresolved exception IDs and rows, success rate, recent orders, seven-day activity, maximum daily count and status breakdown moved into one data hook. |

The hook uses the existing ShipmentExceptionOrder and ShipmentExceptionState types/functions. The shared date formatter is passed through for seven-day labels. Dashboard and tab consumers continue receiving the same values; the custom mapping modal's body-scroll/Escape/focus effect remains in the root and was not included in the extraction.

- [x] Shipment summary and analytics derivations removed from the composition root.
- [x] Exception order rows retain the existing ShipmentExceptionOrder field contract expected by Overview.
- [x] Existing Overview/Orders/Analytics prop contracts remain unchanged.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed ninth batch — Dashboard feedback hook

| Module | Extraction contract |
|---|---|
| features/dashboard/useDashboardFeedback.ts | Shared toast message state/action and clipboard-copy state/action moved into a small dashboard utility hook. |

Toast duration (3.5 seconds), copied indicator duration (2 seconds), clipboard API call and all existing consumer props remain unchanged. Feature hooks receive the same showToast function; existing tab, order panel and toast markup remain untouched.

- [x] Toast and clipboard state/functions removed from the composition root.
- [x] The single shared feedback hook supplies all existing consumers.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed tenth batch — Custom mapping modal controller

| Module | Extraction contract |
|---|---|
| features/mappings/useCustomMappingModal.ts | Custom mapping modal open state, trigger ref, Escape listener, body scroll lock and RAF focus restoration moved into a focused hook. |

The portal and MappingForm DOM remain in MerchantDashboardView. MappingsTab receives the same trigger ref and open callback; back handling, backdrop click and close button use the hook's close action. The effect's cleanup order and focus-restoration scheduling are preserved.

- [x] Custom mapping modal state/ref/effect removed from the composition root.
- [x] Portal markup and form remain unchanged in the root.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed eleventh batch — Order details side-panel component

| Module | Extraction contract |
|---|---|
| components/OrderDetailsSidePanel.tsx | The existing memoized, forward-ref order details side panel, its imperative handle, internal selected-order/open state, portal markup, keyboard/backdrop dismissal, and transition cleanup moved into a dedicated component module. |

The component's JSX and classes are carried over intact. It receives the same order collection and existing status/date/WhatsApp helper functions through props; its public imperative API remains `open(orderId)` and `closeIfDeleted(orderIds)`. A local structural order type avoids introducing a circular dependency on MerchantDashboardView.

- [x] Side-panel implementation removed from the composition root.
- [x] The root retains the same ref and open/close-if-deleted call sites.
- [x] Portal remains rendered in the same parent position; no CSS or animation changes.
- [ ] Vercel preview for this component extraction must pass before moving another domain.

### Completed twelfth batch — Dashboard navigation hook

| Module | Extraction contract |
|---|---|
| features/dashboard/useDashboardNavigation.ts | Active-tab and mobile-menu state, dashboard main ref, tab navigation action, mobile-menu close-on-tab-change, scroll-to-top behavior, and document-title effect moved into a focused hook. |

The existing browser Back history hook remains separate and receives the returned activeTab/setActiveTab values. The sidebar's optional Orders/Exceptions filter reset is passed as a callback so the original state-update order is preserved: change tab, reset status filter when requested, then close the mobile menu. Header, panel-transition and tab consumers keep the same props.

- [x] Active tab/mobile menu state and navigation effects removed from the composition root.
- [x] Existing back-history hook remains the sole owner of browser history state.
- [x] Sidebar Orders/Exceptions reset-filter behavior retained.
- [ ] Vercel preview for this hook extraction must pass before moving another domain.

### Completed thirteenth batch — Store identity state in Branding hook

| Module | Extraction contract |
|---|---|
| features/branding/useBrandingEditor.ts | Store-name draft/saved values, unsaved-name derivation and prop-synchronization effect moved beside the shared Branding/Settings save handler. The hook also now explicitly owns its Branding category and unsaved-branding state. |

This closes the store-identity boundary across both Branding Studio and Settings. MerchantDashboardView receives the same draft/setter/dirty values from the hook and continues passing them into SettingsTab; displayStoreName is still derived once in the root for the header/sidebar/preview. The save action, FormData shape and server-prop synchronization behavior are preserved.

- [x] Store-name draft/saved state and synchronization removed from the composition root.
- [x] Branding category and dirty state are explicitly initialized in the hook.
- [x] Settings continues to use the exact same draft, setter and dirty-state props.
- [ ] Vercel preview for this correction must pass before another domain extraction.

