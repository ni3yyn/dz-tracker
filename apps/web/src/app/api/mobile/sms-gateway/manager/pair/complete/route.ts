import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { hashNativeSmsCredential } from '../../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const diagnosticReference = randomUUID();
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const deviceName = typeof body?.deviceName === 'string'
    ? body.deviceName.trim().slice(0, 80)
    : 'Android phone';
  const platform = typeof body?.platform === 'string' ? body.platform.trim().slice(0, 24) : 'android';
  const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.trim().slice(0, 32) : 'unknown';

  if (!/^[A-Za-z0-9_-]{30,100}$/.test(code)) {
    return NextResponse.json({ error: 'This manager pairing code is invalid or expired.' }, { status: 400 });
  }

  const managerDeviceId = randomUUID();
  const managerToken = randomBytes(32).toString('base64url');
  const senderDeviceId = randomUUID();
  const senderToken = randomBytes(32).toString('base64url');
  const supabase = getSupabaseAdminClient() as any;

  try {
    const { data, error } = await supabase.rpc('complete_native_sms_gateway_manager_pairing', {
      p_code_hash: hashNativeSmsCredential(code),
      p_manager_device_id: managerDeviceId,
      p_manager_token_hash: hashNativeSmsCredential(managerToken),
      p_manager_token_last_four: managerToken.slice(-4),
      p_sender_device_id: senderDeviceId,
      p_sender_token_hash: hashNativeSmsCredential(senderToken),
      p_token_last_four: senderToken.slice(-4),
      p_device_name: deviceName || 'Android phone',
      p_platform: platform || 'android',
      p_app_version: appVersion || 'unknown',
    });

    if (error) {
      console.error('[NativeSmsGateway] Manager pairing transaction failed:', {
        diagnosticReference,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      const missingFunction = error.code === 'PGRST202' || error.code === '42883';
      const ambiguousColumn = error.code === '42702';
      const missingSchemaObject = error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205';
      const message = missingFunction
        ? 'خدمة ربط الهاتف غير مكتملة على الخادم: دالة اعتماد الهاتف الرئيسي غير متاحة. يلزم تحديث قاعدة البيانات.'
        : ambiguousColumn
          ? 'حدث تعارض في استعلام قاعدة البيانات أثناء اعتماد الهاتف الرئيسي. تم تسجيل الخطأ للدعم.'
          : missingSchemaObject
            ? 'جداول ربط الهاتف غير مكتملة في قاعدة البيانات. يلزم تطبيق تحديث خدمة الهاتف.'
            : error.code === '23505'
              ? 'تعارضت بيانات الجهاز مع ربط نشط موجود. أعد فتح صفحة الربط وحاول مرة أخرى.'
              : 'تعذر على قاعدة البيانات إتمام اعتماد الهاتف الرئيسي. أرسل رمز التشخيص إلى الدعم.';
      return NextResponse.json({
        error: message,
        errorCode: missingFunction ? 'manager_pair_function_missing'
          : ambiguousColumn ? 'manager_pair_database_ambiguity'
            : missingSchemaObject ? 'manager_pair_schema_incomplete'
              : error.code === '23505' ? 'manager_pair_conflict'
                : 'manager_pair_database_error',
        diagnosticReference,
      }, { status: missingFunction || missingSchemaObject ? 503 : error.code === '23505' ? 409 : 500 });
    }

    const pairing = Array.isArray(data) ? data[0] : data;
    if (pairing?.blocked === true) {
      const blockReason = pairing.block_reason || 'manager_replacement_required';
      const message = blockReason === 'admin_disabled_sender_line'
        ? 'يوجد خط إرسال موقوف من إدارة تاجر تراك. لا يمكن تجاوز الإيقاف بربط هاتف جديد؛ اطلب من الإدارة إعادة تفعيله أو إلغاء ربطه.'
        : 'يوجد هاتف رئيسي مرتبط بهذا المتجر. أكّد استبداله من صفحة الربط ثم أعد المحاولة.';
      return NextResponse.json({
        error: message,
        errorCode: blockReason,
      }, { status: 409 });
    }

    const failureCode = typeof pairing?.failure_code === 'string' ? pairing.failure_code : '';
    if (failureCode) {
      const failures: Record<string, { status: number; message: string }> = {
        invalid_pairing_request: {
          status: 400,
          message: 'بيانات طلب ربط الهاتف غير مكتملة. أغلق صفحة الربط وابدأ من التطبيق مجدداً.',
        },
        pairing_code_expired_or_used: {
          status: 410,
          message: 'انتهت صلاحية رمز الربط أو سبق استخدامه. ارجع إلى التطبيق وابدأ عملية ربط جديدة.',
        },
        merchant_owner_mismatch: {
          status: 403,
          message: 'الحساب الذي بدأ الربط لم يعد مالكاً لهذا المتجر. سجّل الدخول بالحساب الصحيح ثم أعد المحاولة.',
        },
        merchant_account_inactive: {
          status: 403,
          message: 'حساب التاجر موقوف أو محذوف، لذلك لا يمكن اعتماد هاتف إرسال جديد.',
        },
      };
      const failure = failures[failureCode] || {
        status: 400,
        message: 'تعذر التحقق من صلاحية جلسة الربط. ابدأ الربط من جديد من التطبيق.',
      };
      return NextResponse.json({
        error: failure.message,
        errorCode: failureCode,
      }, { status: failure.status });
    }

    if (
      !pairing?.manager_device_id ||
      !pairing?.sender_device_id ||
      !pairing?.merchant_id
    ) {
      return NextResponse.json({
        error: 'لم يُرجع الخادم بيانات اعتماد الهاتف الرئيسية كاملة. لم تُحفظ أي بيانات على الهاتف؛ أعد بدء الربط من التطبيق.',
        errorCode: 'manager_pair_response_incomplete',
        diagnosticReference,
      }, { status: 500 });
    }

    return NextResponse.json({
      managerDeviceId: pairing.manager_device_id,
      managerToken,
      senderDeviceId: pairing.sender_device_id,
      deviceToken: senderToken,
      storeName: pairing.store_name || 'متجرك',
      operatorCode: pairing.operator_code || null,
      role: 'manager',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Manager pairing endpoint failed:', {
      diagnosticReference,
      message: error?.message || String(error),
      stack: error?.stack,
    });
    return NextResponse.json({
      error: 'حدث خطأ غير متوقع في نقطة اعتماد الهاتف الرئيسي. أرسل رمز التشخيص إلى الدعم.',
      errorCode: 'manager_pair_unexpected_error',
      diagnosticReference,
    }, { status: 500 });
  }
}
