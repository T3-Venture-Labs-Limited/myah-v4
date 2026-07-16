
import { FieldMetadataType } from 'twenty-shared/types';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { buildMyahStandardMetadataContract } from './myah-standard-metadata-contract.fixture';

const contract = buildMyahStandardMetadataContract();
const result = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
});

describe('Myah standard metadata contract', () => {
  const categories = Object.entries(contract)
    .filter(([key]) => key.startsWith('flat')) as [keyof TwentyStandardAllFlatEntityMaps, readonly string[]][];

  it('places every source-derived declaration in its exact flat map', () => {
    const myahIds = new Set(categories.flatMap(([, ids]) => ids));
    for (const [mapName, expected] of categories) {
      const actual = Object.keys(result.allFlatEntityMaps[mapName].byUniversalIdentifier)
        .filter((id) => myahIds.has(id)).sort();
      expect(actual).toEqual([...expected].sort());
      for (const id of expected) {
        for (const [otherName] of categories) {
          if (otherName !== mapName) expect(result.allFlatEntityMaps[otherName].byUniversalIdentifier[id]).toBeUndefined();
        }
      }
    }
  });

  it('excludes nested select options from every flat category', () => {
    for (const optionId of contract.nestedOptionUniversalIdentifiers) {
      for (const [mapName] of categories) expect(result.allFlatEntityMaps[mapName].byUniversalIdentifier[optionId]).toBeUndefined();
    }
  });

  it('asserts every source-derived relation endpoint', () => {
    const fields = result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
    for (const relation of contract.relations) {
      expect(fields[relation.sourceField]).toMatchObject({
        objectMetadataUniversalIdentifier: relation.sourceObject,
        relationTargetObjectMetadataUniversalIdentifier: relation.targetObject,
        relationTargetFieldMetadataUniversalIdentifier: relation.targetField,
      });
    }
  });

  it('links the canonical path index to its canonical field', () => {
    const { index, object, field } = contract.canonicalPathIndex;
    expect(result.allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier[index]).toMatchObject({
      objectMetadataUniversalIdentifier: object,
      universalFlatIndexFieldMetadatas: [{ indexMetadataUniversalIdentifier: index, fieldMetadataUniversalIdentifier: field }],
    });
  });

  it('includes the required system fields on every Myah object', () => {
    const myahObjectIds = new Set(contract.flatObjectMetadataMaps);
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    );

    for (const objectId of myahObjectIds) {
      const fieldNames = fields
        .filter(
          (field) =>
            field.objectMetadataUniversalIdentifier === objectId &&
            field.isSystem,
        )
        .map((field) => field.name);

      expect(fieldNames).toEqual(
        expect.arrayContaining([
          'id',
          'createdAt',
          'updatedAt',
          'deletedAt',
          'createdBy',
          'updatedBy',
          'position',
          'searchVector',
        ]),
      );
    }
  });

  it('normalizes select option positions and defaults', () => {
    const myahObjectIds = new Set(contract.flatObjectMetadataMaps);
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(
      (field) =>
        myahObjectIds.has(field.objectMetadataUniversalIdentifier) &&
        field.type === FieldMetadataType.SELECT,
    );

    expect(fields).not.toHaveLength(0);

    for (const field of fields) {
      const options = field.options ?? [];

      expect(options.map((option) => option.position)).toEqual(
        options.map((_, position) => position),
      );

      if (field.defaultValue !== null) {
        expect(options.map((option) => option.value)).toContain(
          field.defaultValue,
        );
      }
    }
  });
});
