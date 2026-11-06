/**
 * Strict Algerian & International phone normalization and validation
 * dedicated for Telegram MTProto contacts.resolvePhone lookup.
 */
export function normalizePhoneForTelegram(phoneRaw: unknown): string | null {
  if (!phoneRaw || typeof phoneRaw !== 'string' && typeof phoneRaw !== 'number') {
    return null;
  }

  const str = String(phoneRaw).trim();
  if (!str) return null;

  // Strip all non-digit characters except leading plus if present
  let hasPlus = str.startsWith('+');
  let digits = str.replace(/[^0-9]/g, '');

  if (!digits || digits.length < 8) {
    return null;
  }

  // Reject all zeros (e.g. 0000000000)
  if (/^0+$/.test(digits)) {
    return null;
  }

  // Support 00 international prefix notation (e.g. 00213...)
  if (digits.startsWith('00')) {
    hasPlus = true;
    digits = digits.slice(2);
  }

  // 1. Algerian mobile patterns with leading 0: 05, 06, 07 followed by 8 digits (total 10 digits)
  if (/^0[567][0-9]{8}$/.test(digits)) {
    return `+213${digits.substring(1)}`;
  }

  // 2. Algerian mobile patterns without leading 0: 5, 6, 7 followed by 8 digits (total 9 digits)
  if (/^[567][0-9]{8}$/.test(digits)) {
    return `+213${digits}`;
  }

  // 3. Algerian mobile with country code: 2135, 2136, 2137 followed by 8 digits (total 12 digits)
  if (/^213[567][0-9]{8}$/.test(digits)) {
    return `+${digits}`;
  }

  // 4. General international format with explicit plus / 00 prefix and 9-15 digits
  if (hasPlus && digits.length >= 9 && digits.length <= 15) {
    return `+${digits}`;
  }

  // Non-compliant or ambiguous format
  return null;
}

