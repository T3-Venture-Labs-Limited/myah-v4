
import {
  MYAH_V4_PRODUCT,
  MYAH_V4_SCHEMA_VERSION,
  type V4BaselineMarker,
  type V4BaselineState,
} from './classify-v4-baseline-state';
import {
  canonicalizeV4Catalog,
  fingerprintV4Catalog,
} from './v4-baseline-manifest';

export type V4BaselineQuery = <Row>(
  sql: string,
  parameters?: readonly unknown[],
) => Promise<readonly Row[]>;

type VersionRow = Readonly<{ server_version_num: string | number }>;
type RelationRow = Readonly<{ schema_name: string; relation_name: string }>;
type MarkerRow = Readonly<Record<string, unknown>>;
type ValidMarkerRow = Readonly<{
  product: typeof MYAH_V4_PRODUCT;
  schema_version: typeof MYAH_V4_SCHEMA_VERSION;
  schema_fingerprint: string;
  catalog_fingerprint: string;
  applied_at: string;
}>;

const LEGACY_MIGRATION_RELATIONS: Record<string, true> = {
  _typeorm_migrations: true,
  upgradeMigration: true,
};

const VERSION_SQL = `
SELECT current_setting('server_version_num') AS server_version_num
`;
const RELATIONS_SQL = `
SELECT n.nspname AS schema_name, c.relname AS relation_name
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('core', 'public')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND NOT (n.nspname = 'core' AND c.relname = '_myah_schema_baseline')
ORDER BY n.nspname, c.relname
`;
const MARKER_EXISTS_SQL = `
SELECT to_regclass('core._myah_schema_baseline') AS marker_relation
`;
const MARKER_SQL = `
SELECT product, schema_version, schema_fingerprint, catalog_fingerprint, applied_at
FROM core._myah_schema_baseline
`;

const isMarkerRow = (row: MarkerRow): row is ValidMarkerRow =>
  row.product === MYAH_V4_PRODUCT &&
  row.schema_version === MYAH_V4_SCHEMA_VERSION &&
  typeof row.schema_fingerprint === 'string' &&
  typeof row.catalog_fingerprint === 'string' &&
  typeof row.applied_at === 'string';

const mapMarker = (rows: readonly MarkerRow[]): unknown | null => {
  if (rows.length === 0) return null;
  if (rows.length !== 1 || !isMarkerRow(rows[0])) {
    return rows.length === 1 ? rows[0] : rows;
  }
  const row = rows[0];
  const marker: V4BaselineMarker = {
    product: row.product,
    schemaVersion: row.schema_version,
    schemaFingerprint: row.schema_fingerprint,
    catalogFingerprint: row.catalog_fingerprint,
    appliedAt: row.applied_at,
  };
  return marker;
};
const parsePostgresMajorVersion = (value: unknown): number => {
  const version = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(version) && version >= 0
    ? Math.floor(version / 10000)
    : Number.NaN;
};


export const readV4BaselineState = async (
  query: V4BaselineQuery,
): Promise<V4BaselineState> => {
  const versionRows = await query<VersionRow>(VERSION_SQL);
  const relationRows = await query<RelationRow>(RELATIONS_SQL);
  const markerExistsRows = await query<
    Readonly<{ marker_relation: string | null }>
  >(MARKER_EXISTS_SQL);
  const markerRows =
    markerExistsRows[0]?.marker_relation != null
      ? await query<MarkerRow>(MARKER_SQL)
      : [];
  const postgresMajorVersion = parsePostgresMajorVersion(
    versionRows[0]?.server_version_num,
  );
  const coreRelations = relationRows
    .filter(
      (row) =>
        row.schema_name === 'core' &&
        row.relation_name !== '_myah_schema_baseline',
    )
    .map((row) => row.relation_name);
  const publicRelations = relationRows
    .filter((row) => row.schema_name === 'public')
    .map((row) => row.relation_name);
  const legacyMigrationTables = coreRelations.filter(
    (name) => LEGACY_MIGRATION_RELATIONS[name] === true,
  );
  const canonicalCatalog = canonicalizeV4Catalog({
    coreRelations,
    legacyMigrationTables,
    publicRelations,
  });
  const catalogFingerprint = fingerprintV4Catalog(canonicalCatalog);

  return {
    postgresMajorVersion,
    catalog: {
      ...canonicalCatalog,
      catalogFingerprint,
    },
    marker: mapMarker(markerRows),
  };
};
