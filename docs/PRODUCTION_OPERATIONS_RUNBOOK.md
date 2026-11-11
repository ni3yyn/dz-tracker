# TajerTrack production operations runbook

Internal operator guide. This is not a public SLA or a promise of customer response times.

## 1. What to monitor

Start with five signals. Check these from Vercel, Railway and the Supabase dashboard; the SQL checks below can be run in Supabase SQL Editor.

| Signal | Healthy | Investigate when |
|---|---|---|
| Web app | Latest Vercel production deployment is Ready; homepage, login, merchant dashboard and a known tracking URL load | Production deployment fails, 5xx errors spike, or core pages stop loading |
| Telegram worker | Railway service is running with one active MTProto session | Restart loop, lease is repeatedly lost, authentication error, or pending queue keeps growing |
| Web Push worker | Railway service is running and the worker switch is enabled | Restart loop, missing/invalid VAPID configuration, expired subscriptions spike, or pending queue keeps growing |
| Delivery queues | Pending/retry jobs are being worked through; dead-letter count is normally zero or stable and understood | Oldest pending job exceeds 10 minutes, expired worker leases accumulate, or dead-letter jobs increase |
| Courier connections | Enabled integrations show recent successful syncs or webhook receipts/processing | Repeated errors, a connected polling integration stops succeeding, or received webhooks are not processed |

Do not treat Telegram jobs marked `skipped` as a platform outage. Some customers cannot be resolved on Telegram or have privacy settings that prevent discovery. Investigate rising `failed` or `dead_letter` jobs instead.

### Queue health SQL

Run this in Supabase SQL Editor. It summarizes the three asynchronous delivery queues without exposing customer details.

```sql
SELECT 'telegram_tracking' AS queue, status, COUNT(*) AS jobs,
       MIN(created_at) FILTER (WHERE status IN ('pending', 'retry')) AS oldest_waiting,
       COUNT(*) FILTER (WHERE status = 'processing' AND lease_expires_at < NOW()) AS expired_leases
FROM public.telegram_tracking_outbox
GROUP BY status
UNION ALL
SELECT 'order_confirmation', status, COUNT(*),
       MIN(created_at) FILTER (WHERE status IN ('pending', 'retry')),
       COUNT(*) FILTER (WHERE status = 'processing' AND lease_expires_at < NOW())
FROM public.order_confirmation_outbox
GROUP BY status
UNION ALL
SELECT 'web_push', status, COUNT(*),
       MIN(created_at) FILTER (WHERE status IN ('pending', 'retry')),
       COUNT(*) FILTER (WHERE status = 'processing' AND lease_expires_at < NOW())
FROM public.web_push_outbox
GROUP BY status
ORDER BY queue, status;
```

Interpretation:
- `pending` / `retry`: should move down as workers run; investigate old jobs.
- `dead_letter`: requires inspection of the last error before any manual retry.
- `processing` with an expired lease: the worker may have crashed or lost its lease.
- `sent`, `skipped`, `cancelled`: normally terminal states, not backlog.

### Courier health SQL

```sql
SELECT provider, merchant_id, sync_enabled,
       last_sync_at, last_success_at, last_error, last_error_at,
       last_webhook_received_at, last_webhook_processed_at
FROM public.merchant_carrier_integrations
WHERE sync_enabled
ORDER BY COALESCE(last_error_at, last_sync_at, connected_at) DESC;
```

For polling providers, compare `last_success_at` with their configured polling interval. For webhook providers, compare received and processed timestamps. A provider with no new parcels may legitimately have no recent webhook; do not label it broken solely because no new event arrived.

### Quota reconciliation SQL

```sql
SELECT m.id, m.store_name, m.subscription_tier,
       m.monthly_orders_used AS stored_usage,
       usage.expected_usage
FROM public.merchants AS m
CROSS JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS expected_usage
  FROM public.merchant_order_usage_events AS o
  WHERE o.merchant_id = m.id
    AND o.created_at >= CASE
      WHEN COALESCE(m.subscription_tier, 'starter') = 'starter'
        OR m.subscription_expires_at IS NULL
      THEN NOW() - INTERVAL '30 days'
      ELSE m.subscription_expires_at - INTERVAL '30 days'
    END
) AS usage
WHERE m.monthly_orders_used IS DISTINCT FROM usage.expected_usage;
```

After the atomic quota migration is deployed, this query should normally return no rows. Usage events remain counted if an order is later deleted. It is a diagnostic check; do not manually update counters to hide a mismatch.

## 2. A lightweight operating rhythm

**Daily (about five minutes):**
1. Check Vercel's latest production deployment and error summary.
2. Check both Railway worker services for restarts, authentication errors and disabled switches.
3. Run the queue-health query. Investigate old pending/retry jobs and any new dead letters.
4. Check courier errors only for integrations marked enabled.

