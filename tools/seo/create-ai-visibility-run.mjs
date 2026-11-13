#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const promptPath = resolve(scriptDir, 'ai-visibility-prompts.json');
const outputDir = resolve(scriptDir, 'benchmark-runs');
const dateArg = process.argv.slice(2).find((arg) => arg.startsWith('--date='))?.slice('--date='.length);
const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Algiers',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(new Date());
const localDate = dateParts.reduce((parts, part) => {
  if (part.type !== 'literal') parts[part.type] = part.value;
  return parts;
}, {});
const date = dateArg ?? (localDate.year + '-' + localDate.month + '-' + localDate.day);

if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
  throw new Error('Use --date=YYYY-MM-DD for a valid benchmark date.');
}

const platforms = [
  'ChatGPT Search',
  'Google AI Overviews / AI Mode',
  'Perplexity',
  'Microsoft Copilot',
];
const fields = [
  'run_date', 'platform', 'query_id', 'locale', 'intent', 'prompt',
  'mentioned', 'recommended', 'citation_present', 'brand_position',
  'own_sim_model_accurate', 'exchange_capability_accurate',
  'competitors_mentioned', 'cited_domains', 'cited_urls',
  'response_excerpt', 'tested_by', 'notes',
];
const quote = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const prompts = JSON.parse(await readFile(promptPath, 'utf8')).prompts;
const rows = [fields.map(quote).join(',')];

for (const prompt of prompts) {
  for (const platform of platforms) {
    rows.push([
      date, platform, prompt.id, prompt.locale, prompt.intent, prompt.query,
      '', '', '', '', '', '', '', '', '', '', '', '',
    ].map(quote).join(','));
  }
}

await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, 'ai-visibility-' + date + '.csv');
try {
  await access(outputPath);
  throw new Error('Refusing to overwrite existing benchmark run: ' + outputPath);
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Refusing')) throw error;
  if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
    throw error;
  }
}
await writeFile(outputPath, rows.join('\n') + '\n', 'utf8');
process.stdout.write('Created ' + prompts.length + ' prompts × ' + platforms.length + ' platforms = ' + (prompts.length * platforms.length) + ' benchmark rows:\n' + outputPath + '\n');
