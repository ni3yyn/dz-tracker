export type MerchantErrorContext = 'order' | 'carrier' | 'locations' | 'fees';

function getRawErrorMessage(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === 'string' ? message.trim() : '';
  }
  return '';
}

/**
 * Keep provider, database and infrastructure wording out of merchant-facing UI.
 * Arabic validation messages authored by TajerTrack are preserved verbatim.
 */
export function normalizeMerchantServerError(
  value: unknown,
  context: MerchantErrorContext = 'order'
): string {
  const raw = getRawErrorMessage(value);
  if (!raw) return fallbackFor(context);

  const normalized = raw.toLowerCase();
  const retryAfter = value && typeof value === 'object' &&
    'retryAfterSeconds' in value
      ? Number((value as { retryAfterSeconds?: unknown }).retryAfterSeconds)
      : NaN;
  const retrySuffix = Number.isFinite(retryAfter) && retryAfter > 0
    ? ` أعد المحاولة بعد ${Math.ceil(retryAfter)} ثانية.`
    : '';

  if (/rate.?limit|too many requests|quota exceeded|second.?quota|http\s*429|\b429\b/.test(normalized)) {
    const message = context === 'locations'
      ? 'بلغ حساب Guepex الحد المسموح من طلبات تحميل بيانات التوصيل خلال الثانية.'
      : context === 'fees'
        ? 'بلغ حساب Guepex الحد المسموح من طلبات حساب تعرفة التوصيل خلال الثانية.'
        : 'بلغ حساب Guepex الحد المسموح من طلبات API خلال الثانية.';
    return message + (retrySuffix || ' انتظر قليلاً ثم أعد المحاولة.');
  }

  if (/unauthorized|forbidden|invalid api.?id|invalid api.?token|http\s*401|http\s*403/.test(normalized)) {
    return 'رفضت Guepex بيانات الربط. راجع API ID وAPI Token من صفحة التكاملات.';
  }
  if (/already exists|duplicate|unique constraint|duplicate key/.test(normalized)) {
    return 'يوجد طلب مسجل مسبقاً بهذا المرجع. تحقق من رقم الطلب قبل إعادة المحاولة.';
  }
  if (/timed? ?out|timeout|network|fetch failed|econn|socket|connection refused/.test(normalized)) {
    return context === 'carrier'
      ? 'تعذّر الاتصال بشركة التوصيل. لم يتم تأكيد إنشاء الشحنة؛ تحقق من لوحة الشركة قبل إعادة المحاولة.'
      : 'تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حاول مجدداً.';
  }
  if (/[\u0600-\u06FF]/.test(raw)) return raw;

  return fallbackFor(context);
}

function fallbackFor(context: MerchantErrorContext): string {
  switch (context) {
    case 'carrier':
      return 'تعذّر إتمام طلب شركة التوصيل. لم يتم تأكيد إنشاء الشحنة؛ تحقق من لوحة الشركة قبل إعادة المحاولة.';
    case 'locations':
      return 'تعذّر تحميل ولايات وبلديات ومكاتب شركة التوصيل. حاول مجدداً بعد قليل.';
    case 'fees':
      return 'تعذّر جلب تعرفة التوصيل الرسمية. حاول مجدداً بعد قليل.';
    default:
      return 'تعذّر إتمام العملية على الخادم. حاول مجدداً، وإذا تكرر الخطأ تواصل مع الدعم.';
  }
}
