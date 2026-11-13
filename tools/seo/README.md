# TajerTrack search discovery

## IndexNow

IndexNow is configured for the public website at `https://tajertrack.vercel.app`.

After the corresponding URLs have been deployed and are publicly reachable, submit the changed pages from the repository root:

```bash
pnpm seo:indexnow
```

That command submits the AEO landing pages and homepage that were introduced or materially updated in the current rollout. For later content changes, pass only the exact URLs that were added, updated, or deleted:

```bash
pnpm seo:indexnow -- https://tajertrack.vercel.app/solutions/sms-order-tracking-algeria
```

The public key verification file lives in `apps/web/public/` and is intentionally served at the root of the website. IndexNow acceptance confirms that a notification was received; it does not guarantee crawling or indexing.

## One-time webmaster setup

An owner of the website should:

1. Verify `https://tajertrack.vercel.app/` in [Google Search Console](https://search.google.com/search-console).
2. Submit `https://tajertrack.vercel.app/sitemap.xml` in Search Console.
3. Verify the same site in [Bing Webmaster Tools](https://www.bing.com/webmasters) and inspect its IndexNow report.
4. Use URL Inspection for the homepage and the three public solution pages to request recrawling and review canonical selection, rendered HTML, and any indexing errors.

These verification steps require access to the relevant Google and Microsoft accounts. A successful deployment or IndexNow notification is not proof that Google or Bing indexed a URL.

## Crawler privacy

- `OAI-SearchBot` is allowed on public marketing and solution pages.
- Merchant/admin dashboards, APIs, sign-in, registration, and SMS-device pairing paths are excluded in `robots.txt`.
- Customer-specific tracking pages and order-confirmation token pages emit `noindex` metadata. They are excluded from the sitemap and blocked from OAI-SearchBot.
- Do not add customer order URLs, merchant dashboards, device pairing URLs, or tokenized confirmation links to public sitemaps or AI-readable product summaries.

## Product facts

The maintained factual summary for AI assistants is served from `/llms.txt`. Update it whenever public product capabilities, limits, or pricing materially change. It is an optional plain-text reference, not a ranking control or an OpenAI indexing requirement.
