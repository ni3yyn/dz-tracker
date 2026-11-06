import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderPushNotificationPayload } from '../message-template.js';

describe('renderPushNotificationPayload', () => {
  it('formats notification with store name prefix and status', () => {
    const payload = renderPushNotificationPayload({
      storeName: 'متجر الأناقة',
      statusTitle: 'تم شحن الطلب',
      description: 'الشحنة في طريقها إلى مركز التوزيع',
      trackingUuid: '123e4567-e89b-12d3-a456-426614174000',
      orderHistoryId: 'hist-001',
    });

    assert.strictEqual(payload.title, 'متجر الأناقة: تحديث جديد على شحنتك 📦');
    assert.strictEqual(payload.body, 'تم شحن الطلب — الشحنة في طريقها إلى مركز التوزيع');
    assert.strictEqual(payload.url, '/t/123e4567-e89b-12d3-a456-426614174000');
    assert.strictEqual(payload.eventId, 'hist-001');
  });

  it('formats notification without store name fallback cleanly', () => {
    const payload = renderPushNotificationPayload({
      statusTitle: 'خرجت للتوصيل',
      trackingUuid: 'uuid-test-999',
      orderHistoryId: 'hist-002',
    });

    assert.strictEqual(payload.title, 'تحديث جديد على شحنتك 📦');
    assert.strictEqual(payload.body, 'خرجت للتوصيل');
    assert.strictEqual(payload.url, '/t/uuid-test-999');
  });

  it('truncates overly long titles and descriptions safely', () => {
    const longStoreName = 'أ'.repeat(150);
    const longDesc = 'ب'.repeat(400);

    const payload = renderPushNotificationPayload({
      storeName: longStoreName,
      statusTitle: 'تم التسليم',
      description: longDesc,
      trackingUuid: 'uuid-trunc',
      orderHistoryId: 'hist-003',
    });

    assert.ok(payload.title.length <= 100);
    assert.ok(payload.body.length <= 250);
  });
});

