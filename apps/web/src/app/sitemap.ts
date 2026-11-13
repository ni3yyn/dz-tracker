import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app';
const smsArabic = `${base}/solutions/sms-order-tracking-algeria`;
const smsFrench = `${base}/fr/suivi-commandes-ecommerce`;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: base, priority: 1 },
    { url: `${base}/about`, priority: 0.7 },
    { url: `${base}/privacy`, priority: 0.3 },
    { url: `${base}/terms`, priority: 0.3 },
    {
      url: smsArabic,
      priority: 0.9,
      alternates: { languages: { 'ar-DZ': smsArabic, 'fr-DZ': smsFrench } },
    },
    { url: `${base}/solutions/after-sales-ecommerce-algeria`, priority: 0.9 },
    {
      url: smsFrench,
      priority: 0.8,
      alternates: { languages: { 'fr-DZ': smsFrench, 'ar-DZ': smsArabic } },
    },
  ];
}
