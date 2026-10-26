import { YalidineAdapter, ZRExpressAdapter, EcoTrackAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'odoo',
  transformEvent: ({ merchant, payload }) => {
    const carrier = String(
      payload.carrier_name || payload.delivery_type || payload.carrier || payload.transporteur || ''
    ).toLowerCase();

    if (carrier.includes('zr') || carrier.includes('procolis')) {
      return ZRExpressAdapter.normalize(merchant.id, payload);
    }

    if (
      carrier.includes('ecotrack') ||
      carrier.includes('noest') ||
      carrier.includes('dhd') ||
      carrier.includes('conexlog')
    ) {
      return EcoTrackAdapter.normalize(merchant.id, payload);
    }

    // Default to Yalidine (standard DZ Yalidine Odoo connector format)
    return YalidineAdapter.normalize(merchant.id, payload);
  },
});
