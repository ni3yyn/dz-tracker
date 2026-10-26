#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function printHeader() {
  console.log('\n======================================================');
  console.log('📦 DZ Tracking CLI Developer Toolkit (v2.0.0)');
  console.log('   Post-Purchase Infrastructure for Algerian E-Commerce');
  console.log('======================================================\n');
}

switch (command) {
  case 'install-skill':
  case 'skill':
    handleInstallSkill();
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
  console.log('Available Commands:\n');
  console.log('  npx dz-tracker install-skill  🤖 Installs the autonomous AI Agent Skill into your project');
  console.log('  npx dz-tracker init           ⚡ Scaffolds and injects DZ Tracking into your project');
  console.log('  npx dz-tracker test           🔍 Verifies your Merchant API Key against the server');
  console.log('  npx dz-tracker snippet        📋 Prints ready-to-use HTML & React checkout code snippets');
  console.log('  npx dz-tracker help           ℹ️ Shows this help menu\n');
}

function handleSnippet() {
  printHeader();
  console.log('📋 Option 1: Zero-Code HTML Checkout Form (Vanilla / Shopify Liquid)');
  console.log('--------------------------------------------------------------------');
  console.log(`<!-- Paste this in your checkout page: zero lines of JS needed! -->
<form data-dz-checkout data-dz-redirect="tracking">
  <input type="text" name="name" placeholder="الاسم الكامل" required />
  <input type="tel" name="phone" placeholder="رقم الهاتف (05/06/07...)" required />
  <input type="text" name="wilaya" placeholder="الولاية" required />
  <input type="hidden" name="product_name" value="Pack Smart Watch Series 9" />
  
  <button type="submit">تأكيد الطلب (الدفع عند الاستلام)</button>
</form>\n`);

  console.log('📋 Option 2: Next.js / React Component with useTracker Hook');
  console.log('-----------------------------------------------------------');
  console.log(`'use client';
import { useTracker } from 'dz-tracking-sdk';

export function CheckoutButton({ orderId, name, phone, productName }) {
  const { track, isLoading } = useTracker();

  const handleConfirm = async () => {
    const result = await track({
      orderId,
      name,
      phone,
      productName,
    });
    // Redirect to public tracking page
    window.location.href = result.trackingUrl;
  };

  return (
    <button onClick={handleConfirm} disabled={isLoading}>
      {isLoading ? 'جاري التأكيد...' : 'تأكيد الطلب 🚚'}
    </button>
  );
}\n`);
}

