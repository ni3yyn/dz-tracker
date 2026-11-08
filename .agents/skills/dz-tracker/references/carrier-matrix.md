# Carrier webhook and account-sync inventory (repository-verified)

**This is a map of what the current TajerTrack repository implements.** Webhook adapter field names are code-level candidates, not an official provider payload contract. EcoTrack account synchronization is based on its public Postman collection; tenant behavior and credentials still need a live connection test.

Snapshot checked: 2026-11-08.

## 1. Implemented webhook routes

| TajerTrack route | Route imports / calls | Repository source |
|---|---|---|
| `POST /api/webhooks` | Direct merchant API; normalizes direct order/status fields | `apps/web/src/app/api/webhooks/route.ts` |
| `POST /api/webhooks/yalidine` | Legacy/query-key flat payload compatibility only | `apps/web/src/app/api/webhooks/yalidine/route.ts` → `YalidineAdapter.normalize()` |
| `GET/POST /api/webhooks/yalidine/{endpointToken}` | Modern CRC challenge + raw-body HMAC-SHA256 verification + durable batched event queue | `apps/web/src/app/api/webhooks/yalidine/[endpointToken]/route.ts` → `yalidine_webhook_events` → Railway worker |
| `POST /api/webhooks/ecotrack` | `EcoTrackAdapter.normalize()` | `apps/web/src/app/api/webhooks/ecotrack/route.ts` → `packages/orchestrator/src/carriers/ecotrack.adapter.ts` |
| `POST /api/webhooks/ecotrack/sync` | Internal batch ingestion for the read-only polling worker (1–100 events) | `apps/web/src/app/api/webhooks/ecotrack/sync/route.ts` → same shared handler |
| `POST /api/webhooks/zrexpress/[endpointToken]` | Modern ZR Express Svix receiver; verifies raw-body signature and queues signed events | `apps/web/src/app/api/webhooks/zrexpress/[endpointToken]/route.ts` → `ZRExpressWebhookAdapter` → `zrexpress_webhook_events` |
| `POST /api/internal/zrexpress/process` | Signed Railway-worker-only processor; not a provider webhook URL | `apps/web/src/app/api/internal/zrexpress/process/route.ts` → `TrackingOrchestrator` → existing order/notification pipeline |
| `POST /api/webhooks/zrexpress` | Legacy Procolis-shaped payload only; do not use for modern ZR Supplier API | `apps/web/src/app/api/webhooks/zrexpress/route.ts` → `ZRExpressAdapter.normalize()` |
| `POST /api/webhooks/procolis` | `ProcolisAdapter.normalize()` | `apps/web/src/app/api/webhooks/procolis/route.ts` → same ZR Express source |
| `POST /api/webhooks/maystro/{endpointToken}` | Managed Maystro API + Webhook receiver; URL-token lookup, decodes `message.data`, reads full order and order history using the merchant API Token | `apps/web/src/app/api/webhooks/maystro/[endpointToken]/route.ts` → `MaystroAdapter.normalizeOrderHistory()` |
| `POST /api/webhooks/maystro` | Legacy/query-key compatibility receiver only; retain for existing integrations, do not use for new managed Maystro connections | `apps/web/src/app/api/webhooks/maystro/route.ts` → `MaystroAdapter.normalize()` |
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

## 1A. Yalidine / Guepex signed webhook implementation

| Purpose | Implementation |
|---|---|
| Merchant connection UI | `apps/web/src/app/(dashboard)/merchant/YalidineConnectionPanel.tsx` |
| Authenticated setup and secret save | `apps/web/src/app/(dashboard)/merchant/yalidine-actions.ts` |
| Merchant-scoped encrypted signing secret | `apps/web/src/lib/yalidine-webhook-credentials.ts` |
| CRC + HMAC verifier and event envelope validation helpers | `apps/web/src/lib/yalidine-webhook.ts` |
| Public per-merchant webhook | `GET/POST /api/webhooks/yalidine/{endpointToken}` |
| Durable event queue and claim RPC | `apps/web/src/app/migrations/20261108_yalidine_signed_webhooks.sql` |
| Event normalization and status mapping | `packages/orchestrator/src/carriers/yalidine.adapter.ts` |
| Signed internal processor | `POST /api/internal/yalidine/process` |
| Railway queue consumer | `apps/push-worker/src/yalidine-webhook-worker.ts` |

