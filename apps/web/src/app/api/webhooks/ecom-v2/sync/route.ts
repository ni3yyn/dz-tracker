import { NextResponse } from 'next/server';
import { EcomV2Adapter } from '@saas/orchestrator';
import { createWebhookHandler, handleOptions } from '../../../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';
export const OPTIONS = handleOptions;
const ingestOne = createWebhookHandler({
  source: 'ecom_v2',
  transformEvent: ({ merchant, payload }) => EcomV2Adapter.normalize(merchant.id, payload),
});

export async function POST(req: Request) {
  let parsed: any;
  try { parsed = await req.json(); }
  catch { return NextResponse.json({ success: false, error: 'Malformed JSON body.' }, { status: 400 }); }
  if (!parsed || !Array.isArray(parsed.events) || parsed.events.length < 1 || parsed.events.length > 50) {
    return NextResponse.json({ success: false, error: 'Expected between 1 and 50 E-com Delivery v2 history events.' }, { status: 400 });
  }
  const results = [];
  for (const event of parsed.events) {
    const headers = new Headers(req.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('content-type', 'application/json');
    const response = await ingestOne(new Request(req.url, { method: 'POST', headers, body: JSON.stringify(event) }));
    let body: any = null;
    try { body = await response.json(); } catch {}
    results.push({ success: response.ok && body?.success === true, status: response.status,
      error: response.ok && body?.success === true ? undefined : String(body?.error || body?.message || 'Ingestion failed').slice(0, 200) });
  }
  const failed = results.filter((x: any) => !x.success).length;
  return NextResponse.json({ success: failed === 0, processed: results.length, failed, results }, { status: failed === 0 ? 200 : 207 });
}
