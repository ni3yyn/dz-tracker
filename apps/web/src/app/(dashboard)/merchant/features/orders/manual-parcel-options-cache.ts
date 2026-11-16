const CACHE_NAMESPACE = 'tajertrack:yalidine-manual-options:v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ManualParcelOptionsCacheHit<T> {
  options: T;
  savedAt: number;
  isFresh: boolean;
}

function storageOrNull(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(merchantId: string, cacheVersion: string): string {
  return `${CACHE_NAMESPACE}:${encodeURIComponent(merchantId)}:${cacheVersion}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isManualParcelOptions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const wilayas = value.wilayas;
  const communes = value.communes;
  const centers = value.centers;
  if (
    !Array.isArray(wilayas) ||
    wilayas.length === 0 ||
    wilayas.length > 1000 ||
    !Array.isArray(communes) ||
    communes.length === 0 ||
    communes.length > 20_000 ||
    !Array.isArray(centers) ||
    centers.length > 10_000
  ) {
    return false;
  }

  const validWilayas = wilayas.every((item) =>
    isRecord(item) &&
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.is_deliverable === 'boolean'
  );
  const validCommunes = communes.every((item) =>
    isRecord(item) &&
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    Number.isSafeInteger(item.wilaya_id) &&
    Number(item.wilaya_id) > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.wilaya_name === 'string' &&
    typeof item.is_deliverable === 'boolean'
  );
  const validCenters = centers.every((item) =>
    isRecord(item) &&
    Number.isSafeInteger(item.center_id) &&
    Number(item.center_id) > 0 &&
    Number.isSafeInteger(item.wilaya_id) &&
    Number(item.wilaya_id) > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0
  );

  return validWilayas && validCommunes && validCenters;
}

function removeOtherMerchantVersions(storage: Storage, merchantId: string, keepKey: string): void {
  const prefix = `${CACHE_NAMESPACE}:${encodeURIComponent(merchantId)}:`;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && key.startsWith(prefix) && key !== keepKey) {
      storage.removeItem(key);
    }
  }
}

/**
 * Reads a fresh or stale location snapshot. Stale data is intentionally
 * returned so the form can remain usable while a background refresh runs.
 */
export function readManualParcelOptionsCache<T>(
  merchantId: string,
  cacheVersion: string
): ManualParcelOptionsCacheHit<T> | null {
  if (!merchantId || !/^[a-f0-9]{64}$/i.test(cacheVersion)) return null;
  const storage = storageOrNull();
  if (!storage) return null;

  const key = cacheKey(merchantId, cacheVersion);
  try {
    const raw = storage.getItem(key);
    removeOtherMerchantVersions(storage, merchantId, key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.cacheVersion !== cacheVersion ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.savedAt) ||
      parsed.savedAt > Date.now() + MAX_CLOCK_SKEW_MS ||
      !isManualParcelOptions(parsed.options)
    ) {
      storage.removeItem(key);
      return null;
    }

    const age = Math.max(0, Date.now() - parsed.savedAt);
    return {
      options: parsed.options as T,
      savedAt: parsed.savedAt,
      isFresh: age <= CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

/**
 * Stores only the public wilaya/commune/centre lists. No carrier credentials
 * or authentication data are written to browser storage.
 */
export function writeManualParcelOptionsCache<T>(
  merchantId: string,
  cacheVersion: string,
  options: T
): void {
  if (!merchantId || !/^[a-f0-9]{64}$/i.test(cacheVersion) || !isManualParcelOptions(options)) return;
  const storage = storageOrNull();
  if (!storage) return;

  const key = cacheKey(merchantId, cacheVersion);
  try {
    storage.setItem(key, JSON.stringify({
      schemaVersion: 1,
      cacheVersion,
      savedAt: Date.now(),
      options,
    }));
    removeOtherMerchantVersions(storage, merchantId, key);
  } catch {
    // Storage may be disabled or full. The form can still use the live response.
  }
}
