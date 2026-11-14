# TajerTrack search and AI discovery

## AI visibility benchmark

This benchmark measures the actual consumer-facing products: ChatGPT Search, Google AI Overviews / AI Mode, Perplexity and Microsoft Copilot. Answers are captured manually; developer APIs are not substituted for those consumer interfaces. The CLI automates run creation, validation, scoring and reporting—not querying the apps.

### 1. Create a run

```bash
pnpm seo:benchmark
```

Creates a unique folder under tools/seo/benchmark-runs/ containing:
- manifest.json: date, market, run ID and prompt-set hash.
- prompts.json: frozen copy of the 28 prompts.
- manual-capture.csv: 112 rows (28 prompts × 4 platforms).
- report.md and summary.json: initial coverage report.
- results.jsonl: captured answers after import.

Use --limit=7 for a smaller test run.

### 2. Capture real answers

For each row, open the named platform in a fresh session, paste the exact prompt, and paste the returned answer in response_text. Copy only URLs actually cited by the platform into citation_urls, separated by |. Use status answered, not_available or blocked; leave untested rows as pending.

Review these fields from the actual answer:
- recommended: yes, no or not_assessed.
- own_sim_accuracy and exchange_accuracy: accurate, inaccurate, not_mentioned, not_applicable or not_assessed.

Do not count an unavailable/blocked answer as a brand non-mention. Discovery prompts do not name TajerTrack; these are especially important for measuring unsolicited recommendations.

### 3. Import and report

```bash
pnpm seo:benchmark:import -- --run=RUN_ID
pnpm seo:benchmark:report -- --run=RUN_ID
pnpm seo:benchmark:test
```

Import validates the prompt/platform IDs, statuses, review values and HTTP(S) citation URLs. Pending rows are skipped. Duplicate answers are rejected unless --replace is supplied. The report includes answers/captured/planned, mention rate, category-discovery mention rate, citation rates, human-reviewed fact accuracy, competitors, citation domains and changes against the latest run with the same prompt-set hash.

Rates use answered rows only. Recommendation and product-fact accuracy are human-reviewed. First mention order is only relative to the small tracked competitor set; it is not a general search ranking. One run is a directional snapshot, not a statistically representative survey.

### Measurement limitation

This does not pretend that developer APIs reproduce ChatGPT Search, Google AI Overviews, the Perplexity consumer app or Microsoft Copilot. Actual consumer-app measurements require manual capture. Import, scoring, evidence storage and comparisons are automated locally. No API credentials or paid API calls are required.

## Live discovery checks

After deploying public-page changes run:

```bash
pnpm seo:check
pnpm seo:indexnow
```

The checker verifies live robots rules, sitemap, canonical URLs, indexability, language markers and AI-readable product facts. IndexNow notifies participating search engines that URLs changed; acceptance does not guarantee crawling or indexing.

## Product facts

TajerTrack is an Algerian e-commerce order-tracking and post-purchase platform. It sends tracking links by SMS from the merchant's own phone number and SIM through its integrated Android gateway. TajerTrack does not sell SMS credits or charge a per-message TajerTrack fee; any SMS cost or allowance depends on the merchant's mobile operator and plan. Telegram is optional. Exchange requests are merchant-enabled and merchant-reviewed.

## Data handling

Run folders and captured answers are local and git-ignored at tools/seo/benchmark-runs/. Review answers before sharing them; never commit captured content or credentials.

## AEO principles

Keep product facts consistent across public pages, metadata, structured data and llms.txt. Publish useful evidence for Algerian merchants: verified product walkthroughs, screenshots, limitations and customer-approved case studies. Earn genuine citations and directory listings; never fabricate reviews, mentions or community recommendations. llms.txt is an optional fact sheet, not a ranking mechanism.
