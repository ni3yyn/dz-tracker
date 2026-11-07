export interface ConfirmationTemplateData {
  customerName?: string | null;
  storeName?: string | null;
  orderNumber?: string | null;
  confirmationUrl: string;
  expiresInHours?: number;
}

/**
 * Renders an Arabic confirmation request message with a secure one-time link.
 * Customer taps the link → web page → Confirm or Cancel buttons.
 */
export function renderConfirmationMessage(data: ConfirmationTemplateData): string {
  const customerGreeting = data.customerName?.trim()
    ? `مرحباً ${data.customerName.trim()} 👋`
    : 'مرحباً بك 👋';

  const store = data.storeName?.trim() || 'المتجر';
  const orderRef = data.orderNumber?.trim() ? ` رقم (${data.orderNumber.trim()})` : '';
  const expiryNote = data.expiresInHours ? `الرابط صالح لمدة ${data.expiresInHours} ساعة.` : '';

  return (
    `${customerGreeting}\n` +
    `لديك طلب${orderRef} من متجر ${store} بانتظار تأكيدك. ✅\n\n` +
    `للتأكيد أو الإلغاء، اضغط على الرابط التالي:\n` +
    `${data.confirmationUrl}\n\n` +
    (expiryNote ? `${expiryNote}\n\n` : '') +
    `شكراً لك.\n` +
    `TajerTrack`
  );
}

