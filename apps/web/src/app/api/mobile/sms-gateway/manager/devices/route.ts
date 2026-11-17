import { NextResponse } from 'next/server';
import { authenticateNativeSmsManager } from '../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authenticateNativeSmsManager(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabase
    .from('sms_gateway_devices')
    .select('device_id, display_name, operator_code, enabled, revoked_at, connected_at, last_seen_at, last_status')
    .eq('merchant_id', auth.manager.merchant_id)
    .order('connected_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[NativeSmsGateway] Could not list manager sender devices:', error.message);
    return NextResponse.json({ error: 'تعذر تحميل أجهزة الإرسال حالياً.' }, { status: 503 });
  }

  const now = Date.now();
  const devices = (data || []).map((device: any) => {
    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
    return {
      deviceId: device.device_id,
      displayName: device.display_name || 'Android phone',
      operatorCode: device.operator_code,
      enabled: device.enabled === true,
      revoked: Boolean(device.revoked_at),
      connectedAt: device.connected_at,
      lastSeenAt: device.last_seen_at,
      lastStatus: device.last_status,
      isOnline: device.enabled === true && !device.revoked_at &&
        Number.isFinite(lastSeen) && now - lastSeen <= 120_000,
    };
  });

  return NextResponse.json({ devices }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}

export async function POST(request: Request) {
  const auth = await authenticateNativeSmsManager(request);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(deviceId) ||
      !['pause', 'resume', 'revoke'].includes(action)) {
    return NextResponse.json({ error: 'طلب إدارة الجهاز غير صالح.' }, { status: 400 });
  }

  // Resolve ownership before invoking the narrowly scoped database procedures.
  const { data: device, error: lookupError } = await auth.supabase
    .from('sms_gateway_devices')
    .select('device_id, enabled, revoked_at')
    .eq('device_id', deviceId)
    .eq('merchant_id', auth.manager.merchant_id)
    .maybeSingle();

  if (lookupError) {
    console.error('[NativeSmsGateway] Sender device lookup failed:', lookupError.message);
    return NextResponse.json({ error: 'تعذر التحقق من جهاز الإرسال.' }, { status: 503 });
  }
  if (!device || device.revoked_at) {
    return NextResponse.json({ error: 'جهاز الإرسال غير موجود أو تم إلغاء ربطه.' }, { status: 404 });
  }

  if (action === 'pause' || action === 'resume') {
    const { data, error } = await auth.supabase.rpc('set_native_sms_gateway_device_enabled', {
      p_merchant_id: auth.manager.merchant_id,
      p_device_id: deviceId,
      p_enabled: action === 'resume',
    });
    if (error) {
      console.error('[NativeSmsGateway] Sender device state update failed:', error.message);
      return NextResponse.json({ error: 'تعذر تحديث حالة خط الإرسال.' }, { status: 503 });
    }
    if (data !== true) {
      return NextResponse.json({ error: 'تعذر تنفيذ الإجراء. تحقق من وجود خط آخر نشط على الشبكة نفسها.' }, { status: 409 });
    }
  } else {
    const { data, error } = await auth.supabase.rpc('revoke_native_sms_gateway_device', {
      p_merchant_id: auth.manager.merchant_id,
      p_device_id: deviceId,
    });
    if (error) {
      console.error('[NativeSmsGateway] Sender device revoke failed:', error.message);
      return NextResponse.json({ error: 'تعذر إلغاء ربط جهاز الإرسال.' }, { status: 503 });
    }
    if (data !== true) {
      return NextResponse.json({ error: 'تعذر إلغاء ربط جهاز الإرسال.' }, { status: 409 });
    }
  }

  return NextResponse.json({ success: true, action }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
