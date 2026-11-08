import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface ZRExpressCredentials {
  apiKey: string;
  tenantId: string;
  signingSecret: string;
}

function encryptionKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters and match in Vercel and Railway.');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

function aad(merchantId: string): Buffer {
  return Buffer.from(`${merchantId}:zrexpress:v1`, 'utf8');
}

export function encryptZRExpressCredentials(
  credentials: ZRExpressCredentials,
  merchantId: string,
  secret: string
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(aad(merchantId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decryptZRExpressCredentials(
  encrypted: string,
  merchantId: string,
  secret: string
): ZRExpressCredentials {
  const [version, ivText, tagText, ciphertextText] = encrypted.split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Stored ZR Express credentials have an unsupported encryption format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(secret),
    Buffer.from(ivText, 'base64')
  );
  decipher.setAAD(aad(merchantId));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(clear) as Partial<ZRExpressCredentials>;
  if (
    typeof parsed.apiKey !== 'string' ||
    typeof parsed.tenantId !== 'string' ||
    typeof parsed.signingSecret !== 'string' ||
    !parsed.signingSecret.startsWith('whsec_')
  ) {
    throw new Error('Stored ZR Express credentials are incomplete.');
  }
  return parsed as ZRExpressCredentials;
}