**Weekly:**
1. Confirm Supabase backups are completing and review database/storage usage.
2. Review dead-letter jobs and recurring provider errors; record the cause and corrective action.
3. Create one controlled test order and verify ingestion, tracking page, status update and notification path. Use a test merchant/order, not a real customer's details.
4. Verify the administrator account still has MFA and that no secrets were exposed in logs or support messages.

**Alert immediately:**
- Vercel production is down or a production deployment fails and the live service is affected.
- Either worker is stopped/restarting repeatedly, or its queue backlog is growing.
- Database connection failures, unexpected data loss, cross-merchant data exposure, leaked API credentials, or suspicious admin activity.
- A queue's dead-letter count rises suddenly or pending jobs age beyond 10 minutes.

The 10-minute queue threshold is an initial operator warning threshold, not a customer-facing delivery guarantee. Adjust it after observing normal workload.

## 3. Basic support procedure

Use one monitored inbox or support channel. Publish it only after someone is responsible for checking it. The legal contact address is not automatically a support inbox.

For each report, record:
- Merchant/store name and account email.
- Time of occurrence in Algeria time.
- Affected feature: order intake, tracking page, courier sync, Telegram, browser push, billing or login.
- Order's external reference or tracking UUID. Mask customer phone numbers.
- What the merchant expected, what happened instead, and whether it affects one order or all orders.
- A screenshot with customer phone numbers, addresses, API keys and tokens hidden.

Never ask a merchant to send passwords, API keys, Telegram sessions, VAPID private keys or courier access tokens through support chat. Never put them in GitHub issues or logs.

### Severity and first response

| Level | Example | Action |
|---|---|---|
| Critical | Suspected data exposure, unauthorized admin access, database unavailable, or all order intake down | Treat as an incident; contain access or disable the affected integration, preserve logs, investigate before restoring |
| High | A core workflow is broken for multiple merchants, or a worker queue is accumulating | Investigate immediately; identify affected services and use a controlled workaround |
| Normal | One merchant's courier connection, notification or order is failing | Reproduce with a test order, inspect that merchant's connection and queue error, then fix/retry |
| Low | How-to question, cosmetic issue or feature request | Answer with the relevant steps or add it to the product backlog |

### Incident handling sequence

1. **Acknowledge:** confirm receipt and ask only for the missing non-secret diagnostic details.
2. **Scope:** determine whether the issue affects one order, one merchant, one provider or the whole platform.
3. **Contain:** pause only the affected integration/worker path if it risks corrupting data or repeating harmful actions. Do not disable all notifications for an isolated failure.
4. **Diagnose:** check the relevant Vercel/Railway logs, queue row's error code, timestamps, and provider connection state.
5. **Recover:** fix the root cause, then retry only the affected failed jobs. Avoid bulk replaying a queue.
6. **Verify:** confirm the order status, tracking page and expected notification with a controlled test.
7. **Close:** tell the merchant what was fixed, what they should do next, and record the root cause internally.

For a suspected security incident, rotate the affected credential, invalidate the exposed session/key, preserve relevant audit logs, and assess whether personal data was accessed. Do not delete evidence before understanding the incident.

### Quick diagnosis

- **Telegram delivery stopped:** check Railway Telegram service, its lease/heartbeat and queue errors. For `AUTH_KEY_DUPLICATED`, ensure only one process is using the MTProto session; stop any local duplicate worker before restarting production.
- **Web Push stopped:** check Railway push service, worker enable switch, VAPID public/private key pairing and expired endpoint responses. Test with a browser subscription that is still active.
- **Courier status stopped:** check the merchant's enabled connection, credential validation, last sync/error or webhook received/processed timestamps. Reconnect only the affected provider and use its test event before resuming.
- **Order did not appear:** check the webhook response, stable external order ID, merchant API key validity, subscription status/limit, and whether the event was deduplicated.
- **Wrong or duplicate order:** preserve the external order reference and tracking UUID, inspect the order identity fields and provider payload, and do not delete records until the correct matching relationship is understood.

## 4. Support reply templates

**Receipt (Arabic):**

> وصلنا بلاغك، شكراً لإبلاغنا. نراجع المشكلة الآن. أرسل لنا رقم الطلب أو رابط التتبّع ووقت حدوثها، مع إخفاء رقم هاتف الزبون وأي بيانات سرية.

**Resolved (Arabic):**

> تم إصلاح المشكلة والتحقق من عودة الخدمة. حدّث الصفحة وأعد المحاولة، وأخبرنا إذا استمرت المشكلة.

Do not promise a response time or uptime SLA until one is deliberately defined and can be met.
