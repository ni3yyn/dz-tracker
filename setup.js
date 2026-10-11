// setup.js
const fs = require('fs');
const path = require('path');

const folders = [
  'apps/web/src/app/(public)',
  'apps/web/src/app/(dashboard)/admin',
  'apps/web/src/app/(dashboard)/merchant',
  'apps/web/src/app/t/[uuid]',
  'apps/web/src/app/api/webhooks',
  'apps/web/src/components',
  'apps/web/src/styles', // للـ Pure CSS
  'packages/database/src',
  'packages/orchestrator/src/sources',
  'packages/orchestrator/src/carriers',
  'packages/sdk/src',
  'packages/ui/src/components',
  'packages/ui/src/styles', // للـ Pure CSS للمكونات المشتركة
  'packages/config'
];

const files = [
  // Web App
  'apps/web/src/app/layout.tsx',
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/t/[uuid]/page.tsx',
  'apps/web/src/app/t/[uuid]/t.module.css', // Pure CSS module
  'apps/web/src/app/api/webhooks/route.ts',
  'apps/web/src/styles/globals.css', // Pure Global CSS
  'apps/web/package.json',
  
  // Database Package
  'packages/database/src/client.ts',
  'packages/database/package.json',
  
  // Orchestrator Package
  'packages/orchestrator/src/index.ts',
  'packages/orchestrator/package.json',
  
  // SDK Package
  'packages/sdk/src/index.ts',
  'packages/sdk/package.json',
  
  // UI Package
  'packages/ui/src/index.ts',
  'packages/ui/src/components/Timeline.tsx',
  'packages/ui/src/styles/Timeline.css',
  'packages/ui/package.json',
  
  // Configs
  'packages/config/tsconfig.base.json'
];

// Create Folders
folders.forEach(folder => {
  fs.mkdirSync(path.join(__dirname, folder), { recursive: true });
});

// Create Empty Files
files.forEach(file => {
  fs.writeFileSync(path.join(__dirname, file), '');
});

// Create pnpm-workspace.yaml
fs.writeFileSync(path.join(__dirname, 'pnpm-workspace.yaml'), `packages:
  - "apps/*"
  - "packages/*"
`);

// Create turbo.json
fs.writeFileSync(path.join(__dirname, 'turbo.json'), `{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}`);

console.log('✅ File tree and configs created successfully!');