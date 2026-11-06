import { PushPayload } from './delivery-state.js';

export function renderPushNotificationPayload(params: {
  storeName?: string | null;
  statusTitle: string;
  description?: string | null;
  trackingUuid: string;
  orderHistoryId: string;
}): PushPayload {
  const storePrefix = params.storeName ? `${params.storeName}: ` : '';
  const title = `${storePrefix}تحديث جديد على شحنتك 📦`.slice(0, 100);

  let body = params.statusTitle;
  if (params.description && params.description.trim()) {
    body = `${params.statusTitle} — ${params.description.trim()}`;
  }
  body = body.slice(0, 250);

  return {
    title,
    body,
    url: `/t/${params.trackingUuid}`,
    eventId: params.orderHistoryId,
  };
}

