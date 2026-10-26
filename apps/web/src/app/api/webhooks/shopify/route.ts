import { ShopifyAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'shopify',
  transformEvent: ({ merchant, payload }) => {
    return ShopifyAdapter.normalize(merchant.id, payload);
  },
});