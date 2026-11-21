import { NextResponse } from 'next/server';
import { authenticateNativeSmsManager } from '../../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Queue a one-shot health snapshot request for every enabled sender phone. */
export async function POST(request: Request) {
  const auth = await authenticateNativeSmsManager(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const requestedAt = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from('sms_gateway_devices')
    .update({ health_refresh_requested_at: requestedAt })
    .eq('merchant_id', auth.manager.merchant_id)
    .eq('enabled', true)
    .is('revoked_at', null)
    .select('device_id');

  if (error) {
    const missingColumn = /health_refresh_requested_at/i.test(error.message || '') &&
      /(column|schema cache|could not find|does not exist)/i.test(error.message || '');
    if (!missingColumn) {
      console.error('[NativeSmsGateway] Could not queue sender health refresh:', error.message);
    }
    return NextResponse.json({
      error: missingColumn
        ? 'يلزم تطبيق تحديث قاعدة البيانات لتفعيل طلب تحديث تقارير الأجهزة.'
        : 'تعذر طلب تحديث تقارير الأجهزة حالياً.',
    }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    requestedCount: data?.length || 0,
    requestedAt,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}
