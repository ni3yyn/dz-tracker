# Carrier webhook adapter inventory (repository-verified)

**This is a map of what the current TajerTrack repository code reads and normalizes. It is not a carrier's official webhook specification.** Candidate field names below are taken from the adapters' `extractFirst` calls. They do not prove that a provider will send those fields in every account, region, or webhook event. Before configuring a live courier integration, obtain a real sample payload or consult the provider's current documentation and compare it with the corresponding adapter.

Snapshot checked: 2026-11-07.

## 1. Implemented webhook routes

| TajerTrack route | Route imports / calls | Repository source |
|---|---|---|
| `POST /api/webhooks` | Direct merchant API; normalizes direct order/status fields | `apps/web/src/app/api/webhooks/route.ts` |
| `POST /api/webhooks/yalidine` | `YalidineAdapter.normalize()` | `apps/web/src/app/api/webhooks/yalidine/route.ts` → `packages/orchestrator/src/carriers/yalidine.adapter.ts` |
| `POST /api/webhooks/ecotrack` | `EcoTrackAdapter.normalize()` | `apps/web/src/app/api/webhooks/ecotrack/route.ts` → `packages/orchestrator/src/carriers/ecotrack.adapter.ts` |
| `POST /api/webhooks/zrexpress` | `ZRExpressAdapter.normalize()` | `apps/web/src/app/api/webhooks/zrexpress/route.ts` → `packages/orchestrator/src/carriers/zrexpress.adapter.ts` |
| `POST /api/webhooks/procolis` | `ProcolisAdapter.normalize()` | `apps/web/src/app/api/webhooks/procolis/route.ts` → same ZR Express source |
| `POST /api/webhooks/maystro` | `MaystroAdapter.normalize()` | `apps/web/src/app/api/webhooks/maystro/route.ts` → `packages/orchestrator/src/carriers/maystro.adapter.ts` |
| `POST /api/webhooks/odoo` | Chooses ZR, EcoTrack, or Yalidine adapter from carrier text | `apps/web/src/app/api/webhooks/odoo/route.ts` |
| `POST /api/webhooks/shopify` | `ShopifyAdapter.normalize()` | `apps/web/src/app/api/webhooks/shopify/route.ts` → `packages/orchestrator/src/sources/shopify.adapter.ts` |

### Important Procolis implementation detail

The route is separate, but `ProcolisAdapter` is currently exported as an alias of `ZRExpressAdapter` in `packages/orchestrator/src/carriers/zrexpress.adapter.ts`. Both therefore run the same normalizer, which sets the normalized `carrierName` to **ZR Express**. Do not describe the current code as having an independent Procolis normalizer or claim its resulting carrier label is Procolis. This is an implementation fact to account for, not a statement about the provider's external API.

### Odoo route selection

The Odoo route reads the first available carrier text from `carrier_name`, `delivery_type`, `carrier`, or `transporteur`:

- contains `zr` or `procolis` → `ZRExpressAdapter`
- contains `ecotrack`, `noest`, `dhd`, or `conexlog` → `EcoTrackAdapter`
- otherwise → defaults to `YalidineAdapter`

This is the actual repository routing logic. Verify the merchant's carrier field values match these checks; an unknown value defaults to Yalidine.

## 2. Candidate fields currently read by each adapter

These are code-level extraction candidates, not a promise that all are present or officially supported in live provider payloads.

### Yalidine

Source: `packages/orchestrator/src/carriers/yalidine.adapter.ts`

- Tracking number candidates: `tracking`, `tracking_number`, `carrier_tracking_ref`, `trackingNumber`, `id`, `code_suivi`, `barcode`, `Tracking`.
- External order ID candidates include: `order_id`, `external_order_id`, `order_number`, `origin`, `sale_order`, `picking_name`, `orderId`, `orderNumber`, `reference`.
- Customer name candidates include `customer_name`, `firstname`, `client_name`, `partner_name`, `recipient_name`, `nom`, `client`; phone candidates include `customer_phone`, `contact_phone`, `phone`, `telephone`, `tel`, `client_phone`, `mobile`.
- Status candidates: `last_status`, `status`, `statut`, `current_status`, `etat`; reason candidates: `reason`, `sub_status`, `motif`, `commentaire`, `comment`.
- Stopdesk hints read include `is_stopdesk`, `delivery_type`, `type_livraison`, plus center/agency/wilaya text fields.

### EcoTrack

Source: `packages/orchestrator/src/carriers/ecotrack.adapter.ts`