This receiver uses the SkillHub third-party contract: GET requires `subscribe` and `crc_token` and echoes the exact token; POST verifies the raw body against `X-YALIDINE-SIGNATURE` using hexadecimal HMAC-SHA256 and a merchant-specific secret. It stores the original `type`, `event_id`, `occurred_at`, and `data` in the queue and returns HTTP 200 only after the batch is persisted. Duplicate event IDs are ignored. Processing occurs in the Railway worker under a database lease, with retries and dead-letter state; the worker's internal request is separately HMAC-authenticated.

Only `parcel_created` and `parcel_status_updated` currently create/update TajerTrack orders and timeline events. `parcel_edited`, `parcel_deleted`, and `parcel_payment_updated` are durably queued and acknowledged without changing the timeline or payment state. Merchants should subscribe to the two supported types only. Provider event timestamps are retained; offset-less timestamps are interpreted as Algeria UTC+1. Event IDs are namespaced with `yalidine:` before entering the shared ordered-history ledger.

The merchant first generates a unique callback URL in TajerTrack, creates a webhook in the courier dashboard, saves the signing secret from the webhook card, runs the provider's test function, then activates the webhook. Apply `20261108_yalidine_signed_webhooks.sql`; set `CARRIER_CREDENTIALS_ENCRYPTION_KEY` in Vercel and Railway and set `YALIDINE_WEBHOOK_WORKER_ENABLED=true` in Railway. The per-merchant secret is encrypted with AES-256-GCM and merchant-scoped AAD. The old query-key route is retained only for legacy flat-payload senders; it does not implement this envelope/signature contract.

The SkillHub page is third-party reference, not official provider documentation. Live CRC, HMAC and event delivery must still be verified using a merchant's own Webhooks dashboard. TajerTrack's current Yalidine integration is webhook tracking only; it does not yet create parcels through the shared API. Guepex must use a separate integration identity and merchant secret even though the documented API family is shared.

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

## 1B. Modern ZR Express Supplier API (Svix)

The modern ZR Express integration is separate from the older Procolis-shaped adapter:

| Purpose | Implementation |
|---|---|
| Merchant connection UI | `apps/web/src/app/(dashboard)/merchant/ZRExpressConnectionPanel.tsx` |
| Authenticated API validation and webhook registration | `apps/web/src/app/(dashboard)/merchant/zrexpress-actions.ts` |
| Encrypted API key, tenant ID, Svix secret | `apps/web/src/lib/zrexpress-credentials.ts` |
| Public, tenant-tokenized receiver with Svix verification | `POST /api/webhooks/zrexpress/[endpointToken]` |
| Durable idempotent event queue and ordering RPCs | `apps/web/src/app/migrations/20261108_zrexpress_webhooks.sql` |
| Modern event normalizer | `packages/orchestrator/src/carriers/zrexpress-webhook.adapter.ts` |
| Railway queue consumer | `apps/push-worker/src/zrexpress-webhook-worker.ts` (sends a signed event-ID request to the internal processor; retries queue rows) |

The managed connection uses `https://api.zrexpress.app/api/v1` with `X-Api-Key` and `X-Tenant`. It registers the three supported events explicitly: `parcel.state.updated`, `parcel.state.situation.created`, and `parcel.isReturn.updated`. Do not omit `eventTypes`: the provider SDK's live-verified reference notes that creating an endpoint without a non-empty list has returned HTTP 500.

ZR credentials are stored with AES-256-GCM and the same `CARRIER_CREDENTIALS_ENCRYPTION_KEY` used by EcoTrack. The webhook receiver verifies Svix using the raw request bytes before storing the event. Event IDs are unique per merchant. The Railway worker calls `/api/internal/zrexpress/process` using an HMAC request signature derived from the existing encryption key; the internal Next.js route checks the queue lease, runs the shared orchestrator and preserves confirmation enqueueing. The worker stays independent of the orchestrator workspace package, so its isolated Docker build remains self-contained. Database RPCs reject stale provider timestamps and repeated Svix IDs.

Apply `20261108_zrexpress_webhooks.sql` before enabling the integration. Set `ZREXPRESS_WEBHOOK_WORKER_ENABLED=true` and optionally `ZREXPRESS_WEBHOOK_POLL_INTERVAL_MS=2000` in the Railway push-worker environment. The public receiver must run on the HTTPS URL configured in Vercel.

The old `/api/webhooks/zrexpress` route and `ProcolisAdapter` alias remain legacy compatibility only; they expect `Tracking`, `id_Externe`, `Situation`, and other Procolis-style fields. Do not send the modern `{ eventType, occurredAt, data }` Svix envelope to that legacy path.

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

### Legacy Procolis-shaped ZR adapter (compatibility only)

Source: `packages/orchestrator/src/carriers/zrexpress.adapter.ts`

