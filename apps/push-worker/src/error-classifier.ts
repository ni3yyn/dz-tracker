export interface ClassifiedPushError {
  category: 'expired_subscription' | 'rate_limited' | 'retryable' | 'fatal_client';
  code: string;
  message: string;
  statusCode?: number;
  retryAfterSeconds?: number;
}

export function classifyPushError(error: any): ClassifiedPushError {
  const statusCode = error?.statusCode || error?.status;
  const message = error?.message || String(error);

  // 1. Subscription Expired / Unsubscribed (404 Not Found, 410 Gone)
  if (statusCode === 404 || statusCode === 410 || /gone|unsubscribed|not\s*found/i.test(message)) {
    return {
      category: 'expired_subscription',
      code: 'SUBSCRIPTION_EXPIRED',
      message: 'The push subscription endpoint is no longer active or was unsubscribed by user.',
      statusCode,
    };
  }

  // 2. Rate-Limiting by push service (429 Too Many Requests)
  if (statusCode === 429) {
    let retryAfterSeconds = 60;
    const retryHeader = error?.headers?.['retry-after'];
    if (retryHeader) {
      const parsed = parseInt(retryHeader, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterSeconds = Math.min(parsed, 3600);
      }
    }
    return {
      category: 'rate_limited',
      code: 'RATE_LIMITED',
      message: 'Push service returned 429 Too Many Requests.',
      statusCode: 429,
      retryAfterSeconds,
    };
  }

  // 3. Temporary Server / Network Errors (5xx, timeouts, connection drops)
  if (
    (statusCode && statusCode >= 500 && statusCode < 600) ||
    /timeout|econnreset|etimedout|eai_again|enotfound/i.test(message)
  ) {
    return {
      category: 'retryable',
      code: 'NETWORK_OR_SERVER_ERROR',
      message: `Temporary push service error (status: ${statusCode || 'n/a'}).`,
      statusCode,
    };
  }

  // 4. Fatal Client / VAPID Errors (400 Bad Request, 401 Unauthorized, 403 Forbidden)
  return {
    category: 'fatal_client',
    code: `CLIENT_ERROR_${statusCode || 'UNKNOWN'}`,
    message: message.slice(0, 300),
    statusCode,
  };
}

