#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://tajertrack.vercel.app';
const DEFAULT_URLS = [
  SITE,
  `${SITE}/about`,
  `${SITE}/solutions/sms-order-tracking-algeria`,
  `${SITE}/solutions/after-sales-ecommerce-algeria`,
  `${SITE}/fr/suivi-commandes-ecommerce`,
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../..');
const keyFile = resolve(repositoryRoot, 'apps/web/public/a0e3484a5d1246db8ac89e4a2f6d9c10.txt');

async function main() {
  const key = (await readFile(keyFile, 'utf8')).trim();
  if (!/^[a-f0-9]{8,128}$/i.test(key)) {
    throw new Error('The IndexNow key file is empty or has an invalid format.');
  }

  const submittedUrls = process.argv.slice(2);
  const urls = submittedUrls.length ? submittedUrls : DEFAULT_URLS;
  const normalizedUrls = [...new Set(urls.map((value) => new URL(value).href))];

  for (const url of normalizedUrls) {
    if (new URL(url).origin !== SITE) {
      throw new Error(`Refusing to submit a URL outside ${SITE}: ${url}`);
    }
  }

  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key,
      keyLocation: `${SITE}/a0e3484a5d1246db8ac89e4a2f6d9c10.txt`,
      urlList: normalizedUrls,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`IndexNow rejected the submission (HTTP ${response.status}). ${details}`);
  }

  process.stdout.write(
    `IndexNow accepted ${normalizedUrls.length} URL(s). This is a crawl notification, not an indexing guarantee.\n`,
  );
  for (const url of normalizedUrls) process.stdout.write(`- ${url}\n`);
}

main().catch((error) => {
  process.stderr.write(`IndexNow submission failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