- The normalizer unwraps the first item from `Colis: [...]` or a top-level array.
- Tracking number candidates include `Tracking`, `tracking`, `tracking_number`, `id_colis`, `code_suivi`, `barcode`, `id`.
- External order ID candidates include `id_Externe`, `id_externe`, `idExterne`, `order_id`, `external_order_id`, `order_number`, `reference`.
- Customer fields include `Client`, `client`, `customer_name`, `nom`, `destinataire`, `nom_client`; phone fields include `MobileA` / `MobileB` and fallback phone aliases.
- Product candidates include `TProduit`, `tProduit`, `t_produit`, `product_name`, `product`, `produit`, `article`.
- Status candidates include `Situation`, `situation`, `Situation_Colis`, `status`, `statut`, `etat`, `last_status`; reason candidates include `Motif`, `motif`, `motif_retour`, `reason`, `Note`, `note`, `commentaire`.
- Stopdesk detection reads `TypeLivraison`, `type_livraison`, or `typeLivraison`.

### Maystro

New managed integration source:
- Merchant UI: `apps/web/src/app/(dashboard)/merchant/MaystroConnectionPanel.tsx`
- Server actions: `apps/web/src/app/(dashboard)/merchant/maystro-actions.ts`
- Credential encryption: `apps/web/src/lib/maystro-credentials.ts`
- Managed receiver: `apps/web/src/app/api/webhooks/maystro/[endpointToken]/route.ts`
- Provider normalization: `packages/orchestrator/src/carriers/maystro.adapter.ts`
- Migration: `apps/web/src/app/migrations/20261108_maystro_api_webhooks.sql`

Connection contract:
- Merchant obtains the Store API Token from Maystro `Paramètres → Info personnelles`; the server validates it with the read-only wilayas endpoint and AES-256-GCM encrypts it using `CARRIER_CREDENTIALS_ENCRYPTION_KEY`.
- TajerTrack creates a random 256-bit callback URL token per merchant. Maystro's merchant dashboard is configured manually under `Paramètres → Webhooks`; no unverified webhook-endpoint CRUD API is assumed.
- Select `DeliveryInfoUpdated`, `OrderFieldUpdated`, and `OrderDelivered`; use `test` for connection testing. `DeliveryInfoUpdated` refreshes address, wilaya/commune, delivery mode and pricing metadata; it does not create a new shipment-status stage unless the fetched order history contains one. Do not select `all` as the normal production configuration.
- Maystro webhook notifications are not treated as authenticated status truth. The receiver decodes `message.data` from Base64 (one or two layers), uses the order UUID as a lookup key, then fetches the authoritative order and full history.
- Order read: `GET https://backend.maystro-delivery.com/api/stores/orders/{uuid}/`; display/tracking lookup: `GET .../api/stores/orders/?display_id={tracking}`.
- History read: `GET https://b.maystro-delivery.com/api/stores/history_order/{uuid}`.
- Auth header: `Authorization: Token {apiToken}`.
- The normalized order preserves `external_order_id`, customer name/phone, products from `details[].description` and quantity, display/tracking number, wilaya, commune, destination, delivery type, totals, internal Maystro UUID, and chronological history comments/timestamps.
- Numeric Maystro status codes are mapped explicitly. Unknown codes stay `unknown`; never infer them. Duplicate timeline entries are stopped by a stable event hash. Older late-arriving history rows may be inserted but must not roll the current status backwards.
- The first import writes every historical timeline event but suppresses notification fan-out for old steps; only the latest status emits current customer notifications. A new order may still enqueue its one-time order-confirmation job.
- The legacy `POST /api/webhooks/maystro?key=...` remains for compatibility only. New merchants use `/api/webhooks/maystro/{endpointToken}`; never expose the API Token in that URL.
- Apply the Maystro SQL migration before connecting. The webhook is un-signed by Maystro according to the available provider material, so the unpredictable URL token is the receiver's shared secret. A real redacted Maystro test payload is still required to validate the exact envelope before claiming production verification.

## 3. Status normalization and event behavior

EcoTrack API status keys from `get/orders` and `get/orders/status` are handled explicitly by `EcoTrackAdapter.parseEcoTrackStatus()`. Do not replace those exact mappings with fuzzy translations of tenant-specific French display labels. The list endpoint excludes archived orders, so keep the known-tracking status lookup as the separate status-reconciliation step.

