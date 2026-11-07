/**
 * Converts a raw Supabase storage URL to our cached proxy URL.
 *
 * Raw:    https://xxxx.supabase.co/storage/v1/object/public/merchant-uploads/...
 * Proxy:  /api/img?url=https%3A%2F%2Fxxxx.supabase.co%2F...
 *
 * The proxy route (/api/img) adds aggressive Cache-Control headers so:
 *   - Vercel Edge caches the image (CDN layer — zero Supabase egress after first hit)
 *   - Browser caches it for 1 year (max-age=31536000, immutable)
 *
 * Non-Supabase URLs are returned unchanged so external image_urls still work.
 */
export function toCachedImageUrl(url: string | null | undefined): string {
  if (!url) return '';

  // Only proxy our own Supabase storage URLs
  try {
    const parsed = new URL(url);
    const isSupabase =
      parsed.hostname.endsWith('.supabase.co') ||
      parsed.hostname.endsWith('.supabase.in');

    if (isSupabase) {
      return `/api/img?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Invalid URL — return as-is
  }

  return url;
}

