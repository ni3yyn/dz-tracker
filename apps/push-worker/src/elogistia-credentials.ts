import { createDecipheriv, createHash } from 'node:crypto';

export function decryptElogistiaApiKey(encrypted: string, merchantId: string, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('Credential decryption is not configured.');
  const [version, iv, tag, ciphertext] = String(encrypted || '').split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Stored Elogistia credentials have an unsupported format.');
  const key = createHash('sha256').update(secret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(merchantId + ':elogistia:v1', 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const clear = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(clear) as { apiKey?: unknown };
  if (typeof parsed.apiKey !== 'string' || parsed.apiKey.length < 8) throw new Error('Stored Elogistia API key is invalid.');
  return parsed.apiKey;
}
