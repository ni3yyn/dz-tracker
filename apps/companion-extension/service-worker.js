'use strict';
importScripts('capture-parser.js');

const EXTENSION_VERSION = '1.0.0';
const PRODUCTION_ORIGIN = 'https://tajertrack.vercel.app';
const ALLOWED_PAGE_ORIGINS = new Set([PRODUCTION_ORIGIN, 'http://localhost:3000']);
const CAPTURE_URLS = [
  'https://api.guepex.app/v1/parcels*',
  'https://api.yalidine.app/v1/parcels*'
];

function getSenderOrigin(sender) {
  try { return new URL(sender.url || '').origin; } catch { return ''; }
}
function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function getIdentity() {
  const saved = await chrome.storage.local.get(['installationId', 'privateKeyJwk', 'publicKeyJwk']);
  if (saved.installationId && saved.privateKeyJwk && saved.publicKeyJwk) return saved;
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.privateKey),
    crypto.subtle.exportKey('jwk', pair.publicKey)
  ]);
  const identity = {
    installationId: crypto.randomUUID(),
    privateKeyJwk,
    publicKeyJwk
  };
  await chrome.storage.local.set(identity);
  return identity;
}
async function signText(text) {
  const identity = await getIdentity();
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(text)
  );
  return { identity, signature: toBase64Url(signature) };
}
async function handleExternalMessage(request, sender) {
  const origin = getSenderOrigin(sender);
  if (!ALLOWED_PAGE_ORIGINS.has(origin)) throw new Error('Untrusted TajerTrack origin.');
  if (!request || typeof request !== 'object') throw new Error('Invalid request.');

  if (request.type === 'TT_COMPANION_PING') {
    const identity = await getIdentity();
    return { installed: true, installationId: identity.installationId, version: EXTENSION_VERSION };
  }
  if (request.type === 'TT_COMPANION_SIGN_PAIR') {
    const challenge = String(request.challenge || '');
    const merchantId = String(request.merchantId || '');
    const identity = await getIdentity();
    if (!/^[0-9a-f-]{36}$/i.test(merchantId) || challenge.length < 32 || challenge.length > 256) {
      throw new Error('Invalid pairing challenge.');
    }
    const proof = 'tt-companion-pair-v1\n' + merchantId + '\n' + challenge + '\n' + identity.installationId;
    const signed = await signText(proof);
    return {
      installationId: identity.installationId,
      publicKey: identity.publicKeyJwk,
      signature: signed.signature,
      version: EXTENSION_VERSION
    };
  }
  if (request.type === 'TT_COMPANION_SIGN_PROOF') {
    const purpose = String(request.purpose || '');
    const nonce = String(request.nonce || '');
    if (!/^[a-z-]{2,40}$/.test(purpose) || !/^[A-Za-z0-9_-]{20,128}$/.test(nonce)) {
      throw new Error('Invalid proof request.');
    }
    const identity = await getIdentity();
    const timestamp = Date.now();
    const proof = 'tt-companion-proof-v1\n' + identity.installationId + '\n' +
      purpose + '\n' + timestamp + '\n' + nonce;
    const signed = await signText(proof);
    return { installationId: identity.installationId, timestamp, nonce, signature: signed.signature };
  }
  if (request.type === 'TT_COMPANION_ACTIVATE') {
    const merchantId = String(request.merchantId || '');
    if (!/^[0-9a-f-]{36}$/i.test(merchantId)) throw new Error('Invalid merchant reference.');
    await chrome.storage.local.set({
      pairing: { merchantId, apiOrigin: origin, activatedAt: new Date().toISOString() }
    });
    return { success: true };
  }
  return { error: 'Unsupported request.' };
}

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  handleExternalMessage(request, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ error: error && error.message ? error.message : 'Companion request failed.' }));
  return true;
});

async function postCapture(captured) {
  const saved = await chrome.storage.local.get(['pairing', 'installationId']);
  const pairing = saved.pairing;
  const installationId = saved.installationId;
  if (!pairing || !pairing.merchantId || !pairing.apiOrigin || !installationId) return;
  const apiOrigin = ALLOWED_PAGE_ORIGINS.has(pairing.apiOrigin) ? pairing.apiOrigin : '';
  if (!apiOrigin) return;

  const body = JSON.stringify({ installationId, payload: captured });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signed = await signText(timestamp + '\n' + nonce + '\n' + body);
  const response = await fetch(apiOrigin + '/api/companion/capture', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-TT-Timestamp': timestamp,
      'X-TT-Nonce': nonce,
      'X-TT-Signature': signed.signature
    },
    body
  });
  if (!response.ok) {
    console.warn('[TajerTrack Companion] Capture endpoint returned HTTP', response.status);
  }
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (details.method !== 'POST' || !details.requestBody) return;
  const captured = globalThis.TTCompanionParser.extractParcelIdentity(details.requestBody);
  if (!captured) return;
  void postCapture(captured).catch((error) => {
    console.warn('[TajerTrack Companion] Could not submit a parcel capture:', error && error.message ? error.message : 'unknown error');
  });
}, { urls: CAPTURE_URLS }, ['requestBody']);
