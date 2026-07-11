import {
  MYAH_V4_PRODUCT,
  MYAH_V4_SCHEMA_VERSION,
  V4_SCHEMA_FINGERPRINT,
  classifyV4BaselineState,
  type V4BaselineState,
} from './classify-v4-baseline-state';
import {
  createV4BaselineManifest,
  V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT,
} from './v4-baseline-manifest';

const completedManifest = createV4BaselineManifest({
  coreRelations: ['account'],
  publicRelations: ['contact'],
});
const classify = (baselineState: V4BaselineState) =>
  classifyV4BaselineState(baselineState, completedManifest);

const pristineCatalog = {
  coreRelations: [],
  publicRelations: [],
  legacyMigrationTables: [],
  catalogFingerprint: V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT,
} as const;

const exactMarker = {
  product: MYAH_V4_PRODUCT,
  schemaVersion: MYAH_V4_SCHEMA_VERSION,
  schemaFingerprint: V4_SCHEMA_FINGERPRINT,
  catalogFingerprint: completedManifest.catalogFingerprint,
  appliedAt: '2026-07-11T00:00:00.000Z',
} as const;
const state = (overrides: Partial<V4BaselineState>): V4BaselineState => ({
  postgresMajorVersion: 16,
  catalog: pristineCatalog,
  marker: null,
  ...overrides,
});

describe('classifyV4BaselineState', () => {
  it('allows a pristine PostgreSQL 16 database to apply', () => {
    expect(classify(state({}))).toEqual({ action: 'apply' });
  });

  it('allows an exact marker and matching catalog to no-op', () => {
    expect(
      classify(
        state({ catalog: completedManifest, marker: exactMarker }),
      ),
    ).toEqual({
      action: 'no-op',
    });
  });

  it.each([15, 17])('rejects PostgreSQL %s', (postgresMajorVersion) => {
    expect(classify(state({ postgresMajorVersion }))).toMatchObject(
      { action: 'reject', reason: 'unsupported-postgres-version' },
    );
  });

  it('rejects legacy migration presence', () => {
    expect(
      classify(state({
        catalog: { ...pristineCatalog, legacyMigrationTables: ['migrations'] },
      })),
    ).toMatchObject({ action: 'reject', reason: 'legacy-migration-present' });
  });

  it('rejects malformed or unknown markers', () => {
    expect(
      classify(state({ marker: { product: 'other' } })),
    ).toMatchObject({ action: 'reject', reason: 'malformed-or-unknown-marker' });
  });

  it('rejects a non-pristine catalog without an exact marker', () => {
    expect(
      classify(state({
        catalog: { ...pristineCatalog, coreRelations: ['account'] },
      })),
    ).toMatchObject({ action: 'reject', reason: 'non-pristine-catalog' });
  });

  it('rejects an exact marker with a fingerprint mismatch', () => {
    expect(
      classify(state({
        marker: { ...exactMarker, schemaFingerprint: 'wrong-fingerprint' },
      })),
    ).toMatchObject({ action: 'reject', reason: 'fingerprint-mismatch' });
  });

  it('rejects a marker and live catalog sharing an arbitrary fingerprint', () => {
    const driftFingerprint = 'sha256:' + 'a'.repeat(64);

    expect(
      classify(state({
        catalog: { ...pristineCatalog, catalogFingerprint: driftFingerprint },
        marker: { ...exactMarker, catalogFingerprint: driftFingerprint },
      })),
    ).toMatchObject({ action: 'reject', reason: 'fingerprint-mismatch' });
  });

  it('rejects nonempty relations even when marker and catalog use expected fingerprint', () => {
    expect(
      classify(state({
        catalog: { ...pristineCatalog, coreRelations: ['account'] },
        marker: exactMarker,
      })),
    ).toMatchObject({ action: 'reject', reason: 'fingerprint-mismatch' });
  });

  it('rejects a marker with an invalid timestamp', () => {
    expect(
      classify(state({ marker: { ...exactMarker, appliedAt: 'not-a-timestamp' } })),
    ).toMatchObject({ action: 'reject', reason: 'malformed-or-unknown-marker' });
  });

  it.each(['', 'not-a-fingerprint'])(
    'rejects a marker with catalog fingerprint %j',
    (catalogFingerprint) => {
      expect(
        classify(state({ marker: { ...exactMarker, catalogFingerprint } })),
      ).toMatchObject({ action: 'reject', reason: 'malformed-or-unknown-marker' });
    },
  );
});
