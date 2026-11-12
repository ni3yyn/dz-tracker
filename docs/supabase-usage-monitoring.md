# Supabase usage monitor setup

The admin dashboard can display Supabase's API request usage buckets using the Supabase Management API.

## Vercel environment variables

Set these in the **Production** environment, then redeploy:

- `SUPABASE_MANAGEMENT_API_TOKEN`: a fine-grained Supabase personal access token with **Usage Analytics → Read** (`analytics_usage_read`) scoped to the TajerTrack project.
- `SUPABASE_PLAN_TIER`: one of `free`, `pro`, `team`, or `enterprise`. This controls which published included quotas are shown; it does not infer the plan.
- `SUPABASE_PROJECT_REF`: optional if `NEXT_PUBLIC_SUPABASE_URL` uses the standard `<project-ref>.supabase.co` or `<project-ref>.supabase.in` hostname.

The token is only read by the server-side admin route. Never put it in a `NEXT_PUBLIC_*` variable, client code, or source control.

## What the dashboard measures

The route calls:

`GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts?interval=1day`

It displays the REST, Auth, Realtime and Storage API request buckets returned by Supabase. The server caches this API response for five minutes, while the dashboard refreshes at most every fifteen minutes while visible.

These request counts are not a monthly request quota and are not equivalent to billable egress, storage size, MAU, Edge Function invocations or Realtime messages. Supabase applies most included allowances at the organization level. Use the official organization Usage page for the actual billed usage and quota consumption:

https://supabase.com/dashboard/org/_/usage

The included quota values shown in the dashboard are published Free and Pro/Team allowances. Enterprise limits are contract-specific.
