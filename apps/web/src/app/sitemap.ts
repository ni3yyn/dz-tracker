// src/app/sitemap.ts
import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://tajertrack.vercel.app', lastModified: new Date() }];
}