import { createDecipheriv, createHash } from 'node:crypto';

export interface YalidineApiCredentials {
  apiId: string;
  apiToken: string;
}

export function decryptYalidineApiCredentials(
  encrypted: string,
  merchantId: string,
  encryptionSecret: string
): YalidineApiCredentials {
  if (!encryptionSecret || encryptionSecret.length < 32) {
    throw new Error('Credential decryption is not configured.');
  }

  const [version, ivText, tagText, ciphertextText] = String(encrypted || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Stored Guepex credentials have an unsupported encrypted format.');
  }

  const key = createHash('sha256').update(encryptionSecret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAAD(Buffer.from(`${merchantId}:yalidine-webhook:v1`, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));

  const clear = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  const parsed = JSON.parse(clear) as { apiId?: unknown; apiToken?: unknown };
  if (
    typeof parsed.apiId !== 'string' ||
    parsed.apiId.length < 8 ||
    typeof parsed.apiToken !== 'string' ||
    parsed.apiToken.length < 16
  ) {
    throw new Error('Stored Guepex API ID or API Token is missing.');
  }

  return { apiId: parsed.apiId, apiToken: parsed.apiToken };
}
