import { createDecipheriv, createHash } from 'node:crypto';

export interface ProcolisCredentials {
  token: string;
  key: string;
}

export function decryptProcolisCredentials(
  encrypted: string,
  merchantId: string,
  secret: string
): ProcolisCredentials {
  if (!secret || secret.length < 32) {
    throw new Error('Credential decryption is not configured.');
  }

  const [version, ivText, tagText, ciphertextText] = String(encrypted || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Stored Procolis credentials have an unsupported format. Reconnect the account.');
  }

  const key = createHash('sha256').update(secret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAAD(Buffer.from(`${merchantId}:procolis:v1`, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));

  const clear = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(clear) as Partial<ProcolisCredentials>;

  if (
    typeof parsed.token !== 'string' || parsed.token.length < 4 ||
    typeof parsed.key !== 'string' || parsed.key.length < 4
  ) {
    throw new Error('Stored Procolis credentials are incomplete. Reconnect the account.');
  }

  return { token: parsed.token, key: parsed.key };
}
