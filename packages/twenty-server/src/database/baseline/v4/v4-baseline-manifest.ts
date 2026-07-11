import { createHash } from 'node:crypto';

export type V4BaselineManifest = Readonly<{
  coreRelations: readonly string[];
  publicRelations: readonly string[];
  legacyMigrationTables: readonly string[];
  catalogFingerprint: string;
}>;

type V4RelationInput = Readonly<{
  coreRelations: readonly string[];
  publicRelations: readonly string[];
  legacyMigrationTables?: readonly string[];
}>;

const LEGACY_RELATION_NAMES: Record<string, true> = {
  _typeorm_migrations: true,
  upgradeMigration: true,
};

const sortedUniqueRelations = (
  relations: readonly string[],
  fieldName: string,
): readonly string[] => {
  const sorted = [...relations].sort();
  if (sorted.some((relation, index) => relation === sorted[index - 1])) {
    throw new Error(`${fieldName} contains duplicate relations`);
  }
  return sorted;
};

export const canonicalizeV4Catalog = (
  catalog: V4RelationInput,
): Readonly<{
  coreRelations: readonly string[];
  publicRelations: readonly string[];
  legacyMigrationTables: readonly string[];
}> => {
  return {
    coreRelations: sortedUniqueRelations(catalog.coreRelations, 'coreRelations'),
    publicRelations: sortedUniqueRelations(
      catalog.publicRelations,
      'publicRelations',
    ),
    legacyMigrationTables: sortedUniqueRelations(
      catalog.legacyMigrationTables ?? [],
      'legacyMigrationTables',
    ),
  };
};
export const fingerprintV4Catalog = (catalog: V4RelationInput): string => {
  const canonicalCatalog = canonicalizeV4Catalog(catalog);
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalCatalog))
    .digest('hex')}`;
};

export const createV4BaselineManifest = (
  input: V4RelationInput,
): V4BaselineManifest => {
  if (
    input.coreRelations.some((relation) => LEGACY_RELATION_NAMES[relation]) ||
    (input.legacyMigrationTables ?? []).length > 0
  ) {
    throw new Error('baseline manifest cannot contain legacy migrations');
  }
  const canonicalCatalog = canonicalizeV4Catalog(input);
  return {
    ...canonicalCatalog,
    catalogFingerprint: fingerprintV4Catalog(canonicalCatalog),
  };
};

// The empty catalog is only the marker-null pristine precondition. It is not
// the completed baseline manifest and must never be used as its fingerprint.
export const V4_PRISTINE_EMPTY_CATALOG = createV4BaselineManifest({
  coreRelations: [],
  publicRelations: [],
});

export const V4_PRISTINE_EMPTY_CATALOG_FINGERPRINT =
  V4_PRISTINE_EMPTY_CATALOG.catalogFingerprint;
