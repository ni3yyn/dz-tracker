#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const possiblePaths = [
  'src/App.js', 'src/App.jsx', 'src/App.tsx',
  'src/main.js', 'src/main.jsx', 'src/main.tsx',
  'src/index.js', 'src/index.jsx', 'src/index.tsx',
  'pages/_app.js', 'pages/_app.tsx',
  'app/layout.js', 'app/layout.tsx',
  'App.js', 'App.jsx', 'index.js'
];

console.log('\n🚀 مرحباً بك في أداة دمج DZ Tracking SDK!');

const args = process.argv.slice(2);
if (args[0] !== 'init') {
  console.log('يرجى استخدام الأمر: npx dz-tracker init');
  process.exit(1);
}

// أضفنا (apiKey: string) هنا لحل خطأ الـ Typescript الصارم
rl.question('🔑 يرجى لصق الـ API Key الخاص بمتجرك (Merchant Key): ', (apiKey: string) => {
  if (!apiKey.trim()) {
    console.error('❌ الـ API Key مطلوب!');
    process.exit(1);
  }

  let entryPath: string | null = null;
  for (const p of possiblePaths) {
    const fullPath = path.join(process.cwd(), p);
    if (fs.existsSync(fullPath)) {
      entryPath = fullPath;
      break;
    }
  }

  if (!entryPath) {
    console.error('❌ لم نتمكن من العثور على ملف App.js أو main.jsx تلقائياً.');
    console.log('يرجى إضافة الكود يدوياً.');
    process.exit(1);
  }

  const fileName = path.basename(entryPath);
  let content = fs.readFileSync(entryPath, 'utf8');

  if (content.includes('initTracker')) {
    console.log(`⚠️ تم اكتشاف initTracker بالفعل داخل (${fileName}). لم يتم التعديل.`);
    process.exit(0);
  }

  console.log(`🔍 تم العثور على ملف التطبيق: ${fileName} ... جاري الحقن!`);

  const importCode = `import { initTracker } from 'dz-tracking-sdk';\n`;
  const initCode = `\n// 🚀 DZ Tracking Auto-Capture Engine\ninitTracker({\n  apiKey: "${apiKey.trim()}",\n  baseUrl: "http://localhost:3000",\n  autoCapture: true\n});\n\n`;

  const lines = content.split('\n');
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }

  if (lastImportIndex !== -1) {
    lines.splice(lastImportIndex + 1, 0, '\n' + importCode + initCode);
    content = lines.join('\n');
  } else {
    content = importCode + initCode + content;
  }

  fs.writeFileSync(entryPath, content, 'utf8');
  
  console.log(`✅ نجاح! تم دمج نظام التتبع في مشروعك (داخل ${fileName}).`);
  console.log('💡 الخطوة التالية: أضف [data-track-status="حالتك"] لأي زر تود تتبعه في لوحة الإدارة!\n');
  process.exit(0);
});