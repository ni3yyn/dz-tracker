import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAlgerianPhone } from '../src/phone.js';
import { renderTrackingMessage } from '../src/message-template.js';
import { classifyTelegramError } from '../src/error-classifier.js';
import { maskTelegramSession } from '../src/telegram-session.js';

test('Phone normalization - Algerian formats', () => {
  // Mobilis (06)
  assert.equal(normalizeAlgerianPhone('0661234567'), '+213661234567');
  assert.equal(normalizeAlgerianPhone('661234567'), '+213661234567');
  assert.equal(normalizeAlgerianPhone('+213661234567'), '+213661234567');
  assert.equal(normalizeAlgerianPhone('00213661234567'), '+213661234567');

  // Djezzy (07)
  assert.equal(normalizeAlgerianPhone('0770123456'), '+213770123456');
  assert.equal(normalizeAlgerianPhone('770123456'), '+213770123456');
  assert.equal(normalizeAlgerianPhone('+213770123456'), '+213770123456');

  // Ooredoo (05)
  assert.equal(normalizeAlgerianPhone('0555123456'), '+213555123456');
  assert.equal(normalizeAlgerianPhone('555123456'), '+213555123456');
  assert.equal(normalizeAlgerianPhone('+213555123456'), '+213555123456');

  // Formatting noise: spaces, dashes, parentheses
  assert.equal(normalizeAlgerianPhone('  05-55 12 (34) 56  '), '+213555123456');

  // International standard E.164
  assert.equal(normalizeAlgerianPhone('+33612345678'), '+33612345678');
  assert.equal(normalizeAlgerianPhone('+12025550199'), '+12025550199');

  // Invalid numbers
  assert.equal(normalizeAlgerianPhone(''), null);
  assert.equal(normalizeAlgerianPhone(null as any), null);
  assert.equal(normalizeAlgerianPhone(undefined as any), null);
  assert.equal(normalizeAlgerianPhone('0123456'), null); // Invalid prefix 01
  assert.equal(normalizeAlgerianPhone('abc0555123456'), null); // Contains letters
  assert.equal(normalizeAlgerianPhone('0555'), null); // Too short
  assert.equal(normalizeAlgerianPhone('05551234567899999'), null); // Too long
});

test('Message template rendering', () => {
  const renderedWithName = renderTrackingMessage({
    customerName: 'أحمد بلقاسم',
    storeName: 'متجر الأناقة',
    orderNumber: '#1042',
    trackingUrl: 'https://tajertrack.com/t/550e8400-e29b-41d4-a716-446655440000',
  });

  assert.ok(renderedWithName.includes('أحمد'));
  assert.ok(renderedWithName.includes('متجر الأناقة'));
  assert.ok(renderedWithName.includes('https://tajertrack.com/t/550e8400-e29b-41d4-a716-446655440000'));
  assert.ok(renderedWithName.includes('TajerTrack'));
  // Ensure no Markdown syntax like asterisks or brackets
  assert.ok(!renderedWithName.includes('*'));
  assert.ok(!renderedWithName.includes('`'));
  assert.ok(!renderedWithName.includes('[');

  // Fallback without customer name
  const renderedWithoutName = renderTrackingMessage({
    storeName: 'متجر التقنية',
    orderNumber: '#999',
    trackingUrl: 'https://tajertrack.com/t/123',
  });
  assert.ok(renderedWithoutName.includes('مرحباً بك'));
  assert.ok(renderedWithoutName.includes('متجر التقنية'));
});

test('Error classification', () => {
  // Permanent skips
  const errNotOnTelegram = new Error('PHONE_NOT_REGISTERED');
  assert.deepEqual(classifyTelegramError(errNotOnTelegram), {
    action: 'skip_permanent',
    reason: 'customer_not_on_telegram',
    description: 'PHONE_NOT_REGISTERED',
  });

  const errPrivacy = new Error('USER_PRIVACY_RESTRICTED');
  assert.deepEqual(classifyTelegramError(errPrivacy), {
    action: 'skip_permanent',
    reason: 'telegram_privacy_restricted',
    description: 'USER_PRIVACY_RESTRICTED',
  });

  // Flood wait
  const errFlood = new Error('FLOOD_WAIT_120');
  const resFlood = classifyTelegramError(errFlood);
  assert.equal(resFlood.action, 'flood_wait');
  assert.equal(resFlood.retryAfterSeconds, 120);

  // Fatal Auth
  const errAuth = new Error('AUTH_KEY_UNREGISTERED');
  assert.deepEqual(classifyTelegramError(errAuth), {
    action: 'fatal_auth',
    reason: 'telegram_session_unauthorized',
    description: 'AUTH_KEY_UNREGISTERED',
  });

  // Retryable transient errors
  const errTimeout = new Error('ETIMEDOUT');
  const resTimeout = classifyTelegramError(errTimeout);
  assert.equal(resTimeout.action, 'retryable');
});

test('Session masking', () => {
  assert.equal(maskTelegramSession(''), '(not configured)');
  assert.equal(maskTelegramSession(undefined as any), '(not configured)');
  const masked = maskTelegramSession('1BVtsOHQBu7wXyZ1234567890abcdefghijklmnopqrstuvwxyz');
  assert.ok(masked.startsWith('1BVtsOHQ...'));
  assert.ok(masked.includes('(length: 51)'));
});

