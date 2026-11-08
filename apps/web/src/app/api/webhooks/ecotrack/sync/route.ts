import { NextResponse } from 'next/server';
import { EcoTrackAdapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';
export const OPTIONS = handleOptions;

const ingestOne = createWebhookHandler({
  source: 'ecotrack',
  transformEvent: ({ merchant, payload }) => EcoTrackAdapter.normalize(merchant.id, payload),
});

export async function POST(req: Request) {
  let parsed: any;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Malformed JSON body.' }, { status: 400 });
  }

  if (!parsed || !Array.isArray(parsed.events) || parsed.events.length < 1 || parsed.events.length > 100) {
    return NextResponse.json(
      { success: false, error: 'Expected between 1 and 100 EcoTrack events.' },
      { status: 400 }
    );
  }

  const results: Array<{ success: boolean; status: number; error?: string }> = [];
  for (const event of parsed.events) {
    const singleRequest = new Request(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(event),
    });
    const response = await ingestOne(singleRequest);
    let body: any = null;
    try { body = await response.json(); } catch { /* summarize below */ }
    results.push({
      success: response.ok && body?.success === true,
      status: response.status,
      ...(response.ok && body?.success === true ? {} : { error: String(body?.error || body?.message || 'Event ingestion failed').slice(0, 250) }),
    });
  }

  const failed = results.filter((result) => !result.success).length;
  return NextResponse.json({
    success: failed === 0,
    processed: results.length,
    failed,
    results,
  }, { status: failed === 0 ? 200 : 207 });
}
