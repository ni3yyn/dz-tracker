import { EcoTrackAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'ecotrack',
  transformEvent: ({ merchant, payload }) => {
    return EcoTrackAdapter.normalize(merchant.id, payload);
  },
});