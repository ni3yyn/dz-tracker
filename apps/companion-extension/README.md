# TajerTrack Companion (Chrome / Edge)

TajerTrack Companion captures only customer identity fields included in a merchant-authorized Guepex/Yalidine parcel-creation request. It does not read cookies, passwords, API credentials, or unrelated browsing activity.

## Install

1. Download and extract tajertrack-companion.zip.
2. Open chrome://extensions (or edge://extensions).
3. Enable Developer mode.
4. Choose Load unpacked and select the extracted folder containing manifest.json.
5. Return to TajerTrack → Integrations → Yalidine / Guepex, choose إعادة التحقق, then ربط الإضافة بهذا المتجر.

This is a developer-mode ZIP package, not a Chrome Web Store listing. The manifest includes the extension's public identity so TajerTrack can detect this exact installation through Chrome's externally_connectable messaging API.

## What it captures

The extension observes POST requests to the Guepex/Yalidine parcel-creation API route (/v1/parcels) and the Guepex ecommerce form endpoint (/app/colis/ajouter-ecommerce.php). For the Guepex form, it parses multipart/form-data fields such as firstname, familyname, contact_phone_1, and order_id. It extracts an order reference, customer name, unmasked phone, optional tracking reference, and optional product name. The original request body, CSRF token, files, and unrelated fields are never forwarded or stored. Masked identity fragments are discarded.

## Security

- The page can message only the exact extension ID and only from TajerTrack production or local development origins.
- Each installation creates an ECDSA P-256 key pair. The private key remains in extension storage; pairing and capture messages are signed.
- TajerTrack verifies the signature, merchant pairing, timestamp, and one-use capture nonce.
- The extension sends captured fields only to TajerTrack. It does not access carrier cookies, passwords, API tokens, or webhook secrets.
- Pending customer captures expire after seven days and are deleted after matching an order.

## Limitations

The extension can capture only data present in an observed browser POST request. If the Guepex dashboard changes its form fields or creates parcels server-side, the parser must be adapted. It cannot retrieve old masked records or reverse Guepex's masking. Live validation against the actual Guepex dashboard is still required before relying on capture in production.
