
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v5 as uuidv5 } from 'uuid';

import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import type { FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import type { FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { buildMyahStandardMetadataContract } from './myah-standard-metadata-contract.fixture';

const contract = buildMyahStandardMetadataContract();
const result = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
});

const BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER =
  '8563f1a9-4e02-408a-a5d7-45f68779023a';
const CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '802cf87a-e4c5-559b-89c5-2172e3e5cc2f';
const PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS = [
  'c4bccf25-cfd1-5648-918e-bf20b32ed375',
  'ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29',
  '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
  '1186d5b4-385f-5566-a4ba-87b8f65cdee5',
  'd383c2c2-9617-548f-a0ab-266b7dbe0789',
  'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31',
  '3db5e356-13b9-539d-8320-7c6606e3c574',
  '52162ce6-20b6-536d-b6b1-c21271c96006',
  'af645cc7-31fc-5175-af8d-427845ebe1ed',
  'cba072b8-6758-5eaa-bc1c-72e94a75b112',
  '6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab',
  'bdaf9a54-8931-5e51-836f-eb1cf6b11fcb',
  'bbfda234-327c-5d9d-ac39-8a33fd06779d',
  'cba84727-9219-502a-9880-a14bee741515',
  'b286bdf2-3024-575d-b852-adf935061749',
  'fa743d1a-aa43-5976-b6b2-8131a533ae5b',
  '789717de-3c12-59c3-b91a-ca4a70d00886',
  'f10ed5aa-ff19-5cbe-b176-ae4bf642edf1',
  'd68083f5-0db1-5c77-ac35-640a2fdb1f3f',
] as const;
const ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE =
  'b403ec59-4d80-4f22-85e6-717a192dc9cb';
