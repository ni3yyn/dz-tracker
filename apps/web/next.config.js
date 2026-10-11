const path = require('path');
const fs = require('fs');

// قراءة ملف .env من المجلد الرئيسي للمشروع (Monorepo Root)
const rootEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(rootEnvPath)) {
  const envConfig = fs.readFileSync(rootEnvPath, 'utf-8');
  envConfig.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex > 0) {
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;