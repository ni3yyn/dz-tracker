export type ElogistiaWilaya = {
  id: string;
  name: string;
  homeFee?: string;
  stopDeskFee?: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function findRows(payload: unknown, depth = 0): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(asRecord).filter((row): row is JsonRecord => row !== null);
  }

  const record = asRecord(payload);
  if (!record || depth > 4) return [];

  const hasWilayaIdentity = (
    record.wilayaID != null ||
    record.wilayaId != null ||
    record.wilaya_id != null ||
    record.code_wilaya != null
  ) && (
    record.wilayaLabel != null ||
    record.wilayaName != null ||
    record.wilaya_name != null ||
    record.name != null ||
    record.nom != null
  );

  if (hasWilayaIdentity) return [record];

  for (const key of ['body', 'data', 'result', 'results', 'wilayas', 'fees', 'items']) {
    if (record[key] !== undefined && record[key] !== null) {
      const rows = findRows(record[key], depth + 1);
      if (rows.length) return rows;
    }
  }

  return [];
}

/**
 * Elogistia exposes its available wilayas through getShippingCost, not a
 * standalone getWilayas endpoint. Its native rows use wilayaID/wilayaLabel.
 */
export function parseElogistiaWilayas(payload: unknown): ElogistiaWilaya[] {
  const seen = new Set<string>();
  const result: ElogistiaWilaya[] = [];

  for (const row of findRows(payload)) {
    const id = asText(
      row.wilayaID ?? row.wilayaId ?? row.wilaya_id ?? row.code_wilaya ?? row.id ?? row.code,
    );
    const name = asText(
      row.wilayaLabel ?? row.wilayaName ?? row.wilaya_name ?? row.name ?? row.nom ?? row.wilaya ?? row.label,
    );

    if (!/^\d{1,3}$/.test(id) || Number(id) < 1 || !name) continue;
    const identity = String(Number(id));
    if (seen.has(identity)) continue;
    seen.add(identity);

    const homeFee = asText(row.home ?? row.homeFee ?? row.home_fee);
    const stopDeskFee = asText(row.stopdesk ?? row.stopDesk ?? row.stopdeskFee ?? row.stop_desk_fee);

    result.push({
      id,
      name,
      ...(homeFee ? { homeFee } : {}),
      ...(stopDeskFee ? { stopDeskFee } : {}),
    });
  }

  return result;
}
