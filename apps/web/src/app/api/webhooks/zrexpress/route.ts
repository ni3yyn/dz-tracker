import { NextResponse } from 'next/server';
import { ZRExpressAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

const legacyHandler = createWebhookHandler({
  source: 'zrexpress',
  transformEvent: ({ merchant, payload }) => {
    return ZRExpressAdapter.normalize(merchant.id, payload);
  },
});

export async function POST(req: Request) {
  // Do not let a modern Supplier API/Svix envelope fall through to the old
  // Procolis-shaped normalizer, whose legacy fallback could otherwise create
  // the same placeholder external order for unrelated parcels.
  try {
    const payload = JSON.parse(await req.clone().text());
    if (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      'eventType' in payload &&
      'occurredAt' in payload &&
      'data' in payload
    ) {
      return NextResponse.json(
        { error: 'This is the legacy Procolis-compatible endpoint. Use the managed ZR Express Svix endpoint from the merchant dashboard.' },
        { status: 410 }
      );
    }
  } catch {
    // Let the shared legacy handler return its established malformed-JSON response.
  }

  return legacyHandler(req);
}
