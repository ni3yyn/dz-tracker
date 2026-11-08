# Carrier webhook and account-sync inventory (repository-verified)

**This is a map of what the current TajerTrack repository implements.** Webhook adapter field names are code-level candidates, not an official provider payload contract. EcoTrack account synchronization is based on its public Postman collection; tenant behavior and credentials still need a live connection test.

Snapshot checked: 2026-11-08.

## 1. Implemented webhook routes

| TajerTrack route | Route imports / calls | Repository source |
|---|---|---|
| `POST /api/webhooks` | Direct merchant API; normalizes direct order/status fields | `apps/web/src/app/api/webhooks/route.ts` |
| `POST /api/webhooks/yalidine` | `YalidineAdapter.normalize()` | `apps/web/src/app/api/webhooks/yalidine/route.ts` → `packages/orchestrator/src/carriers/yalidine.adapter.ts` |
| `POST /api/webhooks/ecotrack` | `EcoTrackAdapter.normalize()` | `apps/web/src/app/api/webhooks/ecotrack/route.ts` → `packages/orchestrator/src/carriers/ecotrack.adapter.ts` |
| `POST /api/webhooks/ecotrack/sync` | Internal batch ingestion for the read-only polling worker (1–100 events) | `apps/web/src/app/api/webhooks/ecotrack/sync/route.ts` → same shared handler |
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

## 1A. EcoTrack read-only account synchronization

EcoTrack's public Postman collection is [ECOTRACK API](https://documenter.getpostman.com/view/14517169/Tz5je15g). Its documented requests include token validation, shipment listing, individual/bulk tracking, and shipment-status filtering. The collection does not contain an endpoint to register a webhook or subscribe to courier events, so this integration uses **read-only polling**.

Implementation:

| Purpose | Implementation |
|---|---|
| Merchant connection UI | `apps/web/src/app/(dashboard)/merchant/EcoTrackConnectionPanel.tsx` |
| Authenticated save/test/disconnect actions | `apps/web/src/app/(dashboard)/merchant/actions.ts` |
| Encrypted credentials and sync state | `apps/web/src/app/migrations/20261108_ecotrack_readonly_sync.sql` |
| Background polling | `apps/push-worker/src/ecotrack-sync.ts` |
| Credential decryption | `apps/push-worker/src/ecotrack-credentials.ts` |
| Normal ingestion path | `POST /api/webhooks/ecotrack/sync` → existing orchestrator |

The merchant supplies a tenant-specific HTTPS company URL and its EcoTrack API token. The web server validates the token using `GET /api/v1/validate/token?api_token=...`, then verifies that the account can read `GET /api/v1/get/orders`. Credentials are encrypted with AES-256-GCM and are never returned to the browser. The exact same `CARRIER_CREDENTIALS_ENCRYPTION_KEY` must be configured in Vercel and Railway.

The worker performs only these read operations:

- `GET /api/v1/get/orders?page=...&start_date=...&end_date=...` — paginated list, 40 shipments per page. The official response is Laravel-style `{ current_page, data: [...], last_page, ... }`. The endpoint returns orders in process and excludes archived orders.
- `GET /api/v1/get/orders/status?api_token=...&trackings=...&status=all` — current status and activity map keyed by tracking number; up to 100 tracking numbers per request. This endpoint specifically uses the token as an `api_token` query parameter.
- The token-check endpoint above is used during connection setup.

The official collection documents a limit of **50 requests per minute**. The worker spaces EcoTrack API calls by at least 1.25 seconds. It scans from the connection date and re-reads the last scanned date on subsequent cycles to catch late-arriving shipments. It does not intentionally backfill earlier account history.

**Read-only invariant:** do not add calls to `create/order`, `create/orders`, `valid/order`, `update/order`, `delete/order`, or other write operations in this worker. The merchant continues creating shipments inside the courier's own account. TajerTrack only discovers and tracks them.

Runtime activation is opt-in: set `CARRIER_SYNC_ENABLED=true` and `CARRIER_CREDENTIALS_ENCRYPTION_KEY` (at least 32 characters) in the Railway push-worker environment, and set the same encryption key in Vercel. The database migration must be applied before a merchant can connect.

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

- Tracking number candidates: `tracking`, `tracking_code`, `trackingCode`, `tracking_number`, `tracking_id`, `barcode`, `code`, `code_suivi`, `n_tracking`, `id`.
- External order ID candidates include `reference`, `order_id`, `order_number`, `orderId`, `orderNumber`, `external_id`, `code_commande`.
- Carrier name candidates: `carrier_name`, `carrierName`, `company_name`, `transporteur`, `societe`.
- Customer fields include `client_name` / `customer_name` / `name` / `nom_client` / `destinataire` / `client` and `client_phone` / `customer_phone` / `phone` / `telephone` / `tel` / `mobile` / `contact_phone`.
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

EcoTrack API status keys from `get/orders` and `get/orders/status` are handled explicitly by `EcoTrackAdapter.parseEcoTrackStatus()`. Do not replace those exact mappings with fuzzy translations of tenant-specific French display labels. The list endpoint excludes archived orders, so keep the known-tracking status lookup as the separate status-reconciliation step.

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
