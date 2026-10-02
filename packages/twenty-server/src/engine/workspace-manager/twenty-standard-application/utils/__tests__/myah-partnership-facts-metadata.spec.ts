import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { computeFlatIndexFieldColumnNames } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/index/utils/index-action-handler.utils';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const { allFlatEntityMaps } = computeTwentyStandardApplicationAllFlatEntityMaps(
  {
    now: '2026-09-24T00:00:00.000Z',
    workspaceId: '00000000-0000-4000-8000-000000000001',
    twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
  },
);
const objects = allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier;
const fields = allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
const indexes = allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier;
const offer = MYAH_STANDARD_OBJECTS.partnershipOfferVersion;
const obligation = MYAH_STANDARD_OBJECTS.partnershipObligation;
const field = (
  object: { fields: Record<string, { universalIdentifier: string }> },
  name: string,
) => fields[object.fields[name].universalIdentifier];

describe('participation partnership fact metadata', () => {
  it('registers unique object and field identifiers without changing Campaign defaults', () => {
    const ids = Object.values(STANDARD_OBJECTS).flatMap((o) => [
      o.universalIdentifier,
      ...Object.values(o.fields).map((f) => f.universalIdentifier),
      ...Object.values(o.indexes).map((index) => index.universalIdentifier),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(objects[offer.universalIdentifier]).toBeDefined();
    expect(objects[obligation.universalIdentifier]).toBeDefined();
    expect(field(MYAH_STANDARD_OBJECTS.offer, 'campaign')).toBeDefined();
    expect(field(offer, 'campaignCreator')).toBeDefined();
    expect('campaign' in offer.fields).toBe(false);
    expect(field(MYAH_STANDARD_OBJECTS.campaignCreator, 'stage')).toBeDefined();
  });

  it('enforces durable scoped offer-version and agreement-line identities, including soft-deleted rows', () => {
    const cases = [
      {
        object: offer,
        indexId: 'c4400294-3677-4039-9770-c81b10644d5c',
        fieldNames: ['campaignCreator', 'version'],
        columns: ['campaignCreatorId', 'version'],
      },
      {
        object: obligation,
        indexId: '6fe28316-670c-4609-b3d2-b3830a9d12df',
        fieldNames: ['offerVersion', 'purpose'],
        columns: ['offerVersionId', 'purpose'],
      },
    ] as const;

    for (const { object, indexId, fieldNames, columns } of cases) {
      const index = indexes[indexId];
      expect(index).toMatchObject({
        universalIdentifier: indexId,
        objectMetadataUniversalIdentifier: object.universalIdentifier,
        isUnique: true,
        indexWhereClause: null,
        universalFlatIndexFieldMetadatas: fieldNames.map((name, order) => ({
          fieldMetadataUniversalIdentifier: field(object, name)!
            .universalIdentifier,
          indexMetadataUniversalIdentifier: indexId,
          order,
        })),
      });
      expect(index?.flatIndexFieldMetadatas.map(({ order }) => order)).toEqual([
        0, 1,
      ]);
      expect(
        computeFlatIndexFieldColumnNames({
          flatIndexFieldMetadatas: index!.flatIndexFieldMetadatas,
          flatFieldMetadataMaps: allFlatEntityMaps.flatFieldMetadataMaps,
        }),
      ).toEqual(columns);
      expect(index?.name).toMatch(/^IDX_/);
      expect(index?.indexWhereClause).toBeNull();
    }
    expect(field(offer, 'version')).toMatchObject({ isNullable: true });
    expect(field(obligation, 'purpose')).toMatchObject({ isNullable: true });
    expect(field(offer, 'campaignCreator')).toMatchObject({ isNullable: true });
    expect(field(obligation, 'offerVersion')).toMatchObject({
      isNullable: true,
    });
    // Nullable keys are staging metadata; a guarded writer must require them.
  });

  it('exposes separate deposit, balance and receipt-anchored content schema slots', () => {
    for (const name of [
      'purpose',
      'obligationType',
      'amount',
      'currency',
      'prerequisites',
      'dueCondition',
      'evidenceReference',
      'task',
    ]) {
      expect(field(obligation, name)).toBeDefined();
    }
    expect(field(obligation, 'amount')?.type).toBe(FieldMetadataType.TEXT);
    expect(field(obligation, 'currency')?.type).toBe(FieldMetadataType.TEXT);
    expect(field(obligation, 'prerequisites')?.type).toBe(
      FieldMetadataType.RAW_JSON,
    );
    expect(field(obligation, 'dueCondition')?.type).toBe(
      FieldMetadataType.RAW_JSON,
    );
    expect(field(obligation, 'task')?.type).toBe(FieldMetadataType.RELATION);
    expect(field(offer, 'fixedAmount')?.type).toBe(FieldMetadataType.TEXT);
    expect(field(offer, 'currency')?.type).toBe(FieldMetadataType.TEXT);
    // The opt-in physical fixture asserts actual literal values/relations; this
    // assertion alone does not validate a payment writer or dependency engine.
  });

  it('links participation, version, obligation and native Task in both directions', () => {
    const pairs = [
      [
        offer,
        'campaignCreator',
        MYAH_STANDARD_OBJECTS.campaignCreator,
        'offerVersions',
      ],
      [
        obligation,
        'campaignCreator',
        MYAH_STANDARD_OBJECTS.campaignCreator,
        'partnershipObligations',
      ],
      [obligation, 'offerVersion', offer, 'obligations'],
      [obligation, 'task', STANDARD_OBJECTS.task, 'partnershipObligations'],
    ] as const;
    for (const [source, name, target, inverse] of pairs) {
      expect(field(source, name)).toMatchObject({
        type: FieldMetadataType.RELATION,
        settings: expect.objectContaining({
          relationType: RelationType.MANY_TO_ONE,
        }),
        relationTargetFieldMetadataUniversalIdentifier: field(target, inverse)
          ?.universalIdentifier,
      });
      expect(field(target, inverse)).toMatchObject({
        type: FieldMetadataType.RELATION,
        relationTargetFieldMetadataUniversalIdentifier: field(source, name)
          ?.universalIdentifier,
      });
    }
  });

  it('declares distinct purpose, exact-string amount/currency, prerequisites and evidence fields', () => {
    expect(field(obligation, 'purpose')).toMatchObject({
      type: FieldMetadataType.TEXT,
      isUIEditable: false,
    });
    expect(field(obligation, 'obligationType')).toMatchObject({
      type: FieldMetadataType.SELECT,
      isUIEditable: false,
      options: expect.arrayContaining(
        ['SIGNING', 'PAYMENT', 'SHIPMENT', 'RECEIPT', 'CONTENT'].map((value) =>
          expect.objectContaining({ value }),
        ),
      ),
    });
    expect(field(obligation, 'amount')).toMatchObject({
      type: FieldMetadataType.TEXT,
      isUIEditable: false,
    });
    expect(field(obligation, 'currency')).toMatchObject({
      type: FieldMetadataType.TEXT,
      isUIEditable: false,
    });
    expect(field(obligation, 'prerequisites')).toMatchObject({
      type: FieldMetadataType.RAW_JSON,
      isUIEditable: false,
    });
    expect(field(obligation, 'evidenceReference')).toMatchObject({
      isUIEditable: false,
    });
    expect(field(offer, 'fixedAmount')).toMatchObject({
      type: FieldMetadataType.TEXT,
      isUIEditable: false,
    });
    expect(field(offer, 'authorizedById')).toMatchObject({
      isUIEditable: false,
    });
    expect(field(offer, 'confirmedAt')).toMatchObject({ isUIEditable: false });
    expect(field(obligation, 'offerVersion')).toMatchObject({
      type: FieldMetadataType.RELATION,
    });
    expect(field(obligation, 'evidenceActorId')).toMatchObject({
      isUIEditable: false,
    });
    const permission = Object.values(
      allFlatEntityMaps.flatObjectPermissionMaps.byUniversalIdentifier,
    ).find(
      (p) =>
        p?.objectMetadataUniversalIdentifier === obligation.universalIdentifier,
    );
    expect(permission).toMatchObject({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });
  });
});
