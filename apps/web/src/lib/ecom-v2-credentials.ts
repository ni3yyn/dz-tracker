import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function encryptEcomV2Credentials(apiKey: string, apiToken: string, merchantId: string, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters.');
  const key = createHash('sha256').update(secret, 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(merchantId + ':ecom-v2:v1', 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ apiKey, apiToken }), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptEcomV2Credentials(encrypted: string, merchantId: string, secret: string): { apiKey: string; apiToken: string } {
  if (!secret || secret.length < 32) throw new Error('Credential encryption is not configured.');
  const [version, iv, tag, ciphertext] = String(encrypted || '').split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Stored E-com Delivery v2 credentials have an unsupported format.');
  const key = createHash('sha256').update(secret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(merchantId + ':ecom-v2:v1', 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const clear = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(clear) as { apiKey?: unknown; apiToken?: unknown };
  if (typeof parsed.apiKey !== 'string' || parsed.apiKey.length < 4 || typeof parsed.apiToken !== 'string' || parsed.apiToken.length < 4) {
    throw new Error('Stored E-com Delivery v2 credentials are invalid.');
  }
  return { apiKey: parsed.apiKey, apiToken: parsed.apiToken };
}
