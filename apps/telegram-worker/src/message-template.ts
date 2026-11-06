export interface MessageTemplateData {
  customerName?: string | null;
  storeName?: string | null;
  orderNumber?: string | null;
  trackingUrl: string;
}

/**
 * Renders a clean plain-text Arabic notification message containing the tracking URL.
 * Strictly avoids Markdown parsing or complex markup to guarantee fault-tolerant delivery.
 */
export function renderTrackingMessage(data: MessageTemplateData): string {
  const customerGreeting = data.customerName?.trim()
    ? `مرحباً ${data.customerName.trim()} 👋`
    : 'مرحباً بك 👋';

  const store = data.storeName?.trim() || 'المتجر';
  const orderRef = data.orderNumber?.trim() ? ` رقم (${data.orderNumber.trim()})` : '';

  return (
    `${customerGreeting}\n` +
    `شكراً لطلبك من متجر ${store}! 📦\n\n` +
    `تم تسجيل طلبك${orderRef} بنجاح. يمكنك متابعة شحنتك ومعرفة جميع تفاصيل التوصيل ومكان الطرد لحظة بلحظة عبر الرابط التالي:\n` +
    `${data.trackingUrl}\n\n` +
    `شكراً لثقتك بنا.\n` +
    `TajerTrack`
  );
}

