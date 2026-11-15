export const TAJERTRACK_COMPANION_EXTENSION_ID = 'lamnkglhnmpmiohlobomemambekiiodn';

export type CompanionProof = {
  installationId: string;
  timestamp: number;
  nonce: string;
  signature: string;
};

type CompanionMessage = Record<string, unknown>;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function sendCompanionMessage<T = any>(message: CompanionMessage): Promise<T> {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.runtime?.sendMessage) {
    return Promise.reject(new Error('لم يتم العثور على إضافة TajerTrack Companion في هذا المتصفح.'));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error('لم تستجب إضافة TajerTrack Companion. تأكد من تفعيلها ثم أعد المحاولة.')));
    }, 7000);

    try {
      chromeApi.runtime.sendMessage(
        TAJERTRACK_COMPANION_EXTENSION_ID,
        message,
        (response: any) => {
          const runtimeError = chromeApi.runtime.lastError;
          if (runtimeError) {
            finish(() => reject(new Error('الإضافة غير متاحة. افتح chrome://extensions وتأكد من تفعيل TajerTrack Companion.')));
            return;
          }
          if (!response || response.error) {
            finish(() => reject(new Error(response?.error || 'أعادت الإضافة استجابة غير صالحة.')));
            return;
          }
          finish(() => resolve(response as T));
        }
      );
    } catch {
      finish(() => reject(new Error('تعذر الاتصال بإضافة TajerTrack Companion.')));
    }
  });
}

export async function getCompanionPresence(): Promise<{
  installed: boolean;
  installationId?: string;
  version?: string;
}> {
  return sendCompanionMessage({ type: 'TT_COMPANION_PING' });
}

export async function signCompanionProof(purpose: string): Promise<CompanionProof> {
  const nonceBytes = new Uint8Array(24);
  crypto.getRandomValues(nonceBytes);
  const nonce = encodeBase64Url(nonceBytes);
  return sendCompanionMessage<CompanionProof>({
    type: 'TT_COMPANION_SIGN_PROOF',
    purpose,
    nonce,
  });
}

export function signCompanionPairing(challenge: string, merchantId: string): Promise<{
  installationId: string;
  publicKey: JsonWebKey;
  signature: string;
  version: string;
}> {
  return sendCompanionMessage({
    type: 'TT_COMPANION_SIGN_PAIR',
    challenge,
    merchantId,
  });
}

export function activateCompanionPairing(merchantId: string): Promise<{ success: boolean }> {
  return sendCompanionMessage({ type: 'TT_COMPANION_ACTIVATE', merchantId });
}
