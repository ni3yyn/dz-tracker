# TajerTrack Android SIM SMS Gateway

This lightweight Termux agent lets one dedicated Android SIM send the single tracking-link SMS created for each newly inserted order. TajerTrack keeps the durable queue and idempotency; the phone only claims a job and asks Android to submit the SMS.

## Backend setup

1. Apply `apps/web/src/app/migrations/20261112_android_sms_gateway.sql` in the Supabase SQL editor.
2. Generate a random secret of at least 32 characters on your computer:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
3. Add the generated value to the **Vercel Production** environment as `SMS_GATEWAY_DEVICE_TOKEN`, then redeploy the web app.
4. Merchants can then enable **SMS tracking link** in Settings. Only orders inserted after the switch is enabled are queued. Existing orders are not backfilled.

The secret is a device credential, not a Supabase key. Never put a Supabase service-role key on the phone.

## Android / Termux setup

1. Install **Termux** and **Termux:API** from the same trusted source (F-Droid or the official Termux GitHub releases). Do not mix app sources/signatures.
2. Open Termux and run:
   ```bash
   pkg update -y
   pkg install -y python termux-api
   ```
3. Open the separate **Termux:API** Android app once, grant its SMS permission, and allow Termux notifications.
4. Copy `agent.py` to the phone, for example into `~/tajertrack-sms/agent.py`.
5. Store the environment values in a private file (replace the example token):
   ```bash
   cat > ~/.tajertrack-sms.env <<'EOF'
   export TAJERTRACK_BASE_URL="https://tajertrack.vercel.app"
   export TAJERTRACK_DEVICE_TOKEN="PASTE_THE_VERCEL_SECRET_HERE"
   export TAJERTRACK_POLL_SECONDS="10"
   EOF
   chmod 600 ~/.tajertrack-sms.env
   ```
6. Load the settings and test the Android SMS command with your own number first:
   ```bash
   source ~/.tajertrack-sms.env
   termux-sms-send -n +213XXXXXXXXX "TajerTrack gateway test"
   ```
7. Start the agent:
   ```bash
   python ~/tajertrack-sms/agent.py
   ```

### Optional: start automatically after phone reboot

1. Install **Termux:Boot** from the same source/signature as Termux, then open Termux:Boot once.
2. Create the boot script:
   ```bash
   mkdir -p ~/.termux/boot
   cat > ~/.termux/boot/start-tajertrack-sms <<'EOF'
   #!/data/data/com.termux/files/usr/bin/sh
   termux-wake-lock
   . "$HOME/.tajertrack-sms.env"
   mkdir -p "$HOME/tajertrack-sms"
   exec python "$HOME/tajertrack-sms/agent.py" >> "$HOME/tajertrack-sms/gateway.log" 2>&1
   EOF
   chmod +x ~/.termux/boot/start-tajertrack-sms
   ```
3. Restart the phone once to verify the agent starts. Keep Termux and Termux:Boot battery usage unrestricted.

The boot script starts the gateway after Android finishes booting. A powered-off phone still cannot send SMS; queued jobs resume when it is back online.

## Phone settings

- Set Termux battery usage to **Unrestricted**.
- Permit background activity and notifications for Termux and Termux:API.
- Keep the phone powered on, SIM active, and mobile network available. Wi-Fi can provide the internet connection to receive jobs.
- You can lock the screen and use the phone normally. A Termux wake lock helps prevent idle suspension; it does not help when the phone is powered off.
- Use a dedicated TajerTrack SIM rather than your personal number.

## Delivery semantics and safety

- A database trigger creates at most one SMS job per order. It does not send for order updates or exchange replacement records.
- The SMS is a short Latin/GSM-7 message with the tracking URL, designed to fit in one standard 160-character segment with the current TajerTrack URL.
- `submitted` means Termux:API returned success and Android accepted the send request. It is **not** proof that the recipient handset received the SMS. This first version does not collect network delivery receipts.
- The agent stores a small SQLite journal on the phone. If the process dies after a send may have started but before its result is saved, it reports `unknown` and will not automatically send the same job again. This favours avoiding duplicate customer messages over automatic recovery.
- Definite Termux command failures are retried up to three attempts. A job whose processing lease expires without a report is marked `unknown` for review instead of being resent.
- The customer's reply path is the SIM number in the phone. Incoming replies remain ordinary SMS on the device; this agent does not auto-reply or read incoming messages.
- Carrier terms and the SIM plan still apply. Confirm that the operator permits automated transactional business SMS before production use.

## Troubleshooting

- `401 Unauthorized`: the Vercel and phone device tokens do not match.
- `503 SMS gateway is not configured`: set `SMS_GATEWAY_DEVICE_TOKEN` in Vercel and redeploy.
- `termux-sms-send is missing`: install both the Termux:API Android app and the `termux-api` package inside Termux.
- Permission error: open Android Settings → Apps → Termux:API → Permissions → SMS, and allow it.
- No jobs are claimed: confirm the SQL migration is applied and a merchant has enabled SMS tracking before a new order is inserted.
