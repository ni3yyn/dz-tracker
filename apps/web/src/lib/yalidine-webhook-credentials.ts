import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface YalidineWebhookCredentials {
  webhookSecret: string;
  apiId?: string;
  apiToken?: string;
}

function keyFromSecret(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters.');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

function aad(merchantId: string): Buffer {
  return Buffer.from(`${merchantId}:yalidine-webhook:v1`, 'utf8');
}

export function encryptYalidineWebhookCredentials(
  credentials: YalidineWebhookCredentials,
  merchantId: string,
  secret: string
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  cipher.setAAD(aad(merchantId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptYalidineWebhookCredentials(
  encrypted: string,
  merchantId: string,
  secret: string
): YalidineWebhookCredentials {
  const [version, ivText, tagText, ciphertextText] = String(encrypted || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Stored Yalidine webhook credentials have an unsupported encryption format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(ivText, 'base64'));
  decipher.setAAD(aad(merchantId));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(clear) as Partial<YalidineWebhookCredentials>;
  if (
    (parsed.webhookSecret !== undefined && typeof parsed.webhookSecret !== 'string') ||
    (parsed.apiId !== undefined && typeof parsed.apiId !== 'string') ||
    (parsed.apiToken !== undefined && typeof parsed.apiToken !== 'string')
  ) {
    throw new Error('Stored Yalidine credentials are malformed.');
  }
  // Existing webhook-only records remain readable after API credentials are added.
  return {
    webhookSecret: parsed.webhookSecret || '',
    ...(parsed.apiId ? { apiId: parsed.apiId } : {}),
    ...(parsed.apiToken ? { apiToken: parsed.apiToken } : {}),
  };
}
