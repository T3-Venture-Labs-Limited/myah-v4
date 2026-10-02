import { createHash } from 'crypto';

// Stable JSON: object keys sorted at every depth, array order kept, and
// undefined object values dropped (the CRUD executor drops them too).
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      );

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value ?? null);
};

export const computeGenericApprovalDigest = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');
