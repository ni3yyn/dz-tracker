# TajerTrack legal pages and administrator access — production setup

## Required before public signup

1. Apply `apps/web/src/app/migrations/20261111_merchant_legal_acceptances.sql` to the production Supabase database.
2. Deploy the web application only after the migration succeeds. Signup deliberately fails closed if the acceptance record cannot be saved.
3. Configure these server-side variables in Vercel Production (do not prefix them with `NEXT_PUBLIC_`):
   - `ADMIN_USER_ID`: the exact Supabase Auth UUID of the platform administrator. This takes precedence over `ADMIN_EMAIL`.
   - `ADMIN_EMAIL`: compatibility fallback only when `ADMIN_USER_ID` is not set.
   - `LEGAL_OPERATOR_NAME`: full legal name of the person/entity operating TajerTrack.
   - `LEGAL_OPERATOR_ADDRESS`: official contact/business address.
   - `LEGAL_CONTACT_EMAIL`: monitored privacy and legal-request email address.
   - `LEGAL_DPO_EMAIL`: contact address for the appointed data-protection delegate, once appointed.
4. Redeploy after changing variables. Verify that a normal merchant account is redirected away from `/admin` and that direct calls to each admin server action are rejected.

## Administrator security model

- The allowlist is evaluated from the authenticated Supabase user returned on the server. A browser-supplied email, user ID, React state, URL parameter, or modified client bundle is never used as proof of administrator status.
- `ADMIN_USER_ID` is the preferred allowlist key. If it is present, email matching is ignored.
- If neither `ADMIN_USER_ID` nor `ADMIN_EMAIL` is configured, the admin dashboard fails closed and privileged server actions reject the request.
- Middleware redirects are only defense in depth. The server-rendered admin page checks authorization before using the service-role client, and every privileged admin server action repeats the check.
- Do not expose the Supabase service-role key in browser code or public environment variables.

## Legal publication checklist

The policy pages are versioned and the signup action stores the accepted Terms and Privacy versions with a server timestamp. Before opening registration broadly:
- Fill in the operator's legal identity, address, and monitored contact email using the variables above.
- Appoint and publish the appropriate data-protection contact where required.
- Confirm the actual production regions/countries used by Supabase, Vercel, Railway, Telegram, and any connected carrier providers; review cross-border transfers and required safeguards.
- Confirm retention/deletion periods and the division of controller/processor responsibilities with Algerian counsel.
- Review the documents against the service's final production configuration and the amended Algerian personal-data framework.

The page text is a practical product-specific draft, not a legal opinion or a certification of regulatory compliance.
