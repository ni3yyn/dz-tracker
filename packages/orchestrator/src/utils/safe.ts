/**
 * Defensive data utilities for carrier adapters to ensure bulletproof fault tolerance.
 */

export function safeString(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  return fallback;
}

export function safeLower(val: unknown, fallback = ''): string {
  return safeString(val, fallback).toLowerCase();
}

/**
 * Normalizes strings by removing French diacritics / accents for robust matching
 * e.g., 'expédié' -> 'expedie', 'créé' -> 'cree', 'reçu' -> 'recu'
 */
export function normalizeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Defensively extracts the first existing value from a list of possible keys in a payload.
 */
export function extractFirst(payload: any, candidateKeys: string[], fallback?: string): string | undefined {
  if (!payload || typeof payload !== 'object') return fallback;

  for (const key of candidateKeys) {
    const val = payload[key];
    if (val !== undefined && val !== null && val !== '') {
      const str = safeString(val);
      if (str.length > 0) return str;
    }
  }

  return fallback;
}

/**
 * Defensively cleans customer phone numbers (handling Algerian 05/06/07 patterns).
 */
export function normalizeAlgerianPhone(phoneRaw: unknown): string | undefined {
  if (!phoneRaw) return undefined;
  const digits = String(phoneRaw).replace(/[^0-9]/g, '');
  if (!digits || /^0+$/.test(digits)) return undefined;

  // Local Algerian mobile format: 05, 06, 07 -> 2135 / 2136 / 2137
  if (/^0[567][0-9]{8}$/.test(digits)) {
    return '213' + digits.substring(1);
  }
  // International format: 2135, 2136, 2137
  if (/^213[567][0-9]{8}$/.test(digits)) {
    return digits;
  }
  // General Algerian 10-digit format starting with 0 (landline 021, etc.)
  if (digits.startsWith('0') && digits.length === 10) {
    return '213' + digits.substring(1);
  }
  if (digits.startsWith('213') && digits.length === 12) {
    return digits;
  }
  return digits.length >= 8 ? digits : undefined;
}
