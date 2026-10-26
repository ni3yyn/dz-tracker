# Algerian Carrier Normalization Matrix

This reference documents exact raw status payloads from Algerian couriers and how they map to standard DZ Tracking statuses.

---

## 1. Yalidine Express Adapter (Guepex API Engine)

- **Official Base URLs**: `https://api.yalidine.app/v1` and `https://api.guepex.app/v1`
- **Authentication**: `X-API-ID`, `X-API-TOKEN`, `X-Yalidine-Secret` ("Clé secrète Webhook" configured in *Développement ➔ Gérer les Webhooks*).
- **Stopdesk Bureau Detection**: `is_stopdesk` (`true` or `1`), `stopdesk_name`, `agency_name`, `bureau`.

| Raw Status (`tracking.status`) | Reason / Motif (`tracking.reason`) | Standard Status | Triggers | Notes & Fields |
|---|---|---|---|---|
| `Nouveau` / `En attente` / `En préparation` | - | `order_created` | - | Parcel registered in merchant center |
| `Récupéré` / `En transit` / `Ramassé` | - | `dispatched` | - | Handed over at merchant depot |
| `Vers Wilaya` / `Transfert inter-wilayas` | - | `in_transit` | - | Moving between regional hubs |
| `Sorti en livraison` / `En cours de livraison` | - | `out_for_delivery` | - | Courier has parcel in van |
| `Disponible au bureau` / `En attente de retrait` | - | `ready_for_pickup` | Stopdesk Bureau Alert | `is_stopdesk: true` or arrived at `stopdesk_name` |
| `Tentative Échouée` / `Tentative Echouee` | `Client ne répond pas` / `Injoignable` / `Client absent (échoué)` | `attempt_failed_no_answer` | WhatsApp Recovery Alert | Courier made contact call, no pickup / customer absent |
| `Tentative Échouée` | `Numéro erroné` / `Téléphone fermé` | `attempt_failed_unreachable` | WhatsApp Recovery Alert | Invalid phone or out of coverage |
| `Tentative Échouée` | `Reporté par le client` / `Client demande report` | `attempt_failed_rescheduled` | Reschedule Notification | Customer asked to postpone |
| `Livré` / `Livre` / `Encaissement effectué` | - | `delivered` | Post-Purchase Review Link | Cash collected successfully |
| `Retourné au centre` / `Retour expéditeur` | - | `returned` | COD Return Logged | Return package moving back to store |

---

## 2. EcoTrack Multi-Courier Network (80+ Wilaya Couriers)

- **Universal Public Tracking Portal**: `https://suivi.ecotrack.dz/suivi/{tracking_code}`
- **Verified Subdomains**:
  - `conexlog.ecotrack.dz` (Conexlog / UPS Algeria Exclusive Agent)
  - `dhd.ecotrack.dz` (DHD Express)
  - `rex.ecotrack.dz` (Rex Livraison)
  - `speeddelivery.ecotrack.dz` (Speed Delivery)
  - `rblivraison.ecotrack.dz` (RB Livraison)
  - `msmgo.ecotrack.dz` (MSM Go)
  - `areex.ecotrack.dz` (Areex)
  - `prest.ecotrack.dz` (Prest)
  - `rocketdelivery.ecotrack.dz` (Rocket Delivery)
  - `worldexpress.ecotrack.dz` (World Express)
  - `anderson.ecotrack.dz` (Anderson Delivery)
  - `coyote.ecotrack.dz` (Coyote Express)
  - `salva.ecotrack.dz` (Salva Delivery)
- **Endpoints**: `POST /api/v1/create/order`, `GET /api/v1/get/fees`, `GET /api/v1/get/order/label?tracking={code}`. *(Note: EcoTrack does not provide a getOrder endpoint; updates are entirely webhook-driven).*

| Raw Status Payload | Inferred Standard Status | Inferred Courier Attribution |
|---|---|---|
| `CREATION` / `PENDING` | `order_created` | From `carrier_name` / `provider` header |
| `EXPEDIE` / `TRANSIT` / `CENTRE` | `in_transit` | Dynamic provider name |
| `DISTRIBUTION` / `EN_DISTRIBUTION` | `out_for_delivery` | Dynamic provider name |
| `EN_BUREAU` / `STOPDESK` | `ready_for_pickup` | Stopdesk Bureau Address |
| `ECHEC_CLIENT_INJOIGNABLE` | `attempt_failed_no_answer` | WhatsApp Recovery Alert |
| `ECHEC_HORS_ZONE` | `attempt_failed_unreachable` | WhatsApp Recovery Alert |
| `LIVRE` / `SOLDE` | `delivered` | Success Webhook |
| `RETOUR_DEFINITIF` | `returned` | Carrier Return |

