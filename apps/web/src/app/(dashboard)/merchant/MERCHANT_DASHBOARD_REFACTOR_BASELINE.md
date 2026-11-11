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
| 1,869–7,417 | Embedded dashboard CSS | `merchant-dashboard.css`, preserving declaration and selector order |
| 7,418–7,681 | Dashboard shell, background, sidebar, navigation and header | `dashboard/` |
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

## Visual and behavioral baseline capture checklist

Screenshots/recordings are a manual gate before Phase 1. Capture the same seeded merchant/account data and viewport dimensions before and after extraction:

- Desktop: 1440 × 900.
- Tablet: 768 × 1024.
- Mobile: 390 × 844.
- Narrow mobile: 360 × 800.

Capture Overview, Orders (including filters and selected order drawer), Exceptions, Analytics, Branding Studio, Upsells, Integrations, Mappings, Settings/Billing, mobile navigation, add-order panel, dialogs and toast states.

No screenshot capture is claimed in this Phase 0 record; it must be completed against the actual running app before the first CSS/component extraction.

## Required validation gates

- Existing workspace build and lint commands; verify their current scripts before running.
- Web TypeScript workflow.
- Courier/worker integration workflow (to catch accidental cross-workspace changes).
- Vercel preview deployment status.
- Screenshot comparison at identical viewport/data/state.
- Browser console and hydration check.
- Manual interaction regression checklist for every tab and modal.

Do not merge to `main` while any required check is failing or pending.

## Phase 0 completion criteria

- [x] Immutable base commit and component blob SHA recorded.
- [x] Dedicated refactor branch created from the exact base commit.
- [x] Existing shared components and external dependencies inventoried.
- [x] First-pass source responsibility and state ownership maps recorded.
- [x] Existing CI/deployment baseline recorded.
- [ ] Runtime screenshot/recording baseline captured.
- [ ] Repeated visual patterns audited against their actual callsites and props.
- [ ] Final extraction manifest completed, including every handler, hook, effect, modal, portal and CSS block.

Phase 1 must not start until the remaining three unchecked items are completed.
