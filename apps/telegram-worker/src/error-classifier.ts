export type ErrorCategory =
  | 'skip_permanent'
  | 'retryable'
  | 'flood_wait'
  | 'fatal_auth'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  code: string;
  message: string;
  floodWaitSeconds?: number;
}

export function classifyTelegramError(err: any): ClassifiedError {
  if (!err) {
    return {
      category: 'unknown',
      code: 'UNKNOWN_ERROR',
      message: 'Empty or undefined error encountered',
    };
  }

  const rawMsg = String(err.message || err.text || err.code || err).trim();
  const upper = rawMsg.toUpperCase();

  // 1. Flood Wait detection (e.g. FLOOD_WAIT_30 or FLOOD_WAIT_X)
  const floodMatch = upper.match(/FLOOD_WAIT_?(\d+)/i) || rawMsg.match(/wait\s*(\d+)\s*seconds/i);
  if (floodMatch) {
    const seconds = Math.max(1, parseInt(floodMatch[1], 10));
    return {
      category: 'flood_wait',
      code: 'FLOOD_WAIT',
      message: `Telegram rate limit: must wait ${seconds} seconds`,
      floodWaitSeconds: seconds,
    };
  }

  // 2. Phone not resolvable / Privacy prevents resolution
  if (
    upper.includes('PHONE_NOT_OCCUPIED') ||
    upper.includes('USER_NOT_FOUND') ||
    upper.includes('CONTACT_MISSING') ||
    upper.includes('PRIVACY') ||
    upper.includes('PEER_NOT_FOUND') ||
    upper.includes('WAS NOT FOUND') ||
    upper.includes('NOT FOUND')
  ) {
    return {
      category: 'skip_permanent',
      code: 'NOT_RESOLVABLE',
      message: 'Customer phone number is not registered on Telegram or privacy settings prohibit resolution',
    };
  }

  // 3. User blocked or messaging not permitted
  if (
    upper.includes('USER_IS_BLOCKED') ||
    upper.includes('YOU_BLOCKED_USER') ||
    upper.includes('INPUT_USER_DEACTIVATED') ||
    upper.includes('USER_DEACTIVATED')
  ) {
    return {
      category: 'skip_permanent',
      code: 'MESSAGING_RESTRICTED',
      message: 'Cannot send message to this user (deactivated or blocked)',
    };
  }

  // 4. Authentication / Session failures (Fatal)
  if (
    upper.includes('AUTH_KEY_UNREGISTERED') ||
    upper.includes('AUTH_KEY_INVALID') ||
    upper.includes('SESSION_REVOKED') ||
    upper.includes('SESSION_EXPIRED') ||
    upper.includes('USER_DEACTIVATED_BAN')
  ) {
    return {
      category: 'fatal_auth',
      code: 'SESSION_INVALID',
      message: 'Telegram session has been revoked or expired. Manual re-authentication required.',
    };
  }

  // 5. Transient / Network / Connection timeouts (Retryable)
  if (
    upper.includes('ETIMEDOUT') ||
    upper.includes('ECONNRESET') ||
    upper.includes('ECONNREFUSED') ||
    upper.includes('TIMEOUT') ||
    upper.includes('NETWORK_TIMEOUT') ||
    upper.includes('CONNECTION_CLOSED') ||
    upper.includes('RPC_TIMEOUT')
  ) {
    return {
      category: 'retryable',
      code: 'NETWORK_TIMEOUT',
      message: 'Temporary network failure while communicating with Telegram MTProto servers',
    };
  }

  // Default fallback
  return {
    category: 'retryable',
    code: 'GENERIC_ERROR',
    message: rawMsg.slice(0, 300),
  };
}

