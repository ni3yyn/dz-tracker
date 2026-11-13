import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: base },
    { url: `${base}/about` },
    { url: `${base}/privacy` },
    { url: `${base}/terms` },
    { url: `${base}/solutions/sms-order-tracking-algeria` },
    { url: `${base}/solutions/after-sales-ecommerce-algeria` },
    { url: `${base}/fr/suivi-commandes-ecommerce` },
  ];
}