---

## 3. ZR Express Adapter (Procolis API Engine - `procolis.com/api_v1`)

- **Credentials Test**: `GET https://procolis.com/api_v1/token` ➔ `{ Statut: "Accès activé" }`
- **Duplicate Prevention**: `MessageRetour: "Double Tracking"`
- **Rate Calculation**: `POST https://procolis.com/api_v1/tarification` (All 58 wilayas)

| Raw Situation (`Situation` / `Statut`) | Motif / Note (`Motif`) | Standard Status | Triggers | Notes & Procolis Fields |
|---|---|---|---|---|
| `Créé` / `Prêt à expédier` / `En attente` | - | `processing` | - | `Confrimee: 1` creates direct ready parcel |
| `Ramassé` / `Reçu au centre` | - | `dispatched` | - | Handed over to ZR Express courier |
| `En transit` / `Vers wilaya` | - | `in_transit` | - | Moving to destination `IDWilaya` hub |
| `Au bureau` / `En agence` / `Stopdesk` | - | `ready_for_pickup` | Stopdesk Bureau Alert | `TypeLivraison: "1"` (Stopdesk pickup) |
| `En cours de livraison` / `Sorti` | - | `out_for_delivery` | - | Courier on route to `Adresse` |
| `Tentative échouée` / `Echec livraison` | `Client ne répond pas` / `Injoignable` | `attempt_failed_no_answer` | WhatsApp Recovery Alert | Checks `MobileA` and `MobileB` |
| `Tentative échouée` | `Téléphone éteint` / `Hors zone` | `attempt_failed_unreachable` | WhatsApp Recovery Alert | Invalid phone or off |
| `Tentative échouée` / `Reporté` | `Reporté par client` | `postponed` | Reschedule Notification | Delivery postponed |
| `Livré` / `Soldé` / `Encaissé` | - | `delivered` | Review Link | Cash `Total` collected |
| `Retourné` / `Retour expéditeur` | `Refusé` / `Annulé` | `returned` | COD Return Logged | Parcel heading back to merchant |

---

## 4. Odoo ERP Integration (DZ Yalidine Connector / Digitaliac)

- **Connector Endpoint**: `/api/webhooks/odoo`
- **Field Mappings**:
  - `carrier_tracking_ref` ➔ `carrierTrackingNumber`
  - `origin` / `sale_order` ➔ `externalOrderId`
  - `partner_name` / `partner_id` ➔ `customerName`
  - `carrier_name` / `delivery_type` ➔ Dynamic router to Yalidine, ZR Express, or EcoTrack adapters.

---

## 5. Maystro Delivery Adapter (`backend.maystro-delivery.com/api/`)

- **Connector Endpoint**: `/api/webhooks/maystro`
- **Authentication**: `Authorization: Token <token>` or `x-api-key` or `?key=<apiKey>`
- **Stopdesk Detection**: `delivery_type: 1` (`0` = Domicile, `1` = Point de retrait / Stopdesk)
- **Wilaya Mapping**: Integer IDs 1 to 58 mapped to canonical Algerian wilaya names.

| Raw Status (`status`) | Reason / Note (`reason` / `note_to_driver`) | Standard Status | Triggers | Notes & Maystro Fields |
|---|---|---|---|---|
| `created` / `draft` / `starter` | - | `processing` | - | Parcel created in Maystro merchant portal |
| `ramasse` / `picked_up` / `collecte` | - | `dispatched` | - | Courier picked up parcel from merchant |
| `in_transit` / `en_transit` / `vers` | - | `in_transit` | - | Moving across wilayas to destination hub |
| `point_de_retrait` / `stopdesk` / `au_bureau` | - | `ready_for_pickup` | Stopdesk Pickup Alert | `delivery_type: 1` ready at pickup branch |
| `hub` / `centre_tri` / `arrive` | - | `at_local_hub` | - | Arrived at local destination wilaya hub |
| `en_cours_de_livraison` / `dispatch` | - | `out_for_delivery` | - | Courier out with package for delivery |
| `client_ne_repond_pas` / `injoignable` | `repond_pas` / `absent` / `ferme` | `attempt_failed_no_answer` | WhatsApp Recovery Alert | Generates 1-click WhatsApp retry link |
| `reporte` / `postponed` | `demande_client` | `postponed` | Reschedule Notification | Customer postponed delivery |
| `livre` / `delivered` / `paye` | - | `delivered` | Review / Thank You Link | Delivery completed and COD paid |
| `retourne` / `returned` / `annule` | `refus` / `annule` | `returned` | COD Return Logged | Parcel moving back to seller |

