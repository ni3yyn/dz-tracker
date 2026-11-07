#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const command = process.argv[2] || 'help';

function createPrompt(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function printHeader() {
  console.log('\n======================================================');
  console.log('DZ Tracking SDK Developer Toolkit (v2.0.0)');
  console.log('Post-Purchase Infrastructure for Algerian E-Commerce');
  console.log('======================================================\n');
}

function readProjectEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const fileName of ['.env.local', '.env']) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in values) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      values[match[1]] = value;
    }
  }
  return values;
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const expression = new RegExp('^\\s*' + key + '\\s*=.*$', 'm');
  const line = key + '=' + JSON.stringify(value);
  if (expression.test(content)) return content.replace(expression, line);
  return content + (content.endsWith('\n') || content.length === 0 ? '' : '\n') + line + '\n';
}

switch (command) {
  case 'install-skill':
  case 'skill':
    void handleInstallSkill();
    break;
  case 'init':
    handleInit();
    break;
  case 'test':
    handleTest();
    break;
  case 'snippet':
    handleSnippet();
    break;
  case 'help':
  default:
    handleHelp();
    break;
}

function handleHelp() {
  printHeader();
  console.log('Available commands:\n');
  console.log('  npx dz-tracker init           Save private server-side environment values');
  console.log('  npx dz-tracker test           Read-only API-key check (does not create an order)');
  console.log('  npx dz-tracker snippet        Print a server-side checkout integration example');
  console.log('  npx dz-tracker install-skill  Install the current canonical AI agent skill');
  console.log('  npx dz-tracker help           Show this help menu\n');
}

function handleSnippet() {
  printHeader();
  console.log([
    "import { DZTrackerClient } from 'dz-tracking-sdk/core';",
    '',
    'const tracker = new DZTrackerClient({',
    '  apiKey: process.env.DZ_TRACKER_API_KEY!,',
    "  baseUrl: process.env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app',",
    '});',
    '',
    '// Call only after your store has saved its own order.',
    'const result = await tracker.trackOrder({',
    '  orderId: String(savedOrder.id),',
    '  name: savedOrder.customerName,',
    '  phone: savedOrder.customerPhone,',
    '  productName: savedOrder.productName,',
    "  status: 'order_placed',",
    '});',
    '',
    'if (result.success && result.trackingUrl) {',
    '  return { trackingUrl: result.trackingUrl };',
    '}',
    'return { trackingUrl: null, trackingError: result.error };',
  ].join('\n'));
  console.log('\nKeep DZ_TRACKER_API_KEY private. Never place it in NEXT_PUBLIC_* or browser code.\n');
}

function handleInit() {
  printHeader();
  const existing = readProjectEnv();
  const rl = createPrompt();
  rl.question('Merchant API key (leave blank to keep the existing value): ', (rawKey) => {
    const apiKey = rawKey.trim() || existing.DZ_TRACKER_API_KEY || '';
    if (!apiKey) {
      console.error('\nAn API key is required. No files were changed.');
      rl.close();
      process.exitCode = 1;
      return;
    }
    const defaultBase = process.env.DZ_TRACKER_BASE_URL || existing.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app';
    rl.question('TajerTrack base URL [' + defaultBase + ']: ', (rawUrl) => {
      rl.close();
      const baseUrl = rawUrl.trim() || defaultBase;
      const envPath = path.join(process.cwd(), '.env.local');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      envContent = upsertEnvValue(envContent, 'DZ_TRACKER_API_KEY', apiKey);
      envContent = upsertEnvValue(envContent, 'DZ_TRACKER_BASE_URL', baseUrl);
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('\nSaved private server-side settings to .env.local:');
      console.log('  DZ_TRACKER_API_KEY (value hidden)');
      console.log('  DZ_TRACKER_BASE_URL=' + baseUrl);
      console.log('\nNo application source files were modified.');
      console.log('Call DZTrackerClient from a server action/API route after your own order is saved.\n');
    });
  });
}

function handleTest() {
  printHeader();
  const env = readProjectEnv();
  const defaultKey = process.env.DZ_TRACKER_API_KEY || env.DZ_TRACKER_API_KEY || '';
  const baseUrl = (process.env.DZ_TRACKER_BASE_URL || env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app').replace(/\/+$/, '');
  const rl = createPrompt();
  rl.question(defaultKey ? 'Merchant API key [saved key ' + defaultKey.slice(0, 6) + '...]: ' : 'Merchant API key: ', async (inputKey) => {
    rl.close();
    const apiKey = inputKey.trim() || defaultKey;
    if (!apiKey) {
      console.error('\nAPI key is required. Run "npx dz-tracker init" first.');
      process.exitCode = 1;
      return;
    }
    console.log('\nChecking the API key with a read-only request...');
    try {
      const response = await fetch(baseUrl + '/api/webhooks', {
        method: 'GET',
        headers: { Accept: 'application/json', 'x-api-key': apiKey },
      });
      const payload: any = await response.json().catch(() => ({}));
      if (response.ok && payload.valid === true) {
        console.log('Success: the API key is valid.');
        console.log('This check did not create an order, consume quota, or trigger a customer message.\n');
        return;
      }
      console.error('API-key check failed (' + response.status + '): ' + (payload.error || response.statusText));
      process.exitCode = 1;
    } catch (error: any) {
      console.error('Network error while checking TajerTrack:', error?.message || String(error));
      process.exitCode = 1;
    }
  });
}

async function handleInstallSkill() {
  printHeader();
  const env = readProjectEnv();
  const baseUrl = (process.env.DZ_TRACKER_BASE_URL || env.DZ_TRACKER_BASE_URL || 'https://tajertrack.vercel.app').replace(/\/+$/, '');
  const skillUrl = process.env.DZ_TRACKER_SKILL_URL || baseUrl + '/skill.md';
  console.log('Downloading the canonical agent skill from ' + skillUrl);

  let skillContent: string;
  try {
    const response = await fetch(skillUrl, { headers: { Accept: 'text/markdown' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    skillContent = await response.text();
  } catch (error: any) {
    console.error('Could not download the skill: ' + (error?.message || String(error)));
    console.error('No skill files were written. Check the deployment or set DZ_TRACKER_SKILL_URL.');
    process.exitCode = 1;
    return;
  }

  if (!skillContent.startsWith('---') || !/^name:\s*dz-tracker\s*$/m.test(skillContent) || skillContent.length < 4000) {
    console.error('The response is not the complete DZ Tracker skill. No skill files were written.');
    process.exitCode = 1;
    return;
  }

  const targets = [
    path.join(process.cwd(), '.agents', 'skills', 'dz-tracker', 'SKILL.md'),
    path.join(process.cwd(), '.claude', 'skills', 'dz-tracker', 'SKILL.md'),
  ];
  let installed = 0;
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, skillContent, 'utf8');
      console.log('Installed ' + path.relative(process.cwd(), target));
      installed += 1;
    } catch (error: any) {
      console.error('Could not write ' + target + ': ' + (error?.message || String(error)));
    }
  }
  if (installed === 0) process.exitCode = 1;
  else console.log('\nInstalled the canonical skill in ' + installed + ' location(s).\n');
}
