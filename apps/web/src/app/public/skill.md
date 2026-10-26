# تاجر تراك TajerTrack — integration skill for coding agents

You are integrating a merchant's existing website with تاجر تراك. Follow this guide and the installed SDK's own documentation. Do not invent SDK methods or payload fields.

## 1. Inspect before changing code

- Inspect the repository, package manager, framework, existing order model, and the exact point where an order is created or confirmed.
- Install the SDK if it is not already installed: `npm install dz-tracker-sdk` (use the equivalent command for the repository's package manager if necessary).
- Read the installed package's README, exported types, and examples. Use only methods and payload fields that actually exist in the installed version.

## 2. Keep the merchant key server-side

- Use the merchant API key provided in the integration prompt.
- Store it in a server-only environment variable such as `DZ_TRACKER_API_KEY`; add only a placeholder to `.env.example` if that file exists.
- Never put the key in browser code, public configuration, HTML, client-side environment variables, logs, or committed source.

## 3. Integrate without disrupting checkout

- Send the required order data from a server-side path after the project's existing order-creation/confirmation step. Match the SDK's real schema and available fields.
- Preserve the current checkout, payment flow, stock handling, and order confirmation behavior.
- Prevent duplicate tracking records when the order hook runs more than once, using the project's existing order ID/idempotency mechanism and the SDK's documented options if available.
- Handle sync failures safely: do not lose or silently cancel the customer's order because تاجر تراك is temporarily unavailable. Use existing retry/background-job patterns where possible and log only sanitized errors.
- Do not implement carrier-status webhooks or status updates by guessing SDK functions. Only add them if the installed SDK documents that capability and the current project has a valid server-side event source.

## 4. Configure and verify

- Make the smallest appropriate change for the framework and existing architecture.
- Add/update environment-variable documentation without including a real key.
- Run available type checks and tests. Clearly report anything that could not be run.
- Describe the files changed, required environment setup, how to verify a test order, and any remaining manual step in the merchant's dashboard.

## Success criteria

A test order created through the existing store flow should be passed to تاجر تراك using the documented SDK interface, without exposing the key or changing the checkout experience. Do not claim success until the available test or verification confirms it.