---

## 6. Field Notes & Operational Traps (from Live DZBuild / dzship Operations)

### A. The 2026 69-Wilaya Division Trap (Loi n° 26-06)
- On April 4, 2026, Algeria legally created 11 new wilayas (codes 59 to 69).
- **CRITICAL TRAP**: **ZERO Algerian couriers accept wilaya codes > 58.** Article 54 keeps parent wilayas running logistics until December 31, 2026. Sending `wilayaCode: 68` causes parcels to be rejected.
- **The Solution (`shipAs`)**:
  - `59` Aflou (أفلو) ➔ ship as `3` (Laghouat)
  - `60` Barika (بريكة) ➔ ship as `5` (Batna)
  - `61` El Kantara (القنطرة) ➔ ship as `7` (Biskra)
  - `62` Bir El Ater (بئر العاتر) ➔ ship as `12` (Tébessa)
  - `63` El Aricha (العريشة) ➔ ship as `13` (Tlemcen)
  - `64` Ksar Chellala (قصر الشلالة) ➔ ship as `14` (Tiaret)
  - `65` Aïn Ouessara (عين وسارة) ➔ ship as `17` (Djelfa)
  - `66` Messaad (مسعد) ➔ ship as `17` (Djelfa)
  - `67` Ksar El Boukhari (قصر البخاري) ➔ ship as `26` (Médéa)
  - `68` Bou Saâda (بوسعادة) ➔ ship as `28` (M'Sila)
  - `69` El Abiodh Sidi Cheikh (الأبيض سيدي الشيخ) ➔ ship as `32` (El Bayadh)

### B. `delivery_attempted` is the "Money Status"
- *“The courier tried, the customer didn't pick up. Stores that call the customer within the hour recover a large share of these; stores that wait for the courier's second attempt mostly get returns.”*
- In DZ Tracker, this triggers the **COD Risk Radar** and generates the **1-Click WhatsApp Rescue link** immediately.

### C. NOEST Express Trap: Draft vs. Validated
- Creating a parcel on NOEST puts it in a draft state. Without an explicit secondary validation step, logistics never schedules pickup and parcels sit stranded indefinitely.

### D. Maystro Delivery Anti-Duplicate Policy
- Maystro automatically rejects duplicate orders for the same customer name + phone on the same calendar day.

### E. Complete 82 EcoTrack Network Directory
All run on the EcoTrack engine and accept unified tracking webhooks:
`48hrlivraison`, `abdelivery`, `alania`, `allolivraison`, `amana`, `andersondelivery`, `aranex`, `areex`, `assildelivery`, `atlasexpress`, `baconsult`, `bfkexpress`, `boogi`, `championlogistics`, `chronorex`, `cirtaexpress`, `colex`, `colireli`, `colizone`, `conexlog`, `coyoteexpress`, `delivromail`, `dhd`, `distazero`, `ecorapideexpress`, `elguidedelivery`, `expediachrono`, `fasthorse`, `fretdirect`, `fzdelivery`, `golivri`, `gsecommerce`, `hhdexpress`, `imir`, `jaguar`, `joexpress`, `lihlihexpress`, `lynx`, `majorex`, `mazaya`, `medexpress`, `monohub`, `msmgo`, `navexdelivery`, `negmarexpress`, `oksbox`, `omexpress`, `ontimeexpress`, `oneexpress`, `ovred`, `packers`, `pdex`, `prest`, `quickdeliverydz`, `rblivraison`, `redex`, `rexlivraison`, `rihalexpress`, `rj360express`, `rmexpress`, `rocketdelivery`, `royaumedelivery`, `rsexpress`, `rutaexpress`, `salvadelivery`, `samex`, `sbl`, `siexpress`, `speeddelivery`, `speedmail`, `sultancolisexpress`, `swiftexpress`, `tawsilstar`, `tslexpress`, `ultraexpress`, `univerdelivery`, `vitrans`, `wassimexpress`, `weeweedelivery`, `windelivery`, `worldexpress`, `zinyatec`.


