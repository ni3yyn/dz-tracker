/**
 * Utilities for loading, validating, and masking MTProto session strings.
 */
export class TelegramSessionManager {
  /**
   * Validates whether a provided session string looks structurally complete.
   */
  static isValidSession(session: string | null | undefined): boolean {
    if (!session || typeof session !== 'string') return false;
    const trimmed = session.trim();
    // MTProto session strings are typically base64 encoded strings of at least 50 chars
    return trimmed.length >= 30;
  }

  /**
   * Masks a session string for safe diagnostic display without exposing secrets.
   */
  static mask(session: string | null | undefined): string {
    if (!session || typeof session !== 'string') return '[NO_SESSION]';
    const trimmed = session.trim();
    if (trimmed.length <= 10) return '***';
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)} (${trimmed.length} chars)`;
  }
}

