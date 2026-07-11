import {
  readV4BaselineState,
  type V4BaselineQuery,
} from './read-v4-baseline-state';
import {
  MYAH_V4_PRODUCT,
  MYAH_V4_SCHEMA_VERSION,
  V4_SCHEMA_FINGERPRINT,
} from './classify-v4-baseline-state';
import { V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT } from './v4-baseline-manifest';

type QueryFixture = Readonly<{
  version: readonly Record<string, unknown>[];
  relations: readonly Record<string, unknown>[];
  markers: readonly Record<string, unknown>[];
}>;

const exactMarker = {
  product: MYAH_V4_PRODUCT,
  schema_version: MYAH_V4_SCHEMA_VERSION,
  schema_fingerprint: V4_SCHEMA_FINGERPRINT,
  catalog_fingerprint: V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT,
  applied_at: '2026-07-11T00:00:00.000Z',
} as const;

const queryFor = (fixture: QueryFixture, seen: string[]): V4BaselineQuery =>
  async <Row>(sql: string): Promise<readonly Row[]> => {
    seen.push(sql);
    const rows = sql.includes('server_version_num')
      ? fixture.version
      : sql.includes('to_regclass')
        ? [{ marker_relation: fixture.markers.length > 0 ? 'core._myah_schema_baseline' : null }]
        : sql.includes('SELECT product')
          ? fixture.markers
          : fixture.relations;
    return rows as readonly unknown[] as readonly Row[];
  };

describe('readV4BaselineState', () => {
  it('reads PostgreSQL state in order and maps core/public relations and legacy tables', async () => {
    const seen: string[] = [];
    const state = await readV4BaselineState(
      queryFor(
        {
          version: [{ server_version_num: '160004' }],
          relations: [
            { schema_name: 'core', relation_name: 'unrelated' },
            { schema_name: 'public', relation_name: 'contact' },
            { schema_name: 'core', relation_name: 'workspace' },
            { schema_name: 'core', relation_name: 'migrations' },
            { schema_name: 'core', relation_name: '_typeorm_migrations' },
            { schema_name: 'core', relation_name: 'upgradeMigration' },
            { schema_name: 'core', relation_name: '_myah_schema_baseline' },
          ],
          markers: [],
        },
        seen,
      ),
    );

    expect(state.postgresMajorVersion).toBe(16);
    expect(state.catalog.coreRelations).toEqual([
      '_typeorm_migrations',
      'migrations',
      'unrelated',
      'upgradeMigration',
      'workspace',
    ]);
    expect(state.catalog.publicRelations).toEqual(['contact']);
    expect(state.catalog.legacyMigrationTables).toEqual([
      '_typeorm_migrations',
      'upgradeMigration',
    ]);
    expect(state.marker).toBeNull();
    expect(seen).toHaveLength(3);
    expect(seen.every((sql) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  });
  it('parses PostgreSQL 16 from 160000 and excludes the baseline marker relation', async () => {
    const state = await readV4BaselineState(
      queryFor(
        {
          version: [{ server_version_num: '160000' }],
          relations: [
            { schema_name: 'core', relation_name: '_myah_schema_baseline' },
            { schema_name: 'core', relation_name: 'workspace' },
          ],
          markers: [],
        },
        [],
      ),
    );

    expect(state.postgresMajorVersion).toBe(16);
    expect(state.catalog.coreRelations).toEqual(['workspace']);
  });

  it('returns null when the marker table is absent', async () => {
    const state = await readV4BaselineState(
      async <Row>(sql: string): Promise<readonly Row[]> => {
        if (sql.includes('server_version_num')) {
          return [{ server_version_num: '160000' }] as readonly unknown[] as readonly Row[];
        }
        if (sql.includes('to_regclass')) {
          return [{ marker_relation: null }] as readonly unknown[] as readonly Row[];
        }
        if (sql.includes('SELECT product')) {
          throw new Error('marker table must not be queried when absent');
        }
        return [] as readonly Row[];
      },
    );

    expect(state.marker).toBeNull();
  });


  it('maps no marker to null', async () => {
    const state = await readV4BaselineState(
      queryFor({ version: [{ server_version_num: '160000' }], relations: [], markers: [] }, []),
    );
    expect(state.marker).toBeNull();
  });

  it('maps an exact marker', async () => {
    const state = await readV4BaselineState(
      queryFor({ version: [{ server_version_num: '160000' }], relations: [], markers: [exactMarker] }, []),
    );
    expect(state.marker).toEqual({
      product: exactMarker.product,
      schemaVersion: exactMarker.schema_version,
      schemaFingerprint: exactMarker.schema_fingerprint,
      catalogFingerprint: exactMarker.catalog_fingerprint,
      appliedAt: exactMarker.applied_at,
    });
  });

  it('preserves malformed marker rows as unknown input', async () => {
    const malformed = { product: MYAH_V4_PRODUCT, unexpected: true };
    const state = await readV4BaselineState(
      queryFor({ version: [{ server_version_num: '160000' }], relations: [], markers: [malformed] }, []),
    );
    expect(state.marker).toEqual(malformed);
  });

  it('preserves multiple marker rows as unknown input', async () => {
    const markers = [exactMarker, { ...exactMarker, applied_at: '2026-07-12T00:00:00.000Z' }];
    const state = await readV4BaselineState(
      queryFor({ version: [{ server_version_num: '160000' }], relations: [], markers }, []),
    );
    expect(state.marker).toEqual(markers);
  });
});