const mapsWithPermissions = result.allFlatEntityMaps as unknown as {
  flatObjectPermissionMaps: FlatEntityMaps<FlatObjectPermission>;
  flatFieldPermissionMaps: FlatEntityMaps<FlatFieldPermission>;
};

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

  it('removes the replaced Twenty CRM objects and their relations', () => {
    const removedObjectUniversalIdentifiers = [
      STANDARD_OBJECTS.person.universalIdentifier,
      STANDARD_OBJECTS.company.universalIdentifier,
      STANDARD_OBJECTS.opportunity.universalIdentifier,
    ];

    expect(
      Object.keys(
        result.allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
      ),
    ).not.toEqual(
      expect.arrayContaining(removedObjectUniversalIdentifiers),
    );

    for (const field of Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined)) {
      expect(removedObjectUniversalIdentifiers).not.toContain(
        field.objectMetadataUniversalIdentifier,
      );
      expect(removedObjectUniversalIdentifiers).not.toContain(
        field.relationTargetObjectMetadataUniversalIdentifier,
      );
    }
  });

  it('does not retain fields with dangling relation dependencies', () => {
    const fields =
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
    const retainedFieldUniversalIdentifiers = new Set(Object.keys(fields));

    for (const field of Object.values(fields).filter(isDefined)) {
      if (isDefined(field.relationTargetFieldMetadataUniversalIdentifier)) {
        expect(retainedFieldUniversalIdentifiers).toContain(
          field.relationTargetFieldMetadataUniversalIdentifier,
        );
      }

      const junctionTargetFieldUniversalIdentifier =
        field.universalSettings?.junctionTargetFieldUniversalIdentifier;

      if (typeof junctionTargetFieldUniversalIdentifier === 'string') {
        expect(retainedFieldUniversalIdentifiers).toContain(
          junctionTargetFieldUniversalIdentifier,
        );
      }
    }
  });

  it('does not retain field widgets for removed fields', () => {
    const fields =
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
    const widgets =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier;

    for (const widget of Object.values(widgets).filter(isDefined)) {
      if (widget.universalConfiguration.configurationType !== 'FIELD') {
        continue;
      }

      expect(fields).toHaveProperty(
        widget.universalConfiguration.fieldMetadataId,
      );
    }
  });

  it('retargets Tasks and Notes to Myah objects', () => {
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const targets = [
      {
        objectUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
        fieldSuffix: 'BrandBrainPage',
      },
      {
        objectUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
        fieldSuffix: 'Campaign',
      },
      {
        objectUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        fieldSuffix: 'Creator',
      },
    ];
    const junctions = [
      {
        objectUniversalIdentifier:
          STANDARD_OBJECTS.noteTarget.universalIdentifier,
        inverseFieldName: 'noteTargets',
      },
      {
        objectUniversalIdentifier:
          STANDARD_OBJECTS.taskTarget.universalIdentifier,
        inverseFieldName: 'taskTargets',
      },
    ];

    for (const target of targets) {
      for (const junction of junctions) {
        expect(fields).toContainEqual(
          expect.objectContaining({
            name: `target${target.fieldSuffix}`,
            objectMetadataUniversalIdentifier:
              junction.objectUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              target.objectUniversalIdentifier,
          }),
        );
        expect(fields).toContainEqual(
          expect.objectContaining({
            name: junction.inverseFieldName,
            objectMetadataUniversalIdentifier:
              target.objectUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              junction.objectUniversalIdentifier,
          }),
        );
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
    const defaultValueByUniversalIdentifier = Object.fromEntries(
      fields.map(({ universalIdentifier, defaultValue }) => [
        universalIdentifier,
        defaultValue,
      ]),
    );

    expect(defaultValueByUniversalIdentifier).toMatchObject({
      '806a4b82-1fc8-43c4-b965-e5271c73b7bb': "'RELATED'",
      'b044e1f3-94f4-4d65-93a3-5082e317f5e1': "'PAGE'",
      '531d9732-7614-472c-ae02-8fc806d92c0a': "'DRAFT'",
      '5601c017-6a85-4211-b2b2-9fda0bf9f0c6': "'UPDATE_PAGE'",
      '5d00b029-7a0d-4320-acf4-036a634a44ab': "'PENDING'",
      'ec240f13-8462-54ad-be55-b27275f0f58a': "'CREATOR'",
      'b887feac-6623-5e8f-b84e-bd502abb8972': "'NEW'",
    });

    for (const field of fields) {
      const options = field.options ?? [];

      expect(options.map((option) => option.position)).toEqual(
        options.map((_, position) => position),
      );

      if (field.defaultValue !== null) {
        const defaultValue = field.defaultValue as string;

        expect(defaultValue).toMatch(/^'.*'$/);
        expect(options.map((option) => option.value)).toContain(
          defaultValue.slice(1, -1),
        );
      }
    }
  });

  it('materializes the canonical Myah role permissions', () => {
    const objectPermissions = Object.values(
      mapsWithPermissions.flatObjectPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const fieldPermissions = Object.values(
      mapsWithPermissions.flatFieldPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);

    const expectedObjectsByRole = new Map([
      [
        BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
        [
          MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
          MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
        ],
      ],
      [
        CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        [
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
          MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
          MYAH_STANDARD_OBJECTS.promotedAsset.universalIdentifier,
          MYAH_STANDARD_OBJECTS.offer.universalIdentifier,
          MYAH_STANDARD_OBJECTS.outreachSequence.universalIdentifier,
          MYAH_STANDARD_OBJECTS.outreachStep.universalIdentifier,
          MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
        ],
      ],
    ]);

    expect(objectPermissions).toHaveLength(12);
    for (const [roleUniversalIdentifier, objectUniversalIdentifiers] of
      expectedObjectsByRole) {
      for (const objectMetadataUniversalIdentifier of objectUniversalIdentifiers) {
        expect(objectPermissions).toContainEqual(
          expect.objectContaining({
            universalIdentifier: uuidv5(
              `${roleUniversalIdentifier}:${objectMetadataUniversalIdentifier}`,
              ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
            ),
            roleUniversalIdentifier,
            objectMetadataUniversalIdentifier,
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: true,
            canDestroyObjectRecords: false,
          }),
        );
      }
    }

    expect(fieldPermissions).toHaveLength(
      PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.length,
    );
    for (const fieldMetadataUniversalIdentifier of
      PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS) {
      expect(fieldPermissions).toContainEqual(
        expect.objectContaining({
          universalIdentifier: uuidv5(
            `${CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER}:${MYAH_STANDARD_OBJECTS.creator.universalIdentifier}:${fieldMetadataUniversalIdentifier}`,
            ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
          ),
          roleUniversalIdentifier:
            CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
          objectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          fieldMetadataUniversalIdentifier,
          canReadFieldValue: false,
          canUpdateFieldValue: false,
        }),
      );
    }
  });
});
