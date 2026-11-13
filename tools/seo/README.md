# TajerTrack search and AI discovery

This toolkit supports ordinary search discovery and AI answer-engine visibility. It does not promise ranking or recommendation placement.

## Principles

- Keep product facts accurate and consistent across the homepage, solution pages, About page, metadata and structured data.
- Publish material that helps Algerian merchants make real decisions. Prefer verified screenshots, firsthand demonstrations, customer-approved case studies and original observations over generic SEO articles.
- Earn genuine references from relevant directories, publications, communities and creators. Do not buy fake reviews, manufacture Reddit recommendations, coordinate votes or mass-publish near-duplicate pages.
- Treat `llms.txt` as an optional product fact sheet, not a ranking signal or a requirement for Google or ChatGPT.
- Do not add schema merely to target AI systems. Structured data must match visible facts.

## Local commands

### Check the live public discovery surface

After deployment, run:

```bash
pnpm seo:check
```

The checker makes read-only requests to the live website. It verifies the OAI-SearchBot robots group, private-path exclusions, sitemap entries, the product fact sheet, canonical URLs, indexability and language markers on the public Arabic/French pages. It does not verify Google/Bing indexing, crawler IP allowlisting or AI recommendations.

You can point it to a staging deployment with:

```bash
TAJERTRACK_SITE_URL=https://your-preview.example pnpm seo:check
```

### Generate an AI visibility benchmark worksheet

```bash
pnpm seo:benchmark
```

This creates a dated CSV under `tools/seo/benchmark-runs/` with 28 buyer questions prepared for ChatGPT Search, Google AI Overviews/AI Mode (when shown), Perplexity and Microsoft Copilot.

For a fair comparison:
1. Use a fresh conversation or session for each query; do not seed it with previous TajerTrack context.
2. Keep the prompt, language, market context and platform consistent between runs.
3. Record whether TajerTrack was mentioned, recommended, cited, which competitors appeared, and whether the own-SIM/no-TajerTrack-SMS-fee model was described accurately.
4. Mark experiences that do not show an AI answer or citations as `not_available`, not as a negative result.
5. Retain cited URLs and short evidence excerpts so results can be reviewed later.

The benchmark is observational. It does not reveal internal model rankings and should not be treated as a statistically representative market survey from a single run.

## IndexNow

IndexNow is configured for the public website at `https://tajertrack.vercel.app`.

After the corresponding URLs have been deployed and are publicly reachable, submit the changed pages from the repository root:

```bash
pnpm seo:indexnow
```

For later content changes, pass only the exact URLs that were added, updated or deleted:

```bash
pnpm seo:indexnow -- https://tajertrack.vercel.app/solutions/sms-order-tracking-algeria
```

The public key verification file lives in `apps/web/public/`. IndexNow acceptance confirms that a notification was received; it does not guarantee crawling or indexing.

## One-time webmaster setup

An owner of the website should:

1. Verify `https://tajertrack.vercel.app/` in [Google Search Console](https://search.google.com/search-console).
2. Submit `https://tajertrack.vercel.app/sitemap.xml` in Search Console.
3. Verify the same site in [Bing Webmaster Tools](https://www.bing.com/webmasters) and inspect its IndexNow and AI Performance reports.
4. Use URL Inspection for the homepage and public solution pages to review indexing, canonical selection and rendered HTML.
5. Review Google Search Console's AI-related performance reporting when available for the property.

These steps require access to the relevant Google and Microsoft accounts. A successful deployment or IndexNow notification is not proof that a URL was indexed or cited.

## Crawler access and privacy

- `OAI-SearchBot` is allowed on public marketing and solution pages. OpenAI also recommends allowing requests from its published SearchBot IP ranges; review the [official crawler documentation](https://developers.openai.com/api/docs/bots) and check hosting/WAF logs if crawl access is uncertain.
- Merchant/admin dashboards, APIs, sign-in, registration and SMS-device pairing paths are excluded in `robots.txt`.
- Customer-specific tracking pages and order-confirmation token pages emit `noindex` metadata. Do not add customer order URLs, merchant dashboards, device pairing URLs or tokenized confirmation links to public sitemaps or AI-readable product summaries.
- Public marketing pages should not require a customer session. The middleware skips the Supabase auth lookup for public routes to avoid unnecessary work for visitors and crawlers.

## Product facts

The maintained factual summary for AI assistants is served from `/llms.txt`. Update it whenever public product capabilities, limitations or pricing materially change. It is an optional plain-text reference, not a ranking control or an OpenAI indexing requirement.

## External discovery

See [external-discovery-kit.md](./external-discovery-kit.md) for accurate, submission-ready company descriptions and editorial outreach drafts for relevant Algerian e-commerce directories. These are drafts only; a human must review and submit them through the publishers' official channels.

## Current positioning

TajerTrack is an Algerian e-commerce order-tracking and post-purchase platform. It sends tracking links by SMS from the merchant's own phone number and SIM through its integrated Android gateway. TajerTrack does not sell SMS credits or charge a TajerTrack per-message fee; any SMS cost or allowance depends on the merchant's mobile operator and plan. Telegram is an optional additional channel. Exchange requests are merchant-enabled and merchant-reviewed.
