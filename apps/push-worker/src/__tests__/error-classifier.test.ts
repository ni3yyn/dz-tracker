import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyPushError } from '../error-classifier.js';

describe('classifyPushError', () => {
  it('classifies 410 Gone as expired_subscription', () => {
    const error = { statusCode: 410, message: 'Push subscription has unsubscribed or expired.' };
    const result = classifyPushError(error);
    assert.strictEqual(result.category, 'expired_subscription');
    assert.strictEqual(result.code, 'SUBSCRIPTION_EXPIRED');
    assert.strictEqual(result.statusCode, 410);
  });

  it('classifies 404 Not Found as expired_subscription', () => {
    const error = { statusCode: 404, message: 'Endpoint not found.' };
    const result = classifyPushError(error);
    assert.strictEqual(result.category, 'expired_subscription');
    assert.strictEqual(result.code, 'SUBSCRIPTION_EXPIRED');
  });

  it('classifies 429 Too Many Requests as rate_limited and extracts retry-after', () => {
    const error = {
      statusCode: 429,
      headers: { 'retry-after': '120' },
      message: 'Too many requests.',
    };
    const result = classifyPushError(error);
    assert.strictEqual(result.category, 'rate_limited');
    assert.strictEqual(result.code, 'RATE_LIMITED');
    assert.strictEqual(result.retryAfterSeconds, 120);
  });

  it('classifies 500/502/503 server errors as retryable', () => {
    const error500 = { statusCode: 500, message: 'Internal Server Error' };
    assert.strictEqual(classifyPushError(error500).category, 'retryable');

    const error503 = { statusCode: 503, message: 'Service Unavailable' };
    assert.strictEqual(classifyPushError(error503).category, 'retryable');
  });

  it('classifies network timeouts and connection resets as retryable', () => {
    const timeoutErr = new Error('connect ETIMEDOUT 142.250.180.202:443');
    assert.strictEqual(classifyPushError(timeoutErr).category, 'retryable');

    const connResetErr = new Error('read ECONNRESET');
    assert.strictEqual(classifyPushError(connResetErr).category, 'retryable');
  });

  it('classifies 400 Bad Request and 401 Unauthorized as fatal_client', () => {
    const badRequest = { statusCode: 400, message: 'Invalid payload' };
    const result400 = classifyPushError(badRequest);
    assert.strictEqual(result400.category, 'fatal_client');
    assert.strictEqual(result400.code, 'CLIENT_ERROR_400');

    const unauthorized = { statusCode: 401, message: 'Unauthorized VAPID subject' };
    const result401 = classifyPushError(unauthorized);
    assert.strictEqual(result401.category, 'fatal_client');
    assert.strictEqual(result401.code, 'CLIENT_ERROR_401');
  });
});

