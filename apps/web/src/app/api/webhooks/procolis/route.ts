import { ProcolisAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'procolis',
  transformEvent: ({ merchant, payload }) => {
    return ProcolisAdapter.normalize(merchant.id, payload);
  },
});
