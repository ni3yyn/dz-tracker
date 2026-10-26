import { ZRExpressAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'zrexpress',
  transformEvent: ({ merchant, payload }) => {
    return ZRExpressAdapter.normalize(merchant.id, payload);
  },
});
