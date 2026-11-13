import type { MetadataRoute } from 'next';

const sitemapUrl = 'https://tajertrack.vercel.app/sitemap.xml';
const privatePaths = ['/merchant', '/admin', '/api', '/login', '/register', '/mobile'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ChatGPT Search can index public product information, not customer tokens or device pairing.
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: [...privatePaths, '/t/', '/confirm/'],
      },
      // Search engines should avoid private workspaces and device setup screens.
      // Customer tracking and order-confirmation pages carry noindex metadata.
      { userAgent: '*', allow: '/', disallow: privatePaths },
    ],
    sitemap: sitemapUrl,
  };
}
