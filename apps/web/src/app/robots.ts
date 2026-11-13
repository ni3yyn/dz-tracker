import type { MetadataRoute } from 'next';

const sitemapUrl = 'https://tajertrack.vercel.app/sitemap.xml';
const privatePaths = ['/merchant', '/api', '/login', '/register'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Explicitly keep TajerTrack eligible for ChatGPT Search.
      { userAgent: 'OAI-SearchBot', allow: '/', disallow: privatePaths },
      // Other compliant search crawlers can discover the same public pages.
      { userAgent: '*', allow: '/', disallow: privatePaths },
    ],
    sitemap: sitemapUrl,
  };
}
