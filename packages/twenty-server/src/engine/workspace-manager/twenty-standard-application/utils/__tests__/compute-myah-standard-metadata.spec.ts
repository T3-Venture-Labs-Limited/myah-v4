import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import {
  FieldMetadataType,
  ViewOpenRecordIn,
  ViewType,
} from 'twenty-shared/types';
import { SystemPermissionFlag } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { v5 as uuidv5 } from 'uuid';

import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import type { FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import type { FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import type { FlatRolePermissionFlag } from 'src/engine/metadata-modules/flat-role-permission-flag/types/flat-role-permission-flag.type';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { FieldDisplayMode } from 'src/engine/metadata-modules/page-layout-widget/enums/field-display-mode.enum';
import {
  MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG,
  MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { buildMyahStandardMetadataContract } from './myah-standard-metadata-contract.fixture';

const contract = buildMyahStandardMetadataContract();
const result = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
});
const recoveryResult = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
  removeReplacedTwentyCrmMetadata: true,
});

const BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER =
  '8563f1a9-4e02-408a-a5d7-45f68779023a';
const CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '802cf87a-e4c5-559b-89c5-2172e3e5cc2f';
const PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS = [
  'c4bccf25-cfd1-5648-918e-bf20b32ed375',
  'ccdc5be6-6c2b-5920-acd8-fa0ad52eeb29',
  '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
  'f0d18169-7558-487c-bafd-eb0e6adaf63a',
  '1186d5b4-385f-5566-a4ba-87b8f65cdee5',
  'd383c2c2-9617-548f-a0ab-266b7dbe0789',
  'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31',
  '184b0e66-11d9-45bd-8dde-e694355c57f1',
  '3db5e356-13b9-539d-8320-7c6606e3c574',
  '52162ce6-20b6-536d-b6b1-c21271c96006',
  'af645cc7-31fc-5175-af8d-427845ebe1ed',
  'dcb35d52-cad9-4871-8ae2-8e97e38578f1',
  'cba072b8-6758-5eaa-bc1c-72e94a75b112',
  '6430e3f1-71aa-5b6a-bc7a-b635d4f2c3ab',
  'bdaf9a54-8931-5e51-836f-eb1cf6b11fcb',
  'bbfda234-327c-5d9d-ac39-8a33fd06779d',
  '8bb2d28c-cecf-4111-b043-89b6c7255710',
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
  flatRolePermissionFlagMaps: FlatEntityMaps<FlatRolePermissionFlag>;
};