- Tracking number candidates: `tracking_code`, `trackingCode`, `tracking`, `barcode`, `code`, `code_suivi`, `id`.
- External order ID candidates include `reference`, `order_id`, `order_number`, `orderId`, `orderNumber`, `external_id`, `code_commande`.
- Carrier name candidates: `carrier_name`, `carrierName`, `company_name`, `transporteur`, `societe`.
- Customer fields include `client_name` / `customer_name` / `name` and `client_phone` / `customer_phone` / `phone` / `telephone` / `tel` / `mobile`.
- Status candidates: `status`, `current_status`, `statut`, `etat`; reason candidates include `reason`, `motif`, `sub_status`, `comment`, `remarque`, `observation`.

### ZR Express / Procolis adapter

Source: `packages/orchestrator/src/carriers/zrexpress.adapter.ts`

- The normalizer unwraps the first item from `Colis: [...]` or a top-level array.
- Tracking number candidates include `Tracking`, `tracking`, `tracking_number`, `id_colis`, `code_suivi`, `barcode`, `id`.
- External order ID candidates include `id_Externe`, `id_externe`, `idExterne`, `order_id`, `external_order_id`, `order_number`, `reference`.
- Customer fields include `Client`, `client`, `customer_name`, `nom`, `destinataire`, `nom_client`; phone fields include `MobileA` / `MobileB` and fallback phone aliases.
- Product candidates include `TProduit`, `tProduit`, `t_produit`, `product_name`, `product`, `produit`, `article`.
- Status candidates include `Situation`, `situation`, `Situation_Colis`, `status`, `statut`, `etat`, `last_status`; reason candidates include `Motif`, `motif`, `motif_retour`, `reason`, `Note`, `note`, `commentaire`.
- Stopdesk detection reads `TypeLivraison`, `type_livraison`, or `typeLivraison`.

### Maystro

Source: `packages/orchestrator/src/carriers/maystro.adapter.ts`

- The normalizer unwraps `order`, `data`, or the first element of a top-level array.
- Tracking candidates include `tracking_id`, `tracking_number`, `tracking`, `barcode`, `code_suivi`, `id`, `order_id`.
- External order candidates include `external_order_id`, `external_id`, `order_number`, `order_id`, `reference`, `id`.
- Customer, phone, and product aliases are read from the source. A `products` array may supply the first product name when a direct product field is absent.
- Delivery type recognizes `delivery_type`, `type_livraison`, or `type` and treats a numeric/string `1` or stopdesk/retrait wording as pickup.
- Status candidates include `status`, `current_status`, `statut`, `etat`, `state`, `order_status`; reason candidates include `reason`, `motif`, `motif_retour`, `sub_status`, `note_to_driver`, `note`, `comment`, `commentaire`.

## 3. Status normalization and event behavior

The adapters use fuzzy string matching, diacritic normalization, and their own status/reason parser. Depending on the input, they emit values such as `processing`, `dispatched`, `in_transit`, `at_local_hub`, `ready_for_pickup`, `out_for_delivery`, `attempt_failed`, `attempt_failed_no_answer`, `attempt_failed_unreachable`, `postponed`, `delivered`, or `returned`.

Do not copy a guessed exhaustive vendor status dictionary into a courier configuration. To add a new raw status:
1. Capture a real, redacted webhook payload from that carrier/account.
2. Add a representative fixture/test.
3. Check the adapter's exact parser ordering so a broad substring does not misclassify another state.
4. Confirm the emitted status against the dashboard's supported status mapping and customer-facing labels.
5. Verify repeat events do not create duplicate orders and that updates use the same external order ID or carrier tracking number.

## 4. New Wilaya resolver: scope and caution

The repository exports `ALGERIA_WILAYAS_58`, `ALGERIA_NEW_WILAYAS_2026`, and `resolveCourierWilayaCode()` from `packages/orchestrator/src/carriers/maystro.adapter.ts`. The latter maps configured codes 59–69 to a `shipAs` code.

This is an internal code mapping. It is **not** evidence that every carrier currently accepts only codes 1–58, that a particular statute or transition date is in force, or that the mapping is universal across couriers. Check current official legal and provider documentation before making those claims or using a converted code for a real shipment. Do not apply this Maystro-oriented resolver to another carrier without explicit support.

## 5. Shopify security note

`ShopifyAdapter.verifyHmac()` exists in `packages/orchestrator/src/sources/shopify.adapter.ts`, but the current route `apps/web/src/app/api/webhooks/shopify/route.ts` only calls `ShopifyAdapter.normalize()` through the shared handler and does not call `verifyHmac()`. Do not claim the current Shopify webhook route validates Shopify HMAC signatures.

## 6. Authentication and testing

All carrier webhook routes use the shared `createWebhookHandler` in `apps/web/src/lib/webhook-handler.ts`. It resolves the merchant from the API key and passes a normalized `TrackingEvent` into the orchestrator. The shared handler accepts API key headers and legacy query parameters such as `?key=`; a query-bearing webhook URL is a secret and may be logged by intermediaries.

Use a redacted payload captured from the exact provider integration when testing. Do not assume the adapter's candidate field names are a guarantee of provider behavior.
