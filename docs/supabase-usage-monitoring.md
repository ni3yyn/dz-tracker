# Supabase usage monitor setup

The admin dashboard combines three kinds of information:

1. Supabase Management API request-count samples (REST, Auth, Realtime and Storage).
2. A live PostgreSQL database-size measurement from `pg_database_size`.
3. Egress figures manually recorded from the official Supabase Organization Usage page.

## Vercel environment variables

Set these in the **Production** environment, then redeploy:

- `SUPABASE_MANAGEMENT_API_TOKEN`: a fine-grained Supabase personal access token with **Usage Analytics → Read** (`analytics_usage_read`) scoped to the TajerTrack project.
- `SUPABASE_PLAN_TIER`: one of `free`, `pro`, `team`, or `enterprise`. This controls which published included quotas are shown; it does not infer the plan.
- `SUPABASE_PROJECT_REF`: optional if `NEXT_PUBLIC_SUPABASE_URL` uses the standard `<project-ref>.supabase.co` or `<project-ref>.supabase.in` hostname.

The Management API token is only read by the server-side admin route. Never put it in a `NEXT_PUBLIC_*` variable or source control.

## Database size migration

Apply this SQL migration in Supabase SQL Editor:

`apps/web/src/app/migrations/20261112_admin_database_size_monitor.sql`

It creates `public.admin_get_database_size()`, a read-only `SECURITY DEFINER` function that sums `pg_database_size(datname)` across the PostgreSQL cluster. Execute permission is revoked from PUBLIC, anon and authenticated, and granted only to service_role. The function is called by the admin-only server route using the server-side service-role client.

Database-size readings are cached for one hour because Supabase documents database size/disk reports as daily metrics. It measures database data size; this is not the same as provisioned disk usage, which also includes WAL and system files.

## Egress figures

Supabase's documented Management API request-count endpoint does not return billing egress. The dashboard therefore does not estimate it from request counts.

To record actual figures:

1. Open https://supabase.com/dashboard/org/_/usage
2. Select the TajerTrack project in the project filter (not the organization aggregate, unless auditing the whole organization).
3. Select the current billing period.
4. Enter the **Uncached Egress** and **Cached Egress** values, plus the billing-period dates, in Admin → Platform Usage.

Those egress values are stored in the current browser's local storage and are included in the copyable audit report. They are not uploaded to TajerTrack's database.

Supabase measures cached and uncached egress separately. Organization usage can include other active or recently active projects, so selecting TajerTrack matters when auditing this project alone.

## What the dashboard measures

The Management API route calls:

`GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts?interval=1day`

It displays REST, Auth, Realtime and Storage request samples returned by Supabase. Treat the timestamps as the returned sample range, not as a count of days. The server caches this API response for five minutes, while the dashboard refreshes at most every fifteen minutes while visible.

Request counts are not egress bytes and are not equivalent to monthly billable egress. Database size from SQL is also a point-in-time project measurement; billing database-size usage may use average daily usage across a billing cycle and organization projects.

## Idle worker request reduction

The queue consumers now back off when there is no work, then return to their configured base interval as soon as they claim a job:

- Web Push: idle polling backs off to a maximum of 15 seconds.
- Telegram tracking and confirmation: each idle queue backs off to a maximum of 15 seconds.
- Android SMS gateway: idle polling backs off to a maximum of 30 seconds (the configured poll interval remains the starting interval).
- The SMS claim route combines the device heartbeat update and enabled-state read into one database round-trip.

These delays apply only while queues are empty or paused. They are intended to reduce idle REST/Database traffic; they do not turn the queues off. New jobs are picked up within the respective maximum idle interval, and active queues are drained without the idle delay. The Android agent source in `tools/android-sms-gateway/agent.py` must be refreshed on the phone for its new backoff behavior to take effect.

## Copying an audit report

Use **نسخ تقرير التدقيق** to copy:

- Project ref and selected plan.
- Database size, byte count, measurement time and SQL method.
- Manually recorded cached/uncached egress and period dates.
- API request totals and the range of returned samples.
- Published quota reference values and scope caveats.

The report is designed to be pasted into an audit conversation. Do not include the Management API token or any service-role secret.