describe('Myah standard metadata contract', () => {
  const categories = Object.entries(contract).filter(([key]) =>
    key.startsWith('flat'),
  ) as [keyof TwentyStandardAllFlatEntityMaps, readonly string[]][];

  it('places every source-derived declaration in its exact flat map', () => {
    const myahIds = new Set(categories.flatMap(([, ids]) => ids));
    for (const [mapName, expected] of categories) {
      const actual = Object.keys(
        result.allFlatEntityMaps[mapName].byUniversalIdentifier,
      )
        .filter((id) => myahIds.has(id))
        .sort();
      expect(actual).toEqual([...expected].sort());
      for (const id of expected) {
        for (const [otherName] of categories) {
          if (otherName !== mapName)
            expect(
              result.allFlatEntityMaps[otherName].byUniversalIdentifier[id],
            ).toBeUndefined();
        }
      }
    }
  });

  it('retains CRM metadata in the generic standard map', () => {
    const crmObjectUniversalIdentifiers = [
      STANDARD_OBJECTS.person.universalIdentifier,
      STANDARD_OBJECTS.company.universalIdentifier,
      STANDARD_OBJECTS.opportunity.universalIdentifier,
    ];

    expect(
      Object.keys(
        result.allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
      ),
    ).toEqual(expect.arrayContaining(crmObjectUniversalIdentifiers));
  });

  it('removes replaced CRM metadata only for the recovery profile', () => {
    const removedObjectUniversalIdentifiers = [
      STANDARD_OBJECTS.person.universalIdentifier,
      STANDARD_OBJECTS.company.universalIdentifier,
      STANDARD_OBJECTS.opportunity.universalIdentifier,
    ];

    expect(
      Object.keys(
        recoveryResult.allFlatEntityMaps.flatObjectMetadataMaps
          .byUniversalIdentifier,
      ),
    ).not.toEqual(expect.arrayContaining(removedObjectUniversalIdentifiers));
  });

  it('does not retain fields with dangling relation dependencies', () => {
    const fields =
      recoveryResult.allFlatEntityMaps.flatFieldMetadataMaps
        .byUniversalIdentifier;
    const retainedFieldUniversalIdentifiers = new Set(Object.keys(fields));

    for (const field of Object.values(fields).filter(isDefined)) {
      if (isDefined(field.relationTargetFieldMetadataUniversalIdentifier)) {
        expect(retainedFieldUniversalIdentifiers).toContain(
          field.relationTargetFieldMetadataUniversalIdentifier,
        );
      }

      if (
        field.universalSettings != null &&
        'junctionTargetFieldUniversalIdentifier' in field.universalSettings &&
        typeof field.universalSettings
          .junctionTargetFieldUniversalIdentifier === 'string'
      ) {
        expect(retainedFieldUniversalIdentifiers).toContain(
          field.universalSettings.junctionTargetFieldUniversalIdentifier,
        );
      }
    }
  });

  it('does not retain field widgets for removed fields', () => {
    const fields =
      recoveryResult.allFlatEntityMaps.flatFieldMetadataMaps
        .byUniversalIdentifier;
    const widgets =
      recoveryResult.allFlatEntityMaps.flatPageLayoutWidgetMaps
        .byUniversalIdentifier;

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
            objectMetadataUniversalIdentifier: target.objectUniversalIdentifier,
            relationTargetObjectMetadataUniversalIdentifier:
              junction.objectUniversalIdentifier,
          }),
        );
      }
    }
  });

  it('excludes nested select options from every flat category', () => {
    for (const optionId of contract.nestedOptionUniversalIdentifiers) {
      for (const [mapName] of categories)
        expect(
          result.allFlatEntityMaps[mapName].byUniversalIdentifier[optionId],
        ).toBeUndefined();
    }
  });

  it('asserts every source-derived relation endpoint', () => {
    const fields =
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier;
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
    expect(
      result.allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier[index],
    ).toMatchObject({
      objectMetadataUniversalIdentifier: object,
      universalFlatIndexFieldMetadatas: [
        {
          indexMetadataUniversalIdentifier: index,
          fieldMetadataUniversalIdentifier: field,
        },
      ],
    });
  });

  it('includes the required system fields on every Myah object', () => {
    const myahObjectIds = new Set(contract.flatObjectMetadataMaps);
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);

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

  it('includes declared Creator custom fields', () => {
    const creatorFields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (field) =>
          field.objectMetadataUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      );

    expect(creatorFields).toContainEqual(
      expect.objectContaining({
        name: 'instagramReelsAvgViewCount',
        universalIdentifier:
          MYAH_STANDARD_OBJECTS.creator.fields.instagramReelsAvgViewCount
            .universalIdentifier,
      }),
    );
    for (const [name, universalIdentifier] of [
      ['instagramUrl', '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b'],
      ['tiktokUrl', 'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31'],
      ['youtubeUrl', 'af645cc7-31fc-5175-af8d-427845ebe1ed'],
      ['twitterUrl', 'bbfda234-327c-5d9d-ac39-8a33fd06779d'],
    ]) {
      expect(creatorFields).toContainEqual(
        expect.objectContaining({
          name,
          universalIdentifier,
          type: FieldMetadataType.TEXT,
          isNullable: true,
          isUIEditable: true,
        }),
      );
    }
    expect(creatorFields).toContainEqual(
      expect.objectContaining({
        name: 'owner',
        universalIdentifier: '654e0df0-0c1f-4083-bc30-f85252269092',
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        relationTargetObjectMetadataUniversalIdentifier:
          STANDARD_OBJECTS.workspaceMember.universalIdentifier,
        relationTargetFieldMetadataUniversalIdentifier:
          'fe31748c-e0e8-40b2-b175-1759c817e54a',
      }),
    );
    expect(contract.relations).toContainEqual({
      sourceField:
        MYAH_STANDARD_OBJECTS.creator.fields.owner.universalIdentifier,
      sourceObject: MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      targetObject: STANDARD_OBJECTS.workspaceMember.universalIdentifier,
      targetField:
        STANDARD_OBJECTS.workspaceMember.fields.ownedCreators
          .universalIdentifier,
    });
    for (const expectedRelation of [
      {
        name: 'timelineActivities',
        universalIdentifier: '5e98bbca-0761-5945-bbe6-c441e3fb831b',
        targetObjectUniversalIdentifier:
          STANDARD_OBJECTS.timelineActivity.universalIdentifier,
      },
      {
        name: 'attachments',
        universalIdentifier: '68ea5fd3-32b0-542f-ae42-9162331b53e8',
        targetObjectUniversalIdentifier:
          STANDARD_OBJECTS.attachment.universalIdentifier,
      },
    ]) {
      expect(creatorFields).toContainEqual(
        expect.objectContaining({
          name: expectedRelation.name,
          universalIdentifier: expectedRelation.universalIdentifier,
          objectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          relationTargetObjectMetadataUniversalIdentifier:
            expectedRelation.targetObjectUniversalIdentifier,
        }),
      );
    }
    expect(
      result.allFlatEntityMaps.flatViewMaps.byUniversalIdentifier,
    ).toHaveProperty('19483764-6f84-4d09-8f03-945e7d0a4b28');
    expect(
      result.allFlatEntityMaps.flatViewFilterMaps.byUniversalIdentifier,
    ).toHaveProperty('03ddcbb7-42dd-4078-bc0a-c985c6a9c131');
    expect(
      result.allFlatEntityMaps.flatViewFilterMaps.byUniversalIdentifier,
    ).toHaveProperty('d1319af0-eeb2-4ca3-8afc-31e66c8a4277');
  });

  it('configures a full Creator record page through native fields and activity tabs', () => {
    const creatorRecordPageFieldsViewUniversalIdentifier =
      'fdbaccb5-56d4-4c36-98c7-0f5ab0b7cc1e';
    const fieldsWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '9b6cb66e-3a74-4c7a-9a52-481fb9497c2e'
      ];
    const timelineWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '8e82ee16-5e12-4f6f-bf42-e8daed7cb619'
      ];
    const tasksWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '9a965ec0-9fca-4b88-bd4d-78930ce870ce'
      ];
    const notesWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '02b3dd33-16d2-4334-9ba7-5ecba705d797'
      ];
    const filesWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        'acc7a6b4-55c2-45c9-a609-c8f84ef9c4d7'
      ];

    expect(
      result.allFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier[
        '65e152d0-e162-4ece-8b84-e6e223065a14'
      ],
    ).toMatchObject({
      objectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      type: 'RECORD_PAGE',
    });
    expect(fieldsWidget?.universalConfiguration).toMatchObject({
      configurationType: WidgetConfigurationType.FIELDS,
      viewUniversalIdentifier: creatorRecordPageFieldsViewUniversalIdentifier,
    });
    expect(timelineWidget?.universalConfiguration).toMatchObject({
      configurationType: WidgetConfigurationType.TIMELINE,
    });
    expect(tasksWidget?.universalConfiguration).toMatchObject({
      configurationType: WidgetConfigurationType.TASKS,
    });
    expect(notesWidget?.universalConfiguration).toMatchObject({
      configurationType: WidgetConfigurationType.NOTES,
    });
    expect(filesWidget?.universalConfiguration).toMatchObject({
      configurationType: WidgetConfigurationType.FILES,
    });

    const recordPageFields = Object.values(
      result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (viewField) =>
          viewField.viewUniversalIdentifier ===
          creatorRecordPageFieldsViewUniversalIdentifier,
      )
      .map((viewField) => viewField.fieldMetadataUniversalIdentifier);

    expect(recordPageFields).toEqual(
      expect.arrayContaining([
        MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creator.fields.owner.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creator.fields.creatorStatus.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creator.fields.instagramUsername
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.creator.fields.tiktokUsername.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creator.fields.youtubeUrl.universalIdentifier,
      ]),
    );
  });

  it('configures Creator List details without an unsafe generic membership widget', () => {
    const creatorListPage =
      result.allFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier[
        'c8952254-5bf9-43a5-baab-98666f9b444d'
      ];
    const fieldsWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        'cdf8d521-10c0-4cad-a9e8-b7767deea176'
      ];
    const unsafeMembersWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        'f49afbc5-7f5d-45e1-be06-7418cc449e6d'
      ];

    expect(creatorListPage).toMatchObject({
      objectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
      type: 'RECORD_PAGE',
    });
    expect(fieldsWidget?.universalConfiguration).toMatchObject({
      configurationType: WidgetConfigurationType.FIELDS,
    });
    expect(unsafeMembersWidget).toBeUndefined();
  });

  it('materializes the Campaign Home, native tabs, and operations contract', () => {
    expect(MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG).toMatchObject({
      defaultTabUniversalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
      tabs: {
        home: {
          universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
          title: 'Home',
          position: 10,
        },
      },
    });
    expect(MYAH_CAMPAIGN_PAGE_LAYOUT_CONFIG.tabs.outreach).toMatchObject({
      title: 'Outreach',
      position: 20,
    });
    expect(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.tasks.position,
    ).toBeLessThan(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs.influencers.position,
    );
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const campaignStatus = fields.find(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier &&
        field.name === 'status',
    );
    const campaignLifecycleStatus = fields.find(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier &&
        field.name === 'lifecycleStatus',
    );
    const campaignOwner = fields.find(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier &&
        field.name === 'owner',
    );
    const ownedCampaigns = fields.find(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.workspaceMember.universalIdentifier &&
        field.name === 'ownedCampaigns',
    );
    const campaignView =
      result.allFlatEntityMaps.flatViewMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.views.view5865bdbf.universalIdentifier
      ];
    const campaignOverviewView =
      result.allFlatEntityMaps.flatViewMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.views.view6bfee1b9.universalIdentifier
      ];
    const campaignOverviewViewFields = Object.values(
      result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (viewField) =>
          viewField.viewUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaign.views.view6bfee1b9.universalIdentifier,
      );
    const campaignTableViewFields = Object.values(
      result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (viewField) =>
          viewField.viewUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaign.views.view5865bdbf.universalIdentifier,
      );

    expect(campaignStatus).toMatchObject({
      type: FieldMetadataType.SELECT,
      isUIEditable: false,
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'PENDING' }),
        expect.objectContaining({ value: 'APPROVED' }),
        expect.objectContaining({ value: 'REJECTED' }),
        expect.objectContaining({ value: 'APPLIED' }),
      ]),
    });
    expect(campaignStatus?.options).toHaveLength(4);
    expect(campaignLifecycleStatus).toMatchObject({
      universalIdentifier: 'e169ef65-ded7-4060-9c7a-c9b92d359c8a',
      type: FieldMetadataType.SELECT,
      defaultValue: "'DRAFT'",
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'DRAFT' }),
        expect.objectContaining({ value: 'ACTIVE' }),
        expect.objectContaining({ value: 'PAUSED' }),
        expect.objectContaining({ value: 'COMPLETED' }),
      ]),
    });
    expect(campaignLifecycleStatus?.options).toHaveLength(4);
    expect(campaignOwner).toMatchObject({
      universalIdentifier: '12d7812a-3d11-4704-8e59-d1468ee3026b',
      relationTargetFieldMetadataUniversalIdentifier:
        'f24d1eb5-ee43-457f-bb4b-28fdf9d4e760',
    });
    expect(ownedCampaigns).toMatchObject({
      universalIdentifier: 'f24d1eb5-ee43-457f-bb4b-28fdf9d4e760',
      relationTargetFieldMetadataUniversalIdentifier:
        '12d7812a-3d11-4704-8e59-d1468ee3026b',
    });
    expect(campaignView).toMatchObject({
      openRecordIn: ViewOpenRecordIn.RECORD_PAGE,
    });
    expect(campaignOverviewView).toMatchObject({
      name: 'Campaign Overview Fields',
      type: ViewType.FIELDS_WIDGET,
    });

    {
      const expectedCampaignInformationViewFields = [
        ['lifecycleStatus', '7449f871-a737-4a9c-a85d-6e788e8ccdf0'],
        ['name', '16a078ac-9f6f-4dbb-993e-ac1ce932eb98'],
        ['campaignBrief', 'eb3d3d5f-8255-4fa4-ad0c-2d617ab31d98'],
        ['communicationGuidelines', '01fbc8b7-fcf5-4222-b322-72c513b03e36'],
        ['replyRules', '029453d5-ed6e-4e4b-b976-e01c4f4ad6c2'],
        ['escalationBoundaries', '6294f8b5-7c9a-4d73-91a6-e40c01a0f940'],
        ['additionalNotes', 'c2593480-3ddc-42b9-b156-96e77a5fff71'],
        ['createdAt', 'e65a9bb9-a89f-4319-a6df-d7c449f0f28f'],
        ['updatedAt', 'b40cebc4-4788-4412-a3bd-8b25d56a1d39'],
        ['createdBy', 'cb532d72-0b7f-478d-8443-64a7cffc0453'],
        ['updatedBy', 'd15cf2d7-b548-43a4-a9fb-e90b6bd476e6'],
        ['owner', 'daec24c3-ee6f-4287-8608-e3520149dc4b'],
        ['objective', 'f7f89fa5-b524-4e5f-abaa-3fae7cb791f3'],
        ['targetPlatforms', '7d7d1ea0-04d5-40af-ae35-57efcd7ced87'],
        ['targetDemographics', 'b0c13fe4-566a-4932-933d-868c08546709'],
        ['icpGoal', 'ab510acd-7378-411a-b6be-f17ae8420f21'],
        ['budgetNotes', 'd871fd3b-51f1-46a1-b891-63a43b0e0c88'],
      ] as const;

      expect(
        [...campaignOverviewViewFields]
          .sort((left, right) => left.position - right.position)
          .map(
            ({
              universalIdentifier,
              fieldMetadataUniversalIdentifier,
              position,
            }) => ({
              universalIdentifier,
              fieldMetadataUniversalIdentifier,
              position,
            }),
          ),
      ).toEqual(
        expectedCampaignInformationViewFields.map(
          ([fieldName, universalIdentifier], position) => ({
            universalIdentifier,
            fieldMetadataUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.campaign.fields[fieldName]
                .universalIdentifier,
            position,
          }),
        ),
      );
      expect(campaignOverviewViewFields).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldMetadataUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.campaign.fields.status.universalIdentifier,
          }),
        ]),
      );
    }

    const expectedCampaignInstructionFields = [
      {
        name: 'campaignBrief',
        universalIdentifier: '5cd5f294-970d-46ad-bc91-0f09bd63268b',
      },
      {
        name: 'communicationGuidelines',
        universalIdentifier: '9904e0c4-200b-481e-a449-93ac20358f69',
      },
      {
        name: 'replyRules',
        universalIdentifier: 'bd0cef09-5d02-4ce6-a8a0-d927540b3c51',
      },
      {
        name: 'escalationBoundaries',
        universalIdentifier: 'bc7d1c71-766f-4c10-997d-4810be3011d0',
      },
      {
        name: 'additionalNotes',
        universalIdentifier: '9342db95-0df0-460d-8611-2bbddfb0bc1c',
      },
    ] as const;
    const expectedCampaignInstructionViewFields = [
      {
        universalIdentifier: 'b7905ed5-e0d8-4ca0-a733-43b9b8e78596',
        fieldMetadataUniversalIdentifier:
          '5cd5f294-970d-46ad-bc91-0f09bd63268b',
        position: 0,
      },
      {
        universalIdentifier: '20cc5027-cec9-4259-9323-f9c69ed5c40b',
        fieldMetadataUniversalIdentifier:
          '9904e0c4-200b-481e-a449-93ac20358f69',
        position: 1,
      },
      {
        universalIdentifier: '32eee0c6-5260-4f27-9af8-489356f28a28',
        fieldMetadataUniversalIdentifier:
          'bd0cef09-5d02-4ce6-a8a0-d927540b3c51',
        position: 2,
      },
      {
        universalIdentifier: 'fce3b6b4-2a46-4e1f-9944-22d5b989c033',
        fieldMetadataUniversalIdentifier:
          'bc7d1c71-766f-4c10-997d-4810be3011d0',
        position: 3,
      },
      {
        universalIdentifier: '5d334bcb-90de-4e49-bc33-eeb7d7ee2e82',
        fieldMetadataUniversalIdentifier:
          '9342db95-0df0-460d-8611-2bbddfb0bc1c',
        position: 4,
      },
    ] as const;
    const campaignInstructionFields = fields.filter((field) =>
      expectedCampaignInstructionFields.some(
        ({ universalIdentifier }) =>
          field.universalIdentifier === universalIdentifier,
      ),
    );
    const campaignInstructionsView =
      result.allFlatEntityMaps.flatViewMaps.byUniversalIdentifier[
        'eb4da94a-d3da-4354-bb39-7478ac12bd35'
      ];
    const campaignInstructionViewFields = Object.values(
      result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (viewField) =>
          viewField.viewUniversalIdentifier ===
          'eb4da94a-d3da-4354-bb39-7478ac12bd35',
      );

    expect(campaignInstructionFields).toEqual(
      expect.arrayContaining(
        expectedCampaignInstructionFields.map(({ universalIdentifier }) =>
          expect.objectContaining({
            universalIdentifier,
            objectMetadataUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
            type: FieldMetadataType.RICH_TEXT,
            isNullable: true,
          }),
        ),
      ),
    );
    expect(campaignInstructionFields).toHaveLength(5);
    expect(campaignInstructionsView).toMatchObject({
      name: 'Campaign Instructions Fields',
      type: ViewType.FIELDS_WIDGET,
    });
    expect(
      [...campaignInstructionViewFields]
        .sort((left, right) => left.position - right.position)
        .map(
          ({
            universalIdentifier,
            fieldMetadataUniversalIdentifier,
            position,
          }) => ({
            universalIdentifier,
            fieldMetadataUniversalIdentifier,
            position,
          }),
        ),
    ).toEqual(expectedCampaignInstructionViewFields);
    expect(campaignTableViewFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          universalIdentifier: '39f85537-987b-42e6-b99b-f887373b725d',
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.lifecycleStatus
              .universalIdentifier,
          position: 1,
        }),
      ]),
    );
    expect(campaignTableViewFields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.status.universalIdentifier,
        }),
      ]),
    );
    const campaignPageLayout =
      result.allFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier[
        'ad261155-3c89-436d-8898-3e52d8b37632'
      ];
    const overviewFieldsWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '6845e3c3-3a1a-42d8-afcd-71ff885c8f20'
      ];
    const instructionsFieldsWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '23f43b7f-5d8b-4fa8-ba79-9b39ea1ca392'
      ];
    const influencersWidget =
      result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
        '4f261ef0-51c3-4c6d-ae8f-c76d7fb2b4d2'
      ];
    const campaignInfluencersView =
      result.allFlatEntityMaps.flatViewMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .universalIdentifier
      ];


    expect(campaignPageLayout).toMatchObject({
      universalIdentifier: 'ad261155-3c89-436d-8898-3e52d8b37632',
      objectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier:
        '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
    });
    if (
      overviewFieldsWidget?.configuration.configurationType !==
        WidgetConfigurationType.FIELDS ||
      instructionsFieldsWidget?.configuration.configurationType !==
        WidgetConfigurationType.FIELDS
    ) {
      throw new Error(
        'Campaign fields widgets must use the FIELDS configuration',
      );
    }

    expect(overviewFieldsWidget?.universalConfiguration).toEqual({
      configurationType: WidgetConfigurationType.FIELDS,
      viewUniversalIdentifier: '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
      newFieldDefaultVisibility: true,
    });
    expect(instructionsFieldsWidget?.universalConfiguration).toEqual({
      configurationType: WidgetConfigurationType.FIELDS,
      viewUniversalIdentifier: 'eb4da94a-d3da-4354-bb39-7478ac12bd35',
      newFieldDefaultVisibility: true,
    });
    expect(overviewFieldsWidget.configuration.viewId).toBe(
      campaignOverviewView?.id,
    );
    expect(instructionsFieldsWidget.configuration.viewId).toBe(
      campaignInstructionsView?.id,
    );
    if (
      influencersWidget?.configuration.configurationType !==
      WidgetConfigurationType.FIELD
    ) {
      throw new Error('Campaign Influencers widget must use FIELD configuration');
    }
    expect(influencersWidget.configuration.fieldDisplayMode).toBe(
      FieldDisplayMode.TABLE,
    );
    expect(influencersWidget.configuration.viewId).toBe(
      campaignInfluencersView?.id,
    );
    {
      expect(overviewFieldsWidget.configuration.viewId).not.toBe(
        instructionsFieldsWidget.configuration.viewId,
      );
      const campaignTabs = Object.values(
        result.allFlatEntityMaps.flatPageLayoutTabMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          (tab) =>
            tab.pageLayoutUniversalIdentifier ===
            campaignPageLayout?.universalIdentifier,
        );
      const tasksWidget =
        result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
          'e81ab303-f402-45df-8257-d91172ecc435'
        ];
      const notesWidget =
        result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
          '9a05fd06-cf91-47a2-bbee-06cb4292f44d'
        ];
      const operationsFieldsWidget =
        result.allFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier[
          'cdb1ad36-fcd3-4c6d-9b64-1df8d1c02a80'
        ];
      const campaignOperationsView =
        result.allFlatEntityMaps.flatViewMaps.byUniversalIdentifier[
          MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5.universalIdentifier
        ];
      const campaignOperationsViewFields = Object.values(
        result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          (viewField) =>
            viewField.viewUniversalIdentifier ===
            MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5
              .universalIdentifier,
        );

      expect(
        campaignTabs
          .map(({ universalIdentifier, title }) => ({
            universalIdentifier,
            title,
          }))
          .sort((left, right) =>
            left.universalIdentifier.localeCompare(right.universalIdentifier),
          ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            universalIdentifier: '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
            title: 'Home',
          }),
          expect.objectContaining({
            universalIdentifier: '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0',
            title: 'Tasks',
          }),
          expect.objectContaining({
            universalIdentifier: '04ec5c8f-11b5-40ac-8f64-bf3f3f4f7596',
            title: 'Influencers',
          }),
          expect.objectContaining({
            universalIdentifier: 'cd78ad8c-883a-4ce1-9b74-526adadb751d',
            title: 'Notes',
          }),
          expect.objectContaining({
            universalIdentifier: '0d213a1a-e001-496c-970e-e692968cf17c',
            title: 'Agent',
          }),
          expect.objectContaining({
            universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
            title: 'Operations',
          }),
        ]),
      );
      expect(tasksWidget?.universalConfiguration).toMatchObject({
        configurationType: WidgetConfigurationType.TASKS,
      });
      expect(notesWidget?.universalConfiguration).toMatchObject({
        configurationType: WidgetConfigurationType.NOTES,
      });
      if (
        operationsFieldsWidget?.configuration.configurationType !==
        WidgetConfigurationType.FIELDS
      ) {
        throw new Error(
          'Campaign operations widget must use the FIELDS configuration',
        );
      }
      expect(operationsFieldsWidget.universalConfiguration).toEqual({
        configurationType: WidgetConfigurationType.FIELDS,
        viewUniversalIdentifier: '9c4f90c5-2a03-436b-8130-93d50a4d0e3e',
        newFieldDefaultVisibility: true,
      });
      expect(operationsFieldsWidget.configuration.viewId).toBe(
        campaignOperationsView?.id,
      );
      expect(campaignOperationsView).toMatchObject({
        name: 'Campaign Operations Fields',
        type: ViewType.FIELDS_WIDGET,
      });
      expect(
        [...campaignOperationsViewFields]
          .sort((left, right) => left.position - right.position)
          .map(
            ({
              universalIdentifier,
              fieldMetadataUniversalIdentifier,
              position,
            }) => ({
              universalIdentifier,
              fieldMetadataUniversalIdentifier,
              position,
            }),
          ),
      ).toEqual([
        {
          universalIdentifier: 'e2b2e0e1-1b50-456d-9576-cd0fbcce7593',
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaign.fields.lifecycleStatus
              .universalIdentifier,
          position: 0,
        },
      ]);
    }
  });

  it('normalizes select option positions and defaults', () => {
    const myahObjectIds = new Set(contract.flatObjectMetadataMaps);
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
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

  it('materializes retained Campaign Creator List sources as read-only provenance', () => {
    const sourceObjectUniversalIdentifier =
      '7973bfbb-ff71-47c3-94a6-9e4435eca326';
    const campaignCreatorSourceFieldUniversalIdentifier =
      '2fdb9140-873c-4984-8e00-a8656e268f4c';
    const creatorListSourceFieldUniversalIdentifier =
      'e4706d30-af24-4437-a8a1-466e485e71db';

    const flatObjects = Object.values(
      result.allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const flatFields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const flatIndexes = Object.values(
      result.allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const flatViewFields = Object.values(
      result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const objectPermissions = Object.values(
      mapsWithPermissions.flatObjectPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const fieldPermissions = Object.values(
      mapsWithPermissions.flatFieldPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);
    expect(contract.flatObjectMetadataMaps).toEqual(
      expect.arrayContaining([
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
        sourceObjectUniversalIdentifier,
      ]),
    );

    expect(flatObjects).toContainEqual(
      expect.objectContaining({
        nameSingular: 'campaignCreatorListSource',
        universalIdentifier: sourceObjectUniversalIdentifier,
      }),
    );
    expect(flatIndexes).toContainEqual(
      expect.objectContaining({
        universalIdentifier: '83039fc0-5444-42d6-9f8d-1e4bb4f92841',
        indexWhereClause: '"deletedAt" IS NULL',
        isUnique: true,
        objectMetadataUniversalIdentifier: sourceObjectUniversalIdentifier,
      }),
    );
    expect(flatFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'campaignCreator',
          universalIdentifier: campaignCreatorSourceFieldUniversalIdentifier,
          objectMetadataUniversalIdentifier: sourceObjectUniversalIdentifier,
          relationTargetFieldMetadataUniversalIdentifier:
            '27519164-4421-49a2-a988-8bd4a6f18f89',
        }),
        expect.objectContaining({
          name: 'creatorList',
          universalIdentifier: creatorListSourceFieldUniversalIdentifier,
          objectMetadataUniversalIdentifier: sourceObjectUniversalIdentifier,
          relationTargetFieldMetadataUniversalIdentifier:
            'c0587a89-8b1e-4067-9d1c-6f050528c34b',
        }),
        expect.objectContaining({
          name: 'campaignCreatorListSources',
          universalIdentifier: '27519164-4421-49a2-a988-8bd4a6f18f89',
          objectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
          relationTargetFieldMetadataUniversalIdentifier:
            campaignCreatorSourceFieldUniversalIdentifier,
          universalSettings: expect.objectContaining({
            emptyStateLabel: 'Legacy / source unavailable',
            emptyStateWhenBooleanFieldIsFalse: 'isDirectlyAdded',
            junctionTargetFieldUniversalIdentifier:
              creatorListSourceFieldUniversalIdentifier,
          }),
        }),
        expect.objectContaining({
          name: 'campaignCreatorListSources',
          universalIdentifier: 'c0587a89-8b1e-4067-9d1c-6f050528c34b',
          objectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
          relationTargetFieldMetadataUniversalIdentifier:
            creatorListSourceFieldUniversalIdentifier,
          universalSettings: expect.objectContaining({
            junctionTargetFieldUniversalIdentifier:
              campaignCreatorSourceFieldUniversalIdentifier,
          }),
        }),
      ]),
    );
    expect(objectPermissions).toContainEqual(
      expect.objectContaining({
        roleUniversalIdentifier: CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier: sourceObjectUniversalIdentifier,
        canReadObjectRecords: true,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      }),
    );
    expect(fieldPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectMetadataUniversalIdentifier: sourceObjectUniversalIdentifier,
          fieldMetadataUniversalIdentifier:
            campaignCreatorSourceFieldUniversalIdentifier,
          canReadFieldValue: true,
          canUpdateFieldValue: false,
        }),
        expect.objectContaining({
          objectMetadataUniversalIdentifier: sourceObjectUniversalIdentifier,
          fieldMetadataUniversalIdentifier:
            creatorListSourceFieldUniversalIdentifier,
          canReadFieldValue: true,
          canUpdateFieldValue: false,
        }),
        expect.objectContaining({
          objectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.campaignCreator.fields.isDirectlyAdded
              .universalIdentifier,
          canReadFieldValue: true,
          canUpdateFieldValue: false,
        }),
      ]),
    );
    const campaignInfluencersFieldNames = flatViewFields
      .filter(
        ({ viewUniversalIdentifier }) =>
          viewUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
            .universalIdentifier,
      )
      .sort((left, right) => left.position - right.position)
      .map(
        ({ fieldMetadataUniversalIdentifier }) =>
          result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
            fieldMetadataUniversalIdentifier
          ]?.name,
      );

    expect(campaignInfluencersFieldNames).toEqual([
      'creator',
      'stage',
      'isDirectlyAdded',
      'campaignCreatorListSources',
    ]);
    expect(campaignInfluencersFieldNames).not.toContain('campaignCreator');
  });

  it('materializes the canonical Myah role permissions', () => {
    const objectPermissions = Object.values(
      mapsWithPermissions.flatObjectPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const fieldPermissions = Object.values(
      mapsWithPermissions.flatFieldPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const rolePermissionFlags = Object.values(
      mapsWithPermissions.flatRolePermissionFlagMaps.byUniversalIdentifier,
    ).filter(isDefined);

    expect(rolePermissionFlags).toContainEqual(
      expect.objectContaining({
        roleUniversalIdentifier: CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        permissionFlagUniversalIdentifier: SystemPermissionFlag.WORKFLOWS,
      }),
    );

    const writableCreatorOpsObjectUniversalIdentifiers = [
      MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      MYAH_STANDARD_OBJECTS.promotedAsset.universalIdentifier,
      MYAH_STANDARD_OBJECTS.offer.universalIdentifier,
      MYAH_STANDARD_OBJECTS.outreachSequence.universalIdentifier,
      MYAH_STANDARD_OBJECTS.outreachStep.universalIdentifier,
      MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
    ];
    const expectedObjectPermissions = [
      ...[
        MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
        MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
      ].map((objectMetadataUniversalIdentifier) => ({
        roleUniversalIdentifier: BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: true,
      })),
      ...writableCreatorOpsObjectUniversalIdentifiers.map(
        (objectMetadataUniversalIdentifier) => ({
          roleUniversalIdentifier:
            CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
          objectMetadataUniversalIdentifier,
          canUpdateObjectRecords: true,
          canSoftDeleteObjectRecords: true,
        }),
      ),
      {
        roleUniversalIdentifier: CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: false,
      },
      {
        roleUniversalIdentifier: CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: false,
      },
      ...[
        MYAH_STANDARD_OBJECTS.campaignCreatorList.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreatorListSource.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
      ].map((objectMetadataUniversalIdentifier) => ({
        roleUniversalIdentifier: CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
      })),
    ];

    expect(objectPermissions).toHaveLength(expectedObjectPermissions.length);
    for (const expectedObjectPermission of expectedObjectPermissions) {
      expect(objectPermissions).toContainEqual(
        expect.objectContaining({
          universalIdentifier: uuidv5(
            `${expectedObjectPermission.roleUniversalIdentifier}:${expectedObjectPermission.objectMetadataUniversalIdentifier}`,
            ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
          ),
          ...expectedObjectPermission,
          canReadObjectRecords: true,
          canDestroyObjectRecords: false,
        }),
      );
    }

    const expectedFieldPermissions = [
      ...PROTECTED_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.map(
        (fieldMetadataUniversalIdentifier) => ({
          objectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
          fieldMetadataUniversalIdentifier,
          canReadFieldValue: false,
        }),
      ),
      ...[
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.campaign
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.creator
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.isDirectlyAdded
          .universalIdentifier,
      ].map((fieldMetadataUniversalIdentifier) => ({
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
        fieldMetadataUniversalIdentifier,
        canReadFieldValue: true,
      })),
      ...[
        MYAH_STANDARD_OBJECTS.campaignCreatorListSource.fields.campaignCreator
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreatorListSource.fields.creatorList
          .universalIdentifier,
      ].map((fieldMetadataUniversalIdentifier) => ({
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.campaignCreatorListSource.universalIdentifier,
        fieldMetadataUniversalIdentifier,
        canReadFieldValue: true,
      })),
    ];

    expect(fieldPermissions).toHaveLength(expectedFieldPermissions.length);
    for (const expectedFieldPermission of expectedFieldPermissions) {
      expect(fieldPermissions).toContainEqual(
        expect.objectContaining({
          universalIdentifier: uuidv5(
            `${CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER}:${expectedFieldPermission.objectMetadataUniversalIdentifier}:${expectedFieldPermission.fieldMetadataUniversalIdentifier}`,
            ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
          ),
          roleUniversalIdentifier:
            CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
          ...expectedFieldPermission,
          canUpdateFieldValue: false,
        }),
      );
    }
  });

  it('materializes search metadata for the native Creator CRM records', () => {
    const searchFieldMetadata = Object.values(
      result.allFlatEntityMaps.flatSearchFieldMetadataMaps
        .byUniversalIdentifier,
    ).filter(isDefined);
    const creatorSearchFieldMetadata = searchFieldMetadata.filter(
      ({ objectMetadataUniversalIdentifier }) =>
        objectMetadataUniversalIdentifier ===
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    );

    expect(creatorSearchFieldMetadata).toHaveLength(2);
    expect(creatorSearchFieldMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
        }),
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier,
        }),
      ]),
    );

    for (const [
      objectMetadataUniversalIdentifier,
      fieldMetadataUniversalIdentifier,
    ] of [
      [
        MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
        MYAH_STANDARD_OBJECTS.creatorList.fields.name.universalIdentifier,
      ],
      [
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.name.universalIdentifier,
      ],
    ]) {
      expect(
        searchFieldMetadata.filter(
          (searchFieldMetadata) =>
            searchFieldMetadata.objectMetadataUniversalIdentifier ===
              objectMetadataUniversalIdentifier &&
            searchFieldMetadata.fieldMetadataUniversalIdentifier ===
              fieldMetadataUniversalIdentifier,
        ),
      ).toHaveLength(1);
    }
  });
  it('pins one managed mailbox identity to each Campaign Creator', () => {
    const field =
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.assignedManagedMailboxId
          .universalIdentifier
      ];

    expect(field).toMatchObject({
      name: 'assignedManagedMailboxId',
      universalIdentifier: 'c1abf590-4797-5bd8-a820-07f55ffce9c0',
      objectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      type: FieldMetadataType.TEXT,
      isNullable: true,
      isUIEditable: true,
    });
  });

  it('enforces one active membership for each Creator List and Campaign relationship', () => {
    const expectedIndexes = [
      {
        universalIdentifier: '6fd4b1ae-5a6c-4bf6-9cf9-bad4a3eaf9a1',
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
        fieldMetadataUniversalIdentifiers: [
          MYAH_STANDARD_OBJECTS.creatorListMember.fields.creator
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.creatorListMember.fields.creatorList
            .universalIdentifier,
        ],
      },
      {
        universalIdentifier: '6a1b09a7-0f81-4eb6-a5d2-3ba7951fac0d',
        objectMetadataUniversalIdentifier:
          MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
        fieldMetadataUniversalIdentifiers: [
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.creator
            .universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.campaign
            .universalIdentifier,
        ],
      },
    ];

    for (const expectedIndex of expectedIndexes) {
      const actualIndex =
        result.allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier[
          expectedIndex.universalIdentifier
        ];

      expect(actualIndex).toMatchObject({
        objectMetadataUniversalIdentifier:
          expectedIndex.objectMetadataUniversalIdentifier,
        isUnique: true,
        indexWhereClause: '"deletedAt" IS NULL',
      });
      expect(
        actualIndex?.universalFlatIndexFieldMetadatas.map(
          ({ fieldMetadataUniversalIdentifier }) =>
            fieldMetadataUniversalIdentifier,
        ),
      ).toEqual(expectedIndex.fieldMetadataUniversalIdentifiers);
    }
  });

  it('keeps All Workflows isolated to General Automations', () => {
    const viewFields =
      result.allFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier;
    const workflowFields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (field) =>
          field.objectMetadataUniversalIdentifier ===
            STANDARD_OBJECTS.workflow.universalIdentifier &&
          field.name === 'outreachCampaign',
      );
    const allWorkflowFilters = Object.values(
      result.allFlatEntityMaps.flatViewFilterMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (filter) =>
          filter.viewUniversalIdentifier ===
          STANDARD_OBJECTS.workflow.views.allWorkflows.universalIdentifier,
      );

    expect(viewFields['9ecf92f8-6702-49bb-a25f-1d6e4ade47d8']).toBeUndefined();
    expect(workflowFields).toHaveLength(1);
    expect(allWorkflowFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            workflowFields[0]?.universalIdentifier,
          operand: 'IS_EMPTY',
          value: JSON.stringify([]),
        }),
      ]),
    );
  });

  it('materializes the one-per-Campaign Outreach Workflow association', () => {
    const fields = Object.values(
      result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const outreachCampaign = fields.find(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.workflow.universalIdentifier &&
        field.name === 'outreachCampaign',
    );
    const outreachWorkflows = fields.find(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier &&
        field.name === 'outreachWorkflows',
    );
    const outreachCampaignUniqueIndex =
      result.allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier[
        STANDARD_OBJECTS.workflow.indexes.outreachCampaignUniqueIndex
          .universalIdentifier
      ];

    expect(outreachCampaign).toMatchObject({
      objectMetadataUniversalIdentifier:
        STANDARD_OBJECTS.workflow.universalIdentifier,
      name: 'outreachCampaign',
      type: FieldMetadataType.RELATION,
      isNullable: true,
      isUnique: true,
      isUIEditable: false,
      relationTargetObjectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      universalSettings: expect.objectContaining({
        relationType: 'MANY_TO_ONE',
        joinColumnName: 'outreachCampaignId',
        onDelete: 'CASCADE',
      }),
    });
    expect(outreachWorkflows).toMatchObject({
      objectMetadataUniversalIdentifier:
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      name: 'outreachWorkflows',
      type: FieldMetadataType.RELATION,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECTS.workflow.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        outreachCampaign?.universalIdentifier,
      universalSettings: expect.objectContaining({
        relationType: 'ONE_TO_MANY',
      }),
    });
    expect(outreachCampaignUniqueIndex).toMatchObject({
      objectMetadataUniversalIdentifier:
        STANDARD_OBJECTS.workflow.universalIdentifier,
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
      universalFlatIndexFieldMetadatas: [
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            outreachCampaign?.universalIdentifier,
        }),
      ],
    });
    expect(
      fields.some(
        (field) =>
          field.objectMetadataUniversalIdentifier ===
            STANDARD_OBJECTS.workflow.universalIdentifier &&
          (field.name === 'campaign' || field.name === 'sourceWorkflowId'),
      ),
    ).toBe(false);
  });
});