The EcoTrack adapter maps the stable native keys (not tenant-specific French labels) to Arabic timeline titles. Its recognized keys follow the published EcoTrack mapping reference: `prete_a_expedier`, `prete_a_preparer`, `order_information_received_by_carrier`, `en_preparation_stock`, `en_ramassage`, `picked`, `accepted_by_carrier`, `vers_hub`, `en_hub`, `vers_wilaya`, `en_preparation`, `dispatched_to_driver`, `attempt_delivery`, `en_livraison`, `suspendu`, delivered/payment keys (`livred`, `livre_non_encaisse`, `encaissed`, `encaisse_non_paye`, `payed`, `paiements_prets`, `paye_et_archive`), return keys (`return_asked`, `return_in_transit`, `return_received`, `retour_chez_livreur`, `retour_transit_entrepot`, `retour_en_traitement`, `retour_recu`, `retour_archive`), and `annule`. Multiple native stages can share the same canonical TajerTrack category; the orchestrator still writes a timeline event when the Arabic stage title changes, even if the canonical category remains unchanged. `notification_on_order` is an informational remark, not a shipment stage, so the polling worker ignores it when a preceding real activity exists and never lets it overwrite the parcel's last real status.

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


## 1C. Zimou Express direct API (read-only polling)

| Purpose | Implementation |
|---|---|
| Merchant connection UI | `apps/web/src/app/(dashboard)/merchant/ZimouConnectionPanel.tsx` |
| Authenticated token validation/save/test/disconnect | `apps/web/src/app/(dashboard)/merchant/zimou-actions.ts` |
| AES-256-GCM credentials | `apps/web/src/lib/zimou-credentials.ts` |
| Background read-only polling | `apps/push-worker/src/zimou-sync.ts` |
| Internal ingestion route | `POST /api/webhooks/zimou/sync` (merchant API key; batch of up to 50) |
| Status normalization | `packages/orchestrator/src/carriers/zimou.adapter.ts` |
| SQL | `apps/web/src/app/migrations/20261108_zimou_readonly_sync.sql` |

Zimou token validation uses `GET https://zimou.express/api/v3/user`. Status polling uses `GET /v3/packages/status` with repeated `packages[]` tracking query parameters. The status response is a map keyed by Zimou tracking code. The worker fetches `/v3/helpers/package-statuses` per merchant because IDs and labels can vary by account; it maps the account's status names and keeps unknown labels as `unknown` rather than assuming a universal numeric ID. The adapter retains Zimou package ID, Zimou tracking code, partner carrier, partner tracking code, address, delivery price, COD amount, delivery type, and raw status. The worker checks only existing TajerTrack orders whose `carrier_name` is `Zimou Express` and `carrier_tracking_number` is populated, in batches of 50 every five minutes by default. It is strictly read-only: no parcel creation, cancellation, dispatch, or discovery of untracked shipments. This is polling, not a native Zimou webhook integration. The linked Feeef Zimou reference documents Feeef's wrapper operations (test, send/sendMany, geo lookups and statistics), not a native Zimou webhook subscription; this integration uses the direct Zimou merchant token instead. Enable `ZIMOU_SYNC_ENABLED=true` and keep `CARRIER_CREDENTIALS_ENCRYPTION_KEY` identical in Vercel and Railway. Apply the migration before connecting.

### Elogistia

| Purpose | Implementation |
|---|---|
| Merchant connection panel | `apps/web/src/app/(dashboard)/merchant/ElogistiaConnectionPanel.tsx` |
| Shipment create form in order details | `apps/web/src/app/(dashboard)/merchant/ElogistiaDispatchPanel.tsx` |
| Authenticated server actions | `apps/web/src/app/(dashboard)/merchant/elogistia-actions.ts` |
| AES-256-GCM credential encryption | `apps/web/src/lib/elogistia-credentials.ts` |
| Provider event normalizer | `packages/orchestrator/src/carriers/elogistia.adapter.ts` |
| Polling worker | `apps/push-worker/src/elogistia-sync.ts` |
| Internal status ingestion | `POST /api/webhooks/elogistia/sync` |
| Migration | `apps/web/src/app/migrations/20261108_elogistia_api_sync.sql` |

Elogistia's API key is passed as query parameter `key` for the wilaya/commune/rates catalogue, and `apiKey` for shipment creation/history. Base URL: `https://api.elogistia.com`. Do not send credentials from the browser. Create a parcel only from an existing order with a nonempty `external_order_id`; this is sent as `IdCommande`. The create fields currently mapped are `name`, `firstname`, `phone`, `address`, `commune`, numeric `wilaya`, `modeDeLivraison` (1 standard / 4 exchange), `price` (COD), `fraisDeLivraison` (from Elogistia's rate table when available), `stop_desk` (1 home / 2 desk), `product`, and `IdCommande`; required `mail` (a real customer email; no fabricated placeholder), and optional `remarque` and `poids` when entered. The home/stopdesk rate from `getShippingCost/` is displayed separately; the create mapping does not send a delivery-fee parameter because the Postman-derived create contract does not establish one. The exact request uses POST with URL query parameters per the Postman-derived adapter.

