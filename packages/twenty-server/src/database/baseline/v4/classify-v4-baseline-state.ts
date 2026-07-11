import {
  canonicalizeV4Catalog,
  fingerprintV4Catalog,
  V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT,
  type V4BaselineManifest,
} from './v4-baseline-manifest';

export const MYAH_V4_PRODUCT = 'myah-v4' as const;
export const MYAH_V4_SCHEMA_VERSION = '4.0.0' as const;
export const V4_SCHEMA_FINGERPRINT =
  'myah-v4:4.0.0:baseline-schema' as const;

export type V4CatalogState = V4BaselineManifest;


export type V4BaselineMarker = Readonly<{
  product: typeof MYAH_V4_PRODUCT;
  schemaVersion: typeof MYAH_V4_SCHEMA_VERSION;
  schemaFingerprint: string;
  catalogFingerprint: string;
  appliedAt: string;
}>;

export type V4BaselineState = Readonly<{
  postgresMajorVersion: number;
  catalog: V4CatalogState;
  marker: unknown | null;
}>;

type V4BaselineRejectReason =
  | 'unsupported-postgres-version'
  | 'legacy-migration-present'
  | 'malformed-or-unknown-marker'
  | 'non-pristine-catalog'
  | 'fingerprint-mismatch';

export type V4BaselineClassification =
  | Readonly<{ action: 'apply' }>
  | Readonly<{ action: 'no-op' }>
  | Readonly<{ action: 'reject'; reason: V4BaselineRejectReason }>;

const CATALOG_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCanonicalCatalogFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && CATALOG_FINGERPRINT_PATTERN.test(value);

const isValidTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString() === value
  );
};

const isValidMarker = (value: unknown): value is V4BaselineMarker =>
  isRecord(value) &&
  value.product === MYAH_V4_PRODUCT &&
  value.schemaVersion === MYAH_V4_SCHEMA_VERSION &&
  typeof value.schemaFingerprint === 'string' &&
  isCanonicalCatalogFingerprint(value.catalogFingerprint) &&
  isValidTimestamp(value.appliedAt);
const isPristineCatalog = (catalog: V4CatalogState): boolean =>
  catalog.coreRelations.length === 0 &&
  catalog.publicRelations.length === 0 &&
  catalog.legacyMigrationTables.length === 0 &&
  catalog.catalogFingerprint === V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT &&
  fingerprintV4Catalog(catalog) === V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT;

const isCompletedCatalog = (
  catalog: V4CatalogState,
  manifest: V4BaselineManifest,
): boolean =>
  catalog.catalogFingerprint === manifest.catalogFingerprint &&
  fingerprintV4Catalog(catalog) === manifest.catalogFingerprint;



export const classifyV4BaselineState = (
  state: V4BaselineState,
  manifest: V4BaselineManifest,
): V4BaselineClassification => {
  if (state.postgresMajorVersion !== 16) {
    return { action: 'reject', reason: 'unsupported-postgres-version' };
  }

  if (state.catalog.legacyMigrationTables.length > 0) {
    return { action: 'reject', reason: 'legacy-migration-present' };
  }

  const marker = state.marker;
  if (marker !== null) {
    if (!isValidMarker(marker)) {
      return { action: 'reject', reason: 'malformed-or-unknown-marker' };
    }
    if (
      marker.schemaFingerprint !== V4_SCHEMA_FINGERPRINT ||
      marker.catalogFingerprint !== manifest.catalogFingerprint ||
      !isCompletedCatalog(state.catalog, manifest)
    ) {
      return { action: 'reject', reason: 'fingerprint-mismatch' };
    }

    return { action: 'no-op' };
  }

  if (!isPristineCatalog(state.catalog)) {
    return { action: 'reject', reason: 'non-pristine-catalog' };
  }
  return { action: 'apply' };
};
