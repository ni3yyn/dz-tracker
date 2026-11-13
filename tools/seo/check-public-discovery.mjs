#!/usr/bin/env node
const SITE = (process.env.TAJERTRACK_SITE_URL || 'https://tajertrack.vercel.app').replace(/\/$/, '');
const failures = [];
const passes = [];

function pass(message) { passes.push(message); }
function fail(message) { failures.push(message); }

async function get(path) {
  const response = await fetch(SITE + path, {
    redirect: 'follow',
    headers: { 'user-agent': 'TajerTrack-Discovery-Check/1.0 (+https://tajertrack.vercel.app)' },
  });
  return { response, body: await response.text() };
}

function canonicalOf(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find((entry) => /rel=["'][^"']*canonical/i.test(entry));
  return tag?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
}

function hasNoindex(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.some((tag) => /name=["']robots["']/i.test(tag) && /content=["'][^"']*noindex/i.test(tag));
}

async function main() {
  const robots = await get('/robots.txt');
  if (!robots.response.ok) fail('robots.txt returned HTTP ' + robots.response.status);
  else {
    const blocks = robots.body.split(/\n\s*\n/);
    const block = blocks.find((entry) => /user-agent:\s*OAI-SearchBot/i.test(entry));
    if (!block) fail('robots.txt has no OAI-SearchBot group');
    else {
      const lines = block.split(/\r?\n/).map((line) => line.trim().toLowerCase());
      if (!lines.includes('allow: /')) fail('OAI-SearchBot is not allowed at the site root');
      for (const path of ['/merchant', '/admin', '/api', '/login', '/register', '/mobile', '/t/', '/confirm/']) {
        if (!lines.includes('disallow: ' + path)) fail('OAI-SearchBot privacy exclusion missing: ' + path);
      }
      if (failures.length === 0) pass('OAI-SearchBot can crawl public pages while private/token paths are disallowed');
    }
  }

  const sitemap = await get('/sitemap.xml');
  const requiredPaths = [
    '/', '/about', '/solutions/sms-order-tracking-algeria',
    '/solutions/after-sales-ecommerce-algeria', '/fr/suivi-commandes-ecommerce',
  ];
  if (!sitemap.response.ok) fail('sitemap.xml returned HTTP ' + sitemap.response.status);
  else {
    let missing = false;
    for (const path of requiredPaths) {
      const expected = SITE + (path === '/' ? '' : path);
      if (!sitemap.body.includes(expected)) {
        fail('Sitemap is missing ' + path);
        missing = true;
      }
    }
    if (!missing) pass('Sitemap contains the core public landing pages');
  }

  const facts = await get('/llms.txt');
  if (!facts.response.ok) fail('llms.txt returned HTTP ' + facts.response.status);
  else if (!/own personal number and SIM/i.test(facts.body) || !/does not charge the merchant a TajerTrack fee for each SMS/i.test(facts.body)) {
    fail('llms.txt does not clearly document the own-SIM / no TajerTrack per-SMS fee model');
  } else pass('llms.txt contains the current own-SIM SMS model');

  const pages = [
    { path: '/', required: ['تاجر تراك', 'دون رسوم SMS من تاجر تراك'] },
    { path: '/about', required: ['تاجر تراك فون', 'شريحته'] },
    { path: '/solutions/sms-order-tracking-algeria', required: ['شريحتك', 'تاجر تراك'] },
    { path: '/solutions/after-sales-ecommerce-algeria', required: ['طلبات الاستبدال', 'تاجر تراك'] },
    { path: '/fr/suivi-commandes-ecommerce', required: ['carte SIM', 'TajerTrack'] },
  ];

  for (const page of pages) {
    const result = await get(page.path);
    if (!result.response.ok) {
      fail(page.path + ' returned HTTP ' + result.response.status);
      continue;
    }
    const canonical = canonicalOf(result.body);
    const expected = SITE + (page.path === '/' ? '/' : page.path);
    if (!canonical || canonical.replace(/\/$/, '') !== expected.replace(/\/$/, '')) {
      fail(page.path + ' has unexpected or missing canonical (found ' + (canonical ?? 'none') + ')');
    }
    if (hasNoindex(result.body)) fail(page.path + ' unexpectedly contains noindex');
    for (const phrase of page.required) {
      if (!result.body.includes(phrase)) fail(page.path + ' is missing expected product fact: ' + phrase);
    }
    if (page.path.startsWith('/fr/') && !/<main[^>]*lang=["']fr["'][^>]*dir=["']ltr["']/i.test(result.body)) {
      fail('French landing page does not mark main content lang=fr and dir=ltr');
    }
    pass(page.path + ' returned HTTP 200 and passed canonical/indexability/content checks');
  }

  const home = await get('/');
  if (home.response.ok && home.body.includes('application/ld+json')) {
    pass('Homepage includes structured product identity');
  } else if (home.response.ok) {
    fail('Homepage is missing its structured product identity block');
  }

  process.stdout.write('TajerTrack public discovery check: ' + passes.length + ' passed, ' + failures.length + ' failed\n');
  for (const message of passes) process.stdout.write('PASS  ' + message + '\n');
  for (const message of failures) process.stderr.write('FAIL  ' + message + '\n');
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write('Discovery check could not complete: ' + (error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
