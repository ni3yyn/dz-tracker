# تاجر تراك — Public screens update

## Updated routes
- `/`: public homepage with product preview, workflow, capabilities, FAQ, and signup calls to action.
- `/login`: dedicated login screen.
- `/register`: dedicated merchant registration screen.

## Shared auth behavior
- Login and registration share one responsive auth component and a consistent visual system.
- Registration requires a store name, validates password confirmation in the UI and server action, and shows an email-confirmation state when Supabase requires it.
- Password visibility can be toggled; forms include labels, browser validation, focus styling, loading states, and Arabic user-facing errors.
- Existing Supabase login/signup actions and redirect destinations remain in use.

## Build note
The supplied source archive does not include the full application workspace, package manifest, global stylesheet, or all imported backend packages. Validate with the complete repository before deployment.


## Homepage density and motion pass
- Added a custom SVG delivery-route strip with three shipment stages, mirrored for Arabic RTL reading order.
- Replaced feature cards with an open editorial list: numbered labels, bespoke route-line SVG illustrations, and curved SVG dividers.
- Added progressive scroll reveals for major sections, workflow steps, feature rows, FAQ items, and calls to action. Reveals use IntersectionObserver, fall back to visible content without JavaScript/observer support, and respect reduced-motion preferences.
- Tightened feature spacing across desktop and mobile while preserving the open, shadowless style.


## Product positioning update
- Homepage and auth-side copy now reflect تاجر تراك's actual workflow: merchant registration, SDK or Webhook integration, Telegram tracking URLs, and manual or connected-carrier status updates.
- Added a four-touchpoint integration flow and bespoke SVG motifs for SDK/Webhook, Telegram, carrier network, and status synchronization.
- Messaging describes the 80+ wired Algerian delivery-company network and names Yalidine / ZR Express as examples, without implying that every carrier syncs statuses unless connected.
- FAQ clarifies Telegram as the current tracking-link channel and WhatsApp as planned, not available yet.