Shipment creation is protected by a unique `merchant_carrier_dispatch_attempts` row. Confirmed provider rejections can be retried; ambiguous responses/timeouts are not retryable until the merchant checks the Elogistia dashboard by `IdCommande`. The polling worker uses `GET getTracking/?apiKey=...&tracking=...` on tracking numbers already stored for `carrier_name='Elogistia'`, every five minutes by default, with a 1.4-second minimum gap between requests. It reads `Date`, `Statut`, and `Log`, sorts events chronologically, and submits stable event IDs to the shared orchestrator. No native webhook subscription or complete parcel-list endpoint is assumed. The integration does not import shipments created outside TajerTrack. Although secondary adapters mention getOrders, bulk tracking, label and delete endpoints, the current implementation deliberately does not expose discovery, label retrieval, or cancellation pending verification against a real merchant account.


## E-com Delivery v2

| Purpose | Implementation |
|---|---|
| Merchant connection panel | `apps/web/src/app/(dashboard)/merchant/EcomV2ConnectionPanel.tsx` |
| Shipment create form in order details | `apps/web/src/app/(dashboard)/merchant/EcomV2DispatchPanel.tsx` |
| Authenticated server actions | `apps/web/src/app/(dashboard)/merchant/ecom-v2-actions.ts` |
| AES-256-GCM credential encryption | `apps/web/src/lib/ecom-v2-credentials.ts` |
| Provider event normalizer | `packages/orchestrator/src/carriers/ecom-v2.adapter.ts` |
| Polling worker | `apps/push-worker/src/ecom-v2-sync.ts` |
| Internal status ingestion | `POST /api/webhooks/ecom-v2/sync` |
| Migration | `apps/web/src/app/migrations/20261108_ecom_delivery_v2.sql` |

This is **E-com Delivery API v2**, base URL `https://ecom-dz.com/api_v2`; do not confuse it with legacy E-COM Delivery v1 at `ecom-dz.net`. Merchant credentials are `KEY` and `Token` from the E-com dashboard's Développement page, sent as `X-API-Key` and `X-API-Token`. They are encrypted together with AES-256-GCM and merchant AAD `merchantId:ecom-v2:v1`. Apply the migration, keep `CARRIER_CREDENTIALS_ENCRYPTION_KEY` the same in Vercel and Railway, and enable polling with `ECOM_V2_SYNC_ENABLED=true` (default interval 300000 ms; override with `ECOM_V2_SYNC_INTERVAL_MS`).

The documented create request is `POST /colis` with a one-row JSON array and these native fields: `nom_complet`, `mobile_1`, `id_wilaya`, `total`, `stopdesk`, `commune` (home only), `code_stopdesk` (desk only), `article`, `quantite`, optional `adresse`, optional `note_fournisseur`, and `id_externe` (existing TajerTrack `external_order_id`). The response is HTTP 201 even for rejected lines; inspect `resultats[].ok` and only accept a non-empty `resultats[].tracking` if `ok === true`. Recipient name limit: 60; address limit: 100. Without `confirmee: 1`, parcels remain **En Préparation**. TajerTrack intentionally leaves them unconfirmed so the merchant confirms them from E-com's dashboard.

Live catalogues and fees: `GET /wilayas`, `GET /communes?id_wilaya=...`, `GET /stopdesks?id_wilaya=...`, and `GET /tarifs`. Home delivery validates a deliverable commune; stopdesk validates the selected `code_stopdesk`. Rates are displayed separately and are not added silently to COD. A unique `merchant_carrier_dispatch_attempts` row per merchant/order/provider (`ecom_v2`) protects creation: definitive per-line rejection can be retried; timeouts, uncertain results and local-link failures stay locked and must be checked in the E-com dashboard by the same `id_externe` before any retry.

The Railway worker polls `GET /colis/{tracking}` for E-com shipments already linked to TajerTrack orders every five minutes by default. It reads dated `historique` rows, suppresses notifications for older history events, and uses deterministic event IDs on the shared orchestrator path. It does not currently import/discover parcels created independently in E-com. Although E-com's public site advertises webhook capability, no webhook configuration/payload/signature contract has been verified for this V2 connection, so the current implementation uses polling and must not be described as webhook-driven. The V2 API also supports list and pre-confirmation delete operations; those merchant actions are not currently exposed here.
