// src/app/robots.ts
import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/merchant', '/api', '/login', '/register'] },
    sitemap: 'https://tajertrack.vercel.app/sitemap.xml',
  };
}