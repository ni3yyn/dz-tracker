import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site-url';

export const dynamic = 'error';

const smsArabic = absoluteUrl('/solutions/sms-order-tracking-algeria');
const smsFrench = absoluteUrl('/fr/suivi-commandes-ecommerce');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), priority: 1 },
    { url: absoluteUrl('/about'), priority: 0.7 },
    { url: absoluteUrl('/privacy'), priority: 0.3 },
    { url: absoluteUrl('/terms'), priority: 0.3 },
    {
      url: smsArabic,
      priority: 0.9,
      alternates: { languages: { 'ar-DZ': smsArabic, 'fr-DZ': smsFrench } },
    },
    { url: absoluteUrl('/solutions/after-sales-ecommerce-algeria'), priority: 0.9 },
    {
      url: smsFrench,
      priority: 0.8,
      alternates: { languages: { 'fr-DZ': smsFrench, 'ar-DZ': smsArabic } },
    },
  ];
}
