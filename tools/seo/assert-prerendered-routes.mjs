import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = resolve(repositoryRoot, 'apps/web/.next/prerender-manifest.json');
const requiredStaticRoutes = [
  '/',
  '/about',
  '/privacy',
  '/terms',
  '/solutions/after-sales-ecommerce-algeria',
  '/solutions/sms-order-tracking-algeria',
  '/fr/suivi-commandes-ecommerce',
];
const routesThatMustNotBeStatic = [
  '/merchant',
  '/admin',
  '/login',
  '/register',
  '/mobile/sms-gateway/connect',
];

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  throw new Error(
    `Unable to read Next.js prerender manifest at ${manifestPath}. Run the web production build before checking prerendered routes. ${error instanceof Error ? error.message : String(error)}`
  );
}

const prerenderedRoutes = new Set(Object.keys(manifest.routes ?? {}));
const missingRoutes = requiredStaticRoutes.filter((route) => !prerenderedRoutes.has(route));
const unexpectedlyStaticRoutes = routesThatMustNotBeStatic.filter((route) => prerenderedRoutes.has(route));

if (missingRoutes.length || unexpectedlyStaticRoutes.length) {
  const details = [
    missingRoutes.length ? `Expected public routes missing from static output: ${missingRoutes.join(', ')}` : '',
    unexpectedlyStaticRoutes.length ? `Authenticated/request-specific routes must remain dynamic: ${unexpectedlyStaticRoutes.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  throw new Error(`TajerTrack prerender verification failed.\n${details}`);
}

console.log(
  `TajerTrack prerender verification passed: ${requiredStaticRoutes.length} public routes are in the static prerender manifest; authenticated routes are not statically emitted.`
);
