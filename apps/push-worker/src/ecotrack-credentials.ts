import { createDecipheriv, createHash } from 'node:crypto';

export function decryptEcoTrackToken(
  encrypted: string,
  merchantId: string,
  encryptionSecret: string
): string {
  if (!encrypted || !encryptionSecret) {
    throw new Error('EcoTrack credential decryption is not configured.');
  }

  const [version, ivBase64, tagBase64, ciphertextBase64] = encrypted.split('.');
  if (version !== 'v1' || !ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new Error('Stored EcoTrack credentials have an unsupported format. Reconnect the account.');
  }

  const key = createHash('sha256').update(encryptionSecret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAAD(Buffer.from(`${merchantId}:ecotrack:v1`, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  const clear = Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  const parsed = JSON.parse(clear) as { token?: unknown };
  if (typeof parsed.token !== 'string' || !parsed.token.trim()) {
    throw new Error('Stored EcoTrack access token is empty. Reconnect the account.');
  }
  return parsed.token;
}
