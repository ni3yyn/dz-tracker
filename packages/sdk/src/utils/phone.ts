/**
 * Algerian Phone Number Utilities for DZ Tracking SDK
 */

/**
 * Normalizes Algerian phone numbers to the international standard (213XXXXXXXXX).
 * Handles formats such as:
 * - Local mobile: 0555123456 -> 213555123456
 * - Local mobile: 0661234567 -> 213661234567
 * - Local mobile: 0770123456 -> 213770123456
 * - International: +213 550 12 34 56 -> 213550123456
 * - Formatted strings with dashes, dots, or spaces
 */
export function normalizeAlgerianPhone(phoneRaw: unknown): string | undefined {
  if (!phoneRaw) return undefined;
  const digits = String(phoneRaw).replace(/[^0-9]/g, '');
  if (!digits) return undefined;

  // Local Algerian format: 05/06/07 followed by 8 digits (10 digits total)
  if (digits.startsWith('0') && digits.length === 10) {
    return '213' + digits.substring(1);
  }

  // Already international format: 213 followed by 9 digits (12 digits total)
  if (digits.startsWith('213') && digits.length === 12) {
    return digits;
  }

  // If 9 digits without leading 0 (e.g. 555123456)
  if ((digits.startsWith('5') || digits.startsWith('6') || digits.startsWith('7')) && digits.length === 9) {
    return '213' + digits;
  }

  return digits;
}

/**
 * Formats a normalized phone number into standard local display format: 0X XX XX XX XX
 */
export function formatAlgerianPhoneDisplay(phone: string): string {
  const norm = normalizeAlgerianPhone(phone);
  if (!norm || !norm.startsWith('213') || norm.length !== 12) {
    return phone;
  }

  const local = '0' + norm.substring(3);
  return `${local.substring(0, 2)} ${local.substring(2, 4)} ${local.substring(4, 6)} ${local.substring(6, 8)} ${local.substring(8, 10)}`;
}
