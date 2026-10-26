import { YalidineAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'yalidine',
  transformEvent: ({ merchant, payload }) => {
    return YalidineAdapter.normalize(merchant.id, payload);
  },
});