function handleTest() {
  printHeader();
  const rl = createPrompt();

  let defaultKey = '';
  // Try reading from .env or .env.local
  const envPaths = ['.env.local', '.env'];
  for (const p of envPaths) {
    const full = path.join(process.cwd(), p);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf8');
      const match = content.match(/NEXT_PUBLIC_DZ_API_KEY=([^\r\n]+)/) || content.match(/DZ_API_KEY=([^\r\n]+)/);
      if (match) {
        defaultKey = match[1].replace(/["']/g, '').trim();
        break;
      }
    }
  }

  const promptText = defaultKey
    ? `🔑 Enter Merchant API Key [press Enter for "${defaultKey.substring(0, 8)}..."]: `
    : '🔑 Enter Merchant API Key: ';

  rl.question(promptText, async (inputKey) => {
    rl.close();
    const apiKey = inputKey.trim() || defaultKey;
    if (!apiKey) {
      console.error('❌ API key is required to run test.');
      process.exit(1);
    }

    console.log('\n📡 Pinging DZ Tracking Webhook Gateway...');
    const baseUrl = process.env.DZ_BASE_URL || 'https://dz-tracker-three.vercel.app';

    try {
      const res = await fetch(`${baseUrl}/api/webhooks?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          order_id: '#CLI-TEST-' + Math.floor(Math.random() * 10000),
          status: 'order_placed',
          customer_name: 'CLI Connectivity Test',
          customer_phone: '0555000000',
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        console.log('✅ Success! Your Merchant API Key is active and verified.');
        console.log(`   Generated Test Tracking URL: ${json.tracking_url || 'Active'}`);
        console.log('🎉 Your environment is ready to capture e-commerce orders!\n');
      } else {
        console.error('❌ Authentication failed:', json.error || res.statusText);
        console.log('👉 Make sure you copied your Merchant Key correctly from the dashboard.\n');
      }
    } catch (err: any) {
      console.error('❌ Network error while connecting to tracking API:', err.message);
    }
  });
}

function handleInit() {
  printHeader();
  const rl = createPrompt();

  rl.question('🔑 Paste your Merchant API Key: ', (rawKey) => {
    const apiKey = rawKey.trim();
    if (!apiKey) {
      console.error('❌ API key is required.');
      rl.close();
      process.exit(1);
    }

    rl.question('🌐 Enter Base URL (press Enter for default "https://dz-tracker-three.vercel.app"): ', (rawUrl) => {
      rl.close();
      const baseUrl = rawUrl.trim() || 'https://dz-tracker-three.vercel.app';

      // 1. Write to .env.local
      const envPath = path.join(process.cwd(), '.env.local');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (!envContent.includes('NEXT_PUBLIC_DZ_API_KEY')) {
        envContent += `\nNEXT_PUBLIC_DZ_API_KEY="${apiKey}"\nNEXT_PUBLIC_DZ_BASE_URL="${baseUrl}"\n`;
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('✅ Added NEXT_PUBLIC_DZ_API_KEY to .env.local');
      }

      // 2. Scan for frontend entry points
      const candidates = [
        'app/layout.tsx', 'app/layout.jsx', 'app/layout.js',
        'src/app/layout.tsx', 'src/app/layout.jsx',
        'src/main.tsx', 'src/main.jsx', 'src/main.js',
        'src/App.tsx', 'src/App.jsx', 'src/App.js',
        'pages/_app.tsx', 'pages/_app.jsx',
        'index.html',
      ];

      let detected: string | null = null;
      for (const p of candidates) {
        const full = path.join(process.cwd(), p);
        if (fs.existsSync(full)) {
          detected = full;
          break;
        }
      }

      if (detected) {
        const rel = path.relative(process.cwd(), detected);
        console.log(`🔍 Detected application entry file: ${rel}`);

        let code = fs.readFileSync(detected, 'utf8');
        if (code.includes('initTracker') || code.includes('data-dz-checkout')) {
          console.log(`ℹ️ DZ Tracking appears to already be initialized in ${rel}.`);
        } else if (detected.endsWith('.html')) {
          const scriptTag = `\n    <!-- DZ Tracking Auto-Capture Engine -->\n    <script type="module">\n      import { initTracker } from 'dz-tracking-sdk';\n      initTracker({ apiKey: "${apiKey}", baseUrl: "${baseUrl}" });\n    </script>\n  </body>`;
          code = code.replace('</body>', scriptTag);
          fs.writeFileSync(detected, code, 'utf8');
          console.log(`✅ Injected auto-capture initialization script into ${rel}!`);
        } else {
          const importCode = `import { initTracker } from 'dz-tracking-sdk';\n\nif (typeof window !== 'undefined') {\n  initTracker({ apiKey: "${apiKey}", baseUrl: "${baseUrl}" });\n}\n`;
          code = importCode + '\n' + code;
          fs.writeFileSync(detected, code, 'utf8');
          console.log(`✅ Injected initTracker into top of ${rel}!`);
        }
      } else {
        console.log('\n💡 Add this 2-line snippet to your app root to activate auto-capture:');
        console.log(`   import { initTracker } from 'dz-tracking-sdk';`);
        console.log(`   initTracker({ apiKey: "${apiKey}", baseUrl: "${baseUrl}" });`);
      }

      console.log('\n🎉 Initialization complete! You can now use [data-dz-checkout] on your checkout forms.\n');
    });
  });
}

function handleInstallSkill() {
  printHeader();
  console.log('🤖 Installing DZ Tracking AI Agent Skill into your project...');

  const skillContent = `---
name: dz-tracker
description: Automatically implement DZ Tracking into any e-commerce, web app, or checkout project with zero manual work. Detects tech stack (Next.js, React, HTML, Shopify Liquid, WooCommerce, Node.js), installs dz-tracking-sdk, discovers checkout forms/actions, injects auto-capture or client hooks, and verifies tracking. Use when asked to "implement dz tracker", "install dz tracking", "add dz tracker to my project", or integrate Algerian COD order tracking.
risk: safe
source: project
date_added: 2026-10-11
---

# DZ Tracker — Autonomous Implementation Skill

This skill is designed for **autonomous, zero-touch implementation** of **DZ Tracking** into any codebase or e-commerce storefront.

When invoked, the agent must **inspect, install, configure, wire up, and verify** DZ Tracking without requiring the developer to write boilerplate or manually configure forms.

## ⚡ Execution Workflow Overview
1. Detect Tech Stack  ──>  2. Install SDK / Script  ──>  3. Configure API Key
                                                                 │
6. Verify & Smoke Test <──  5. Wire Checkout Flow   <──  4. Scan Checkout Forms

## Step 1: Detect Tech Stack & Framework
- Node.js (Next.js, React, Vue, Vite, Astro): detect via package.json
- Shopify Liquid, WooCommerce / PHP, or Static HTML

## Step 2: Auto-Install dz-tracking-sdk
- npm / pnpm / yarn / bun: install dz-tracking-sdk
- HTML / Shopify Liquid: inject <script src="https://cdn.jsdelivr.net/npm/dz-tracking-sdk@2.0.0/dist/index.js"></script>

## Step 3: Configure Environment & Merchant API Key
- Add NEXT_PUBLIC_DZ_TRACKER_KEY to .env or .env.local

## Step 4: Scan & Locate Checkout Forms & Actions
- Find checkout <form>, submit handlers, or order API endpoints

## Step 5: Implementation Patterns
- Pattern A (HTML/Liquid): Add [data-dz-checkout data-dz-redirect="tracking"] to <form>
- Pattern B (React/Next.js): Use useTracker() hook from 'dz-tracking-sdk'
- Pattern C (Server Action): Use DZTrackerClient from 'dz-tracking-sdk'

## Step 6: Verify Integration & Build Checks
- Run build & npx dz-tracker test
`;

  const targets = [
    path.join(process.cwd(), '.agents', 'skills', 'dz-tracker', 'SKILL.md'),
    path.join(process.cwd(), '.claude', 'skills', 'dz-tracker', 'SKILL.md'),
  ];

  let installedCount = 0;
  for (const target of targets) {
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(target, skillContent, 'utf8');
      const rel = path.relative(process.cwd(), target);
      console.log(`✅ Created skill file: ${rel}`);
      installedCount++;
    } catch {
      // ignore
    }
  }

  if (installedCount > 0) {
    console.log('\n🎉 DZ Tracking Skill installed successfully!');
    console.log('💡 You can now prompt your AI coding agent (Claude Code, Antigravity, Cursor, Windsurf):');
    console.log('   "Implement DZ Tracking in my project using API key: <your-key>"');
    console.log('   The agent will now do everything autonomously with zero manual work!\n');
  }
}