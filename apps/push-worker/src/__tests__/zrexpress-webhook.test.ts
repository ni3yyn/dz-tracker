import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  ZRExpressWebhookAdapter,
  verifyZRExpressWebhook,
  type ZRExpressWebhookEvent,
} from '@saas/orchestrator';

const secret = `whsec_${Buffer.from('tajertrack-zr-express-signing-secret-fixture').toString('base64')}`;

function signedHeaders(rawBody: string, id = 'msg_test_001', timestamp = Math.floor(Date.now() / 1000)) {
  const timestampText = String(timestamp);
  const signature = createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64'))
    .update(`${id}.${timestampText}.${rawBody}`, 'utf8')
    .digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': timestampText,
    'svix-signature': `v1,${signature}`,
  };
}

function stateEvent(overrides: Record<string, unknown> = {}): ZRExpressWebhookEvent {
  return {
    eventType: 'parcel.state.updated',
    occurredAt: '2026-11-08T10:30:00.000Z',
    data: {
      id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
      trackingNumber: 'ZR-123456789',
      externalId: 'STORE-ORDER-987',
      customer: {
        name: 'John Doe',
        phone: { number1: '+213555123456' },
      },
      productsDescription: 'Smart Watch',
      state: {
        name: 'Picked Up',
        description: 'Parcel has been picked up from supplier',
      },
      isReturn: false,
      ...overrides,
    },
  };
}

test('verifies a Svix-signed ZR Express event using the raw body', () => {
  const payload = stateEvent();
  const rawBody = JSON.stringify(payload);
  const headers = signedHeaders(rawBody);

  const verified = verifyZRExpressWebhook(secret, rawBody, headers);
  assert.equal(verified.id, 'msg_test_001');
  assert.equal(verified.event.eventType, 'parcel.state.updated');
  assert.equal(verified.event.data.trackingNumber, 'ZR-123456789');
});

test('rejects a body changed after Svix signed it', () => {
  const rawBody = JSON.stringify(stateEvent());
  const headers = signedHeaders(rawBody);

  assert.throws(
    () => verifyZRExpressWebhook(secret, `${rawBody} `, headers),
    /signature verification failed/
  );
});

test('rejects stale Svix timestamps', () => {
  const rawBody = JSON.stringify(stateEvent());
  const staleTimestamp = Math.floor(Date.now() / 1000) - 301;
  const headers = signedHeaders(rawBody, 'msg_stale', staleTimestamp);

  assert.throws(
    () => verifyZRExpressWebhook(secret, rawBody, headers),
    /outside the allowed five-minute window/
  );
});

test('requires all Svix headers and a recognized event envelope', () => {
  assert.throws(
    () => verifyZRExpressWebhook(secret, JSON.stringify(stateEvent()), { 'svix-id': 'msg_only' }),
    /Missing required Svix signature headers/
  );

  const rawBody = JSON.stringify({ eventType: 'parcel.created', occurredAt: new Date().toISOString(), data: {} });
  assert.throws(
    () => verifyZRExpressWebhook(secret, rawBody, signedHeaders(rawBody)),
    /not a recognized ZR Express webhook event/
  );
});

test('normalizes the modern parcel.state.updated payload and PhoneDto number1', () => {
  const event = ZRExpressWebhookAdapter.normalize('merchant-1', stateEvent(), 'msg_state_01');

  assert.equal(event.merchantId, 'merchant-1');
  assert.equal(event.externalOrderId, 'STORE-ORDER-987');
  assert.equal(event.carrierTrackingNumber, 'ZR-123456789');
  assert.equal(event.customerName, 'John Doe');
  assert.equal(event.customerPhone, '213555123456');
  assert.equal(event.productName, 'Smart Watch');
  assert.equal(event.carrierName, 'ZR Express');
  assert.equal(event.statusRaw, 'dispatched');
  assert.equal(event.statusTitle, 'استلمت ZR Express الشحنة من التاجر');
  assert.equal(event.sourceOccurredAt, '2026-11-08T10:30:00.000Z');
  assert.equal(event.sourceEventType, 'parcel.state.updated');
  assert.equal(event.sourceEventId, 'msg_state_01');
});

test('records situation events as distinct provider timeline entries', () => {
  const payload: ZRExpressWebhookEvent = {
    eventType: 'parcel.state.situation.created',
    occurredAt: '2026-11-08T10:31:00.000Z',
    data: {
      trackingNumber: 'ZR-123456789',
      externalId: 'STORE-ORDER-987',
      state: { name: 'In Transit', description: 'Parcel is moving between hubs' },
      situation: { name: 'Departed Algiers Hub', slug: 'departed_algiers_hub', description: 'The parcel left the hub' },
    },
  };

  const event = ZRExpressWebhookAdapter.normalize('merchant-1', payload, 'msg_situation_01');
  assert.equal(event.statusRaw, 'in_transit');
  assert.equal(event.statusTitle, 'Departed Algiers Hub');
  assert.equal(event.description, 'The parcel left the hub');
  assert.equal(event.sourceEventId, 'msg_situation_01');
});

test('maps a return-flag event to the returned status', () => {
  const payload: ZRExpressWebhookEvent = {
    eventType: 'parcel.isReturn.updated',
    occurredAt: '2026-11-08T10:32:00.000Z',
    data: {
      trackingNumber: 'ZR-123456789',
      externalId: 'STORE-ORDER-987',
      state: { name: 'Returned to Hub' },
      isReturn: true,
    },
  };

  const event = ZRExpressWebhookAdapter.normalize('merchant-1', payload, 'msg_return_01');
  assert.equal(event.statusRaw, 'returned');
  assert.equal(event.statusTitle, 'تم تحويل الشحنة إلى مسار الإرجاع');
});
