const DEFAULT_SITE_URL = 'https://tajertrack.vercel.app';

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) origin.');
  }

  const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost)) {
    throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL must contain only the site origin, without credentials, path, query, or hash.');
  }

  return parsed.origin;
}

export const SITE_URL = resolveSiteUrl();

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${SITE_URL}/`).toString();
}
