import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import { assertPartnershipFactsPlanIsAdditive } from './assert-partnership-facts-plan.service';

const applicationUniversalIdentifier =
  TWENTY_STANDARD_APPLICATION.universalIdentifier;
const offer = MYAH_STANDARD_OBJECTS.partnershipOfferVersion;
const obligation = MYAH_STANDARD_OBJECTS.partnershipObligation;
const field = offer.fields.campaignCreator.universalIdentifier;
const permission = MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.find(
  ({ objectMetadataUniversalIdentifier }) =>
    objectMetadataUniversalIdentifier === offer.universalIdentifier,
)!;

const plan = (actions: object[]): WorkspaceMigration => ({
  applicationUniversalIdentifier,
  actions: actions as WorkspaceMigration['actions'],
});
const create = (
  metadataName: string,
  universalIdentifier: string,
  owner?: string,
) => ({
  type: 'create',
  metadataName,
  flatEntity: {
    universalIdentifier,
    applicationUniversalIdentifier,
    objectMetadataUniversalIdentifier: owner,
  },
});

describe('assertPartnershipFactsPlanIsAdditive', () => {
  it('admits only the selected native create identities, including selected inverse fields', () => {
    expect(() =>
      assertPartnershipFactsPlanIsAdditive(
        plan([
          {
            ...create('objectMetadata', offer.universalIdentifier),
            universalFlatFieldMetadatas: [
              {
                universalIdentifier: field,
                applicationUniversalIdentifier,
                objectMetadataUniversalIdentifier: offer.universalIdentifier,
              },
            ],
            fieldIdByUniversalIdentifier: { [field]: 'preallocated-id' },
          },
          create(
            'fieldMetadata',
            STANDARD_OBJECTS.task.fields.partnershipObligations
              .universalIdentifier,
            STANDARD_OBJECTS.task.universalIdentifier,
          ),
          {
            ...create(
              'objectPermission',
              permission.universalIdentifier,
              offer.universalIdentifier,
            ),
            flatEntity: {
              ...create(
                'objectPermission',
                permission.universalIdentifier,
                offer.universalIdentifier,
              ).flatEntity,
              roleUniversalIdentifier: permission.roleUniversalIdentifier,
            },
          },
          {
            ...create(
              'index',
              obligation.indexes.offerVersionPurposeUniqueIndex
                .universalIdentifier,
              obligation.universalIdentifier,
            ),
            flatEntity: {
              ...create(
                'index',
                obligation.indexes.offerVersionPurposeUniqueIndex
                  .universalIdentifier,
                obligation.universalIdentifier,
              ).flatEntity,
              universalFlatIndexFieldMetadatas: [
                {
                  indexMetadataUniversalIdentifier:
                    obligation.indexes.offerVersionPurposeUniqueIndex
                      .universalIdentifier,
                  fieldMetadataUniversalIdentifier:
                    obligation.fields.offerVersion.universalIdentifier,
                },
              ],
            },
          },
        ]),
      ),
    ).not.toThrow();
  });

  it.each([
    ['empty plan', []],
    [
      'unrelated object',
      [
        {
          ...create(
            'objectMetadata',
            STANDARD_OBJECTS.task.universalIdentifier,
          ),
          universalFlatFieldMetadatas: [],
        },
      ],
    ],
    [
      'object with unrelated embedded field',
      [
        {
          ...create('objectMetadata', offer.universalIdentifier),
          universalFlatFieldMetadatas: [
            {
              universalIdentifier:
                STANDARD_OBJECTS.task.fields.title.universalIdentifier,
            },
          ],
        },
      ],
    ],
    [
      'object with unrelated preallocated field',
      [
        {
          ...create('objectMetadata', offer.universalIdentifier),
          universalFlatFieldMetadatas: [],
          fieldIdByUniversalIdentifier: { unrelated: 'id' },
        },
      ],
    ],
    [
      'misowned field',
      [
        create(
          'fieldMetadata',
          field,
          STANDARD_OBJECTS.task.universalIdentifier,
        ),
      ],
    ],
    [
      'unrelated inverse field',
      [
        {
          ...create('fieldMetadata', field, offer.universalIdentifier),
          relatedUniversalFlatFieldMetadata: {
            universalIdentifier: 'unrelated',
          },
        },
      ],
    ],
    [
      'unrelated preallocated inverse',
      [
        {
          ...create('fieldMetadata', field, offer.universalIdentifier),
          fieldIdByUniversalIdentifier: { unrelated: 'id' },
        },
      ],
    ],
    [
      'misowned index',
      [
        create(
          'index',
          offer.indexes.campaignCreatorVersionUniqueIndex.universalIdentifier,
          obligation.universalIdentifier,
        ),
      ],
    ],
    [
      'unrelated index field',
      [
        {
          ...create(
            'index',
            offer.indexes.campaignCreatorVersionUniqueIndex.universalIdentifier,
            offer.universalIdentifier,
          ),
          flatEntity: {
            ...create(
              'index',
              offer.indexes.campaignCreatorVersionUniqueIndex
                .universalIdentifier,
              offer.universalIdentifier,
            ).flatEntity,
            universalFlatIndexFieldMetadatas: [
              {
                indexMetadataUniversalIdentifier:
                  offer.indexes.campaignCreatorVersionUniqueIndex
                    .universalIdentifier,
                fieldMetadataUniversalIdentifier:
                  STANDARD_OBJECTS.task.fields.title.universalIdentifier,
              },
            ],
          },
        },
      ],
    ],
    ['unsupported action', [create('view', 'unrelated')]],
    [
      'wrong permission role',
      [
        {
          ...create(
            'objectPermission',
            permission.universalIdentifier,
            offer.universalIdentifier,
          ),
          flatEntity: {
            ...create(
              'objectPermission',
              permission.universalIdentifier,
              offer.universalIdentifier,
            ).flatEntity,
            roleUniversalIdentifier: 'unrelated',
          },
        },
      ],
    ],
    [
      'wrong embedded field application',
      [
        {
          ...create('objectMetadata', offer.universalIdentifier),
          universalFlatFieldMetadatas: [
            {
              universalIdentifier: field,
              applicationUniversalIdentifier: 'custom',
              objectMetadataUniversalIdentifier: offer.universalIdentifier,
            },
          ],
        },
      ],
    ],
    [
      'non-create action',
      [
        {
          ...create('fieldMetadata', field, offer.universalIdentifier),
          type: 'update',
        },
      ],
    ],
    [
      'wrong application owner',
      [
        {
          ...create('fieldMetadata', field, offer.universalIdentifier),
          flatEntity: {
            universalIdentifier: field,
            objectMetadataUniversalIdentifier: offer.universalIdentifier,
            applicationUniversalIdentifier: 'custom',
          },
        },
      ],
    ],
  ])('rejects %s before execution', (_name, actions) => {
    expect(() =>
      assertPartnershipFactsPlanIsAdditive(plan(actions as object[])),
    ).toThrow();
  });

  it('rejects a different application and cannot treat an empty plan as installation', () => {
    expect(() =>
      assertPartnershipFactsPlanIsAdditive({
        ...plan([create('fieldMetadata', field, offer.universalIdentifier)]),
        applicationUniversalIdentifier: 'custom',
      }),
    ).toThrow();
  });
});
