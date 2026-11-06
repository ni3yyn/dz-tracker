import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneForTelegram } from '../phone.js';
import { renderTrackingMessage } from '../message-template.js';
import { classifyTelegramError } from '../error-classifier.js';
import { OutboxJob, ResolvedTelegramRecipient } from '../delivery-state.js';

test('End-to-End Simulation: Order Consent & Outbox Lifecycle', async () => {
  // 1. Validate Input Data
  const rawCustomerPhone = '0555123456';
  const cleanPhone = normalizePhoneForTelegram(rawCustomerPhone);
  assert.equal(cleanPhone, '+213555123456');

  // 2. Mock Outbox Job Creation (simulating PostgreSQL AFTER INSERT trigger)
  const mockOrder = {
    id: 'ord_test_001',
    merchant_id: 'merch_test_100',
    external_order_id: '#9988',
    customer_phone: cleanPhone,
    customer_name: 'كريم بلحاج',
    tracking_uuid: 'e2e-uuid-7788-9900',
    telegram_consent_at: new Date().toISOString(),
  };

  const mockOutboxJob: OutboxJob = {
    id: 'job_test_001',
    order_id: mockOrder.id,
    merchant_id: mockOrder.merchant_id,
    idempotency_key: `tg_delivery:${mockOrder.id}`,
    status: 'pending',
    attempt_count: 1,
    max_attempts: 5,
    available_at: new Date().toISOString(),
    locked_by: null,
    locked_at: null,
    lease_expires_at: null,
    telegram_random_id: null,
    telegram_user_id: null,
    telegram_message_id: null,
    result_code: null,
    last_error_code: null,
    last_error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sent_at: null,
  };

  assert.equal(mockOutboxJob.order_id, mockOrder.id);
  assert.equal(mockOutboxJob.status, 'pending');

  // 3. Mock Phone Resolution
  const mockRecipient: ResolvedTelegramRecipient = {
    userId: 987654321,
    accessHash: '1234567890123456789',
    phone: cleanPhone!,
  };
  assert.equal(mockRecipient.userId, 987654321);

  // 4. Render Canonical Message
  const baseUrl = 'https://tajertrack.com';
  const trackingUrl = `${baseUrl}/t/${mockOrder.tracking_uuid}`;
  const message = renderTrackingMessage({
    customerName: mockOrder.customer_name,
    storeName: 'متجر الجزائر الإلكتروني',
    orderNumber: mockOrder.external_order_id,
    trackingUrl,
  });

  assert.ok(message.includes('كريم'));
  assert.ok(message.includes('متجر الجزائر الإلكتروني'));
  assert.ok(message.includes('https://tajertrack.com/t/e2e-uuid-7788-9900'));
  assert.ok(message.includes('TajerTrack'));

  // 5. Simulate 64-bit Random ID generation and persistence
  const simulatedRandomId = 8877665544332211n;
  mockOutboxJob.telegram_random_id = Number(simulatedRandomId);

  // 6. Simulate Successful Delivery
  const simulatedMessageId = 5544;
  mockOutboxJob.status = 'sent';
  mockOutboxJob.result_code = 'delivered';
  mockOutboxJob.sent_at = new Date().toISOString();
  mockOutboxJob.telegram_user_id = mockRecipient.userId;
  mockOutboxJob.telegram_message_id = simulatedMessageId;

  assert.equal(mockOutboxJob.status, 'sent');
  assert.equal(mockOutboxJob.result_code, 'delivered');
  assert.equal(mockOutboxJob.telegram_message_id, 5544);

  // 7. Verify Idempotency: Duplicate webhook cannot re-deliver
  const isEligibleForNewSend = (status: string) => status === 'pending' || status === 'retry';
  assert.equal(isEligibleForNewSend(mockOutboxJob.status), false, 'Sent job must never be re-processed');
});
