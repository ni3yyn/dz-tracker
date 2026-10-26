import { MaystroAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'maystro',
  transformEvent: ({ merchant, payload }) => {
    return MaystroAdapter.normalize(merchant.id, payload);
  },
});
