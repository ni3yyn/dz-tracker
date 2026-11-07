import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneForTelegram } from '../phone.js';
import { renderTrackingMessage } from '../message-template.js';
import { classifyTelegramError } from '../error-classifier.js';
import { TelegramSessionManager } from '../telegram-session.js';

test('Phone normalization - Algerian formats', () => {
  // Mobilis (06)
  assert.equal(normalizePhoneForTelegram('0661234567'), '+213661234567');
  assert.equal(normalizePhoneForTelegram('+213661234567'), '+213661234567');
  assert.equal(normalizePhoneForTelegram('00213661234567'), '+213661234567');

  // Djezzy (07)
  assert.equal(normalizePhoneForTelegram('0770123456'), '+213770123456');
  assert.equal(normalizePhoneForTelegram('+213770123456'), '+213770123456');

  // Ooredoo (05)
  assert.equal(normalizePhoneForTelegram('0555123456'), '+213555123456');
  assert.equal(normalizePhoneForTelegram('+213555123456'), '+213555123456');

  // Formatting noise: spaces, dashes, parentheses
  assert.equal(normalizePhoneForTelegram('  05-55 12 (34) 56  '), '+213555123456');

  // International standard E.164
  assert.equal(normalizePhoneForTelegram('+33612345678'), '+33612345678');
  assert.equal(normalizePhoneForTelegram('+12025550199'), '+12025550199');

  // Invalid numbers
  assert.equal(normalizePhoneForTelegram(''), null);
  assert.equal(normalizePhoneForTelegram(null as any), null);
  assert.equal(normalizePhoneForTelegram(undefined as any), null);
  assert.equal(normalizePhoneForTelegram('0123456'), null); // Invalid prefix 01
  assert.equal(normalizePhoneForTelegram('0555'), null); // Too short
  assert.equal(normalizePhoneForTelegram('0000000000'), null); // All zeros
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
  assert.ok(!renderedWithName.includes('['));

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
  // Permanent skips: PHONE_NOT_OCCUPIED, PRIVACY, USER_NOT_FOUND
  const errNotOnTelegram = new Error('USER_NOT_FOUND');
  const resNotOnTelegram = classifyTelegramError(errNotOnTelegram);
  assert.equal(resNotOnTelegram.category, 'skip_permanent');
  assert.equal(resNotOnTelegram.code, 'NOT_RESOLVABLE');

  const errPrivacy = new Error('USER_PRIVACY_RESTRICTED');
  const resPrivacy = classifyTelegramError(errPrivacy);
  assert.equal(resPrivacy.category, 'skip_permanent');

  // Flood wait
  const errFlood = new Error('FLOOD_WAIT_120');
  const resFlood = classifyTelegramError(errFlood);
  assert.equal(resFlood.category, 'flood_wait');
  assert.equal(resFlood.floodWaitSeconds, 120);

  // Fatal Auth
  const errAuth = new Error('AUTH_KEY_UNREGISTERED');
  const resAuth = classifyTelegramError(errAuth);
  assert.equal(resAuth.category, 'fatal_auth');

  const duplicateAuth = classifyTelegramError(
    new Error('Telegram API error 406: AUTH_KEY_DUPLICATED')
  );
  assert.equal(duplicateAuth.category, 'fatal_auth');
  assert.equal(duplicateAuth.code, 'AUTH_KEY_DUPLICATED');

  // Retryable transient errors
  const errTimeout = new Error('ETIMEDOUT: Connection lost');
  const resTimeout = classifyTelegramError(errTimeout);
  assert.equal(resTimeout.category, 'retryable');

  // MtPeerNotFoundError message format
  const errPeerNotFound = new Error('Peer with phone number 213555123456 was not found');
  const resPeerNotFound = classifyTelegramError(errPeerNotFound);
  assert.equal(resPeerNotFound.category, 'skip_permanent');
  assert.equal(resPeerNotFound.code, 'NOT_RESOLVABLE');

  // User blocked / deactivated
  const errBlocked = new Error('USER_IS_BLOCKED');
  const resBlocked = classifyTelegramError(errBlocked);
  assert.equal(resBlocked.category, 'skip_permanent');
  assert.equal(resBlocked.code, 'MESSAGING_RESTRICTED');
});

test('Session masking and validation', () => {
  assert.equal(TelegramSessionManager.isValidSession(''), false);
  assert.equal(TelegramSessionManager.isValidSession(null), false);
  assert.equal(TelegramSessionManager.isValidSession('short_invalid_session'), false);
  assert.equal(TelegramSessionManager.isValidSession('1BVtsOHQBu7wXyZ1234567890abcdefghijklmnopqrstuvwxyz1234567890'), true);

  assert.equal(TelegramSessionManager.mask(''), '[NO_SESSION]');
  assert.equal(TelegramSessionManager.mask(undefined), '[NO_SESSION]');
  const masked = TelegramSessionManager.mask('1BVtsOHQBu7wXyZ1234567890abcdefghijklmnopqrstuvwxyz');
  assert.ok(masked.startsWith('1BVt...'));
  assert.ok(masked.includes('(51 chars)'));
});
