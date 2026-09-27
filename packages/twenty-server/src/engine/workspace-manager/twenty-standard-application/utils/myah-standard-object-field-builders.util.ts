import {
  FieldMetadataType,
  RelationOnDeleteAction,
  RelationType,
} from 'twenty-shared/types';
import {
  MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE,
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  createStandardFieldFlatMetadata,
  type CreateStandardFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-field-flat-metadata.util';
import { createStandardRelationFieldFlatMetadata } from 'src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-relation-field-flat-metadata.util';
import {
  createStandardObjectFlatMetadata,
  type CreateStandardObjectArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/object-metadata/create-standard-object-flat-metadata.util';

type MyahStandardObjectName = keyof typeof MYAH_STANDARD_OBJECTS;

type Args = Omit<
  CreateStandardFieldArgs<MyahStandardObjectName, FieldMetadataType>,
  'context'
>;
type ObjectArgs = Omit<
  CreateStandardObjectArgs<MyahStandardObjectName>,
  'context' | 'objectName'
>;

const createMyahStandardFieldFlatMetadata = <
  O extends MyahStandardObjectName,
  T extends FieldMetadataType,
>(
  args: CreateStandardFieldArgs<O, T>,
): FlatFieldMetadata => {
  if (args.context.type !== FieldMetadataType.SELECT) {
    return createStandardFieldFlatMetadata(args);
  }

  return createStandardFieldFlatMetadata({
    ...args,
    context: {
      ...args.context,
      options: args.context.options?.map((option, position) => ({
        ...option,
        position,
      })),
    },
  });
};

const buildMyahBaseSystemFields = ({
  objectName,
  ...args
}: Omit<
  CreateStandardFieldArgs<MyahStandardObjectName, FieldMetadataType>,
  'context'
>): Record<string, FlatFieldMetadata> => ({
  id: createMyahStandardFieldFlatMetadata({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'id',
      type: FieldMetadataType.UUID,
      label: 'Id',
      description: 'Id',
      icon: 'Icon123',
      isSystem: true,
      isNullable: false,
      isUIEditable: false,
      defaultValue: 'uuid',
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  createdAt: createMyahStandardFieldFlatMetadata({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'createdAt',
      type: FieldMetadataType.DATE_TIME,
      label: 'Creation date',
      description: 'Creation date',
      icon: 'IconCalendar',
      isSystem: true,
      isNullable: false,
      isUIEditable: false,
      defaultValue: 'now',
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  updatedAt: createMyahStandardFieldFlatMetadata({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'updatedAt',
      type: FieldMetadataType.DATE_TIME,
      label: 'Last update',
      description: 'Last time the record was changed',
      icon: 'IconCalendarClock',
      isSystem: true,
      isNullable: false,
      isUIEditable: false,
      defaultValue: 'now',
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  deletedAt: createMyahStandardFieldFlatMetadata({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'deletedAt',
      type: FieldMetadataType.DATE_TIME,
      label: 'Deleted at',
      description: 'Date when the record was deleted',
      icon: 'IconCalendarMinus',
      isSystem: true,
      isNullable: true,
      isUIEditable: false,
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  position: createMyahStandardFieldFlatMetadata({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'position',
      type: FieldMetadataType.POSITION,
      label: 'Position',
      description: 'Record position',
      icon: 'IconHierarchy2',
      isSystem: true,
      isNullable: false,
      defaultValue: 0,
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  createdBy: createMyahStandardFieldFlatMetadata<
    MyahStandardObjectName,
    FieldMetadataType.ACTOR
  >({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'createdBy',
      type: FieldMetadataType.ACTOR,
      label: 'Created by',
      description: 'The creator of the record',
      icon: 'IconCreativeCommons',
      isSystem: true,
      isNullable: false,
      isUIEditable: false,
      defaultValue: {
        source: "'MANUAL'",
        name: "'System'",
        workspaceMemberId: null,
      },
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  updatedBy: createMyahStandardFieldFlatMetadata<
    MyahStandardObjectName,
    FieldMetadataType.ACTOR
  >({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'updatedBy',
      type: FieldMetadataType.ACTOR,
      label: 'Updated by',
      description: 'The last editor of the record',
      icon: 'IconCreativeCommons',
      isSystem: true,
      isNullable: false,
      isUIEditable: false,
      defaultValue: {
        source: "'MANUAL'",
        name: "'System'",
        workspaceMemberId: null,
      },
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
  searchVector: createMyahStandardFieldFlatMetadata({
    objectName,
    workspaceId: args.workspaceId,
    context: {
      fieldName: 'searchVector',
      type: FieldMetadataType.TS_VECTOR,
      label: 'Search vector',
      description: 'Field used for full-text search',
      icon: 'IconListSearch',
      isSystem: true,
      isNullable: true,
      isUIEditable: false,
    },
    standardObjectMetadataRelatedEntityIds:
      args.standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
    twentyStandardApplicationId: args.twentyStandardApplicationId,
    now: args.now,
  }),
});

export const buildMyahBrandBrainLinkStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'brandBrainLink',
    context: {
      universalIdentifier: 'f99ff6bc-3b56-4600-beb3-cfc2c23364f6',
      nameSingular: 'brandBrainLink',
      namePlural: 'brandBrainLinks',
      labelSingular: 'Brand Brain Link',
      labelPlural: 'Brand Brain Links',
      description:
        'An explicit backlink or citation between Brand Brain pages.',
      icon: 'IconLink',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahBrandBrainPageStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'brandBrainPage',
    context: {
      universalIdentifier: '6a8289d7-8034-4f70-b3fa-47bc0e52828f',
      nameSingular: 'brandBrainPage',
      namePlural: 'brandBrainPages',
      labelSingular: 'Brand Brain Page',
      labelPlural: 'Brand Brain',
      description:
        'A record-backed folder, page, Index, or Log entry for the Brand Brain.',
      icon: 'IconNotebook',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'title',
    },
  });

export const buildMyahBrandBrainUpdateProposalStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'brandBrainUpdateProposal',
    context: {
      universalIdentifier: 'facac4a1-0a2f-469f-9f1f-81ef01f06578',
      nameSingular: 'brandBrainUpdateProposal',
      namePlural: 'brandBrainUpdateProposals',
      labelSingular: 'Brand Brain Update Proposal',
      labelPlural: 'Brand Brain Update Proposals',
      description:
        'Dormant migration-safe proposal object retained for existing test workspaces; routine Brand Brain writes are direct agent updates.',
      icon: 'IconFilePencil',
      isSearchable: false,
      labelIdentifierFieldMetadataName: 'title',
    },
  });

export const buildMyahOfferStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'offer',
    context: {
      universalIdentifier: 'fd8a37b8-72db-5069-902a-a1763ddc63f7',
      nameSingular: 'offer',
      namePlural: 'offers',
      labelSingular: 'Offer',
      labelPlural: 'Offers',
      description: 'Commercial terms for creator promotion',
      icon: 'IconGift',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahOutreachActionStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'outreachAction',
    context: {
      universalIdentifier: 'b4459926-2c01-560a-8432-fa1974168439',
      nameSingular: 'outreachAction',
      namePlural: 'outreachActions',
      labelSingular: 'Outreach Action',
      labelPlural: 'Outreach Actions',
      description:
        'A scheduled or completed outreach action for a campaign creator',
      icon: 'IconSend',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahOutreachSequenceStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'outreachSequence',
    context: {
      universalIdentifier: '0446497e-3240-5a78-a02f-e08594e5c2af',
      nameSingular: 'outreachSequence',
      namePlural: 'outreachSequences',
      labelSingular: 'Outreach Sequence',
      labelPlural: 'Outreach Sequences',
      description: 'A campaign-level outreach sequence',
      icon: 'IconRoute',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahOutreachStepStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'outreachStep',
    context: {
      universalIdentifier: 'c25bfef3-4636-5864-a777-705238c91326',
      nameSingular: 'outreachStep',
      namePlural: 'outreachSteps',
      labelSingular: 'Outreach Step',
      labelPlural: 'Outreach Steps',
      description: 'A step in an outreach sequence',
      icon: 'IconListCheck',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahPromotedAssetStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'promotedAsset',
    context: {
      universalIdentifier: '843aa6c8-36af-5906-8241-4017c4188df7',
      nameSingular: 'promotedAsset',
      namePlural: 'promotedAssets',
      labelSingular: 'Promoted Asset',
      labelPlural: 'Promoted Assets',
      description: 'A product, app, offer, or asset promoted by creators',
      icon: 'IconPackage',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahCampaignCreatorStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'campaignCreator',
    context: {
      universalIdentifier: 'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a',
      nameSingular: 'campaignCreator',
      namePlural: 'campaignCreators',
      labelSingular: 'Campaign Creator',
      labelPlural: 'Campaign Creators',
      description: 'A selected creator in a campaign workflow',
      icon: 'IconUserCheck',
      isSearchable: true,
      isUICreatable: false,
      isUIEditable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahCampaignAccountStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'campaignAccount',
    context: {
      universalIdentifier: '5999e4dd-01a4-5ef5-8c95-754bf079defb',
      nameSingular: 'campaignAccount',
      namePlural: 'campaignAccounts',
      labelSingular: 'Campaign Account',
      labelPlural: 'Campaign Accounts',
      description: 'A workspace email account linked to a campaign',
      icon: 'IconMail',
      isSearchable: false,
      labelIdentifierFieldMetadataName: 'id',
    },
  });

export const buildMyahCampaignStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'campaign',
    context: {
      universalIdentifier: '9a09d54a-d464-5692-ac74-70527fb00ddd',
      nameSingular: 'campaign',
      namePlural: 'campaigns',
      labelSingular: 'Campaign',
      labelPlural: 'Campaigns',
      description:
        'A creator campaign organized by objective and target audience',
      icon: 'IconTargetArrow',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahCreatorListMemberStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'creatorListMember',
    context: {
      universalIdentifier: 'e004c4b4-b1e1-59d9-b096-9fc57875d47f',
      nameSingular: 'creatorListMember',
      namePlural: 'creatorListMembers',
      labelSingular: 'Creator List Member',
      labelPlural: 'Creator List Members',
      description: 'A creator captured inside a curated creator list',
      icon: 'IconUserPlus',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahCreatorListStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'creatorList',
    context: {
      universalIdentifier: 'd51f2758-055b-5367-8250-859cb3f58631',
      nameSingular: 'creatorList',
      namePlural: 'creatorLists',
      labelSingular: 'Creator List',
      labelPlural: 'Creator Lists',
      description: 'A reusable imported or curated creator cohort',
      icon: 'IconListDetails',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahCampaignCreatorListStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'campaignCreatorList',
    context: {
      universalIdentifier: 'd4d9c1e1-3f0f-4e1a-8d0d-4a3d5f5a1b20',
      nameSingular: 'campaignCreatorList',
      namePlural: 'campaignCreatorLists',
      labelSingular: 'Campaign Creator List',
      labelPlural: 'Campaign Creator Lists',
      description: 'A Creator List attached to a Campaign',
      icon: 'IconList',
      isSearchable: false,
      labelIdentifierFieldMetadataName: 'id',
    },
  });

export const buildMyahCampaignCreatorListSourceStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'campaignCreatorListSource',
    context: {
      universalIdentifier: '7973bfbb-ff71-47c3-94a6-9e4435eca326',
      nameSingular: 'campaignCreatorListSource',
      namePlural: 'campaignCreatorListSources',
      labelSingular: 'Campaign Creator List Source',
      labelPlural: 'Campaign Creator List Sources',
      description:
        'A retained Creator List admission source for a Campaign Creator',
      icon: 'IconListCheck',
      isSearchable: false,
      labelIdentifierFieldMetadataName: 'id',
    },
  });

export const buildMyahSocialProfileStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'socialProfile',
    context: {
      universalIdentifier: '48af2a1d-1903-5eeb-b216-d5c450f83e71',
      nameSingular: 'socialProfile',
      namePlural: 'socialProfiles',
      labelSingular: 'Social Profile',
      labelPlural: 'Social Profiles',
      description: 'A social account owned by a Creator',
      icon: 'IconUserCircle',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahCreatorStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'creator',
    context: {
      universalIdentifier: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
      nameSingular: 'creator',
      namePlural: 'creators',
      labelSingular: 'Creator',
      labelPlural: 'Creators',
      description:
        'A creator profile imported from influencer discovery sources',
      icon: 'IconUserStar',
      isSearchable: true,
      labelIdentifierFieldMetadataName: 'name',
    },
  });

export const buildMyahStandardFlatFieldMetadatas = ({
  objectName,
  ...args
}: Args): Record<string, FlatFieldMetadata> => {
  switch (objectName) {
    case 'brandBrainLink':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainLink',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        linkType: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainLink',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'linkType',
            type: FieldMetadataType.SELECT,
            label: 'Link Type',
            description: 'Link Type',
            icon: 'IconRouteAltLeft',
            options: [
              {
                id: '251e1198-0de4-454f-83e7-1d6a451af3a8',
                value: 'RELATED',
                label: 'Related',
                color: 'blue',
                position: 0,
              },
              {
                id: 'd885992d-2658-4410-8147-c6a7b8399f75',
                value: 'CITES',
                label: 'Cites',
                color: 'sky',
                position: 0,
              },
              {
                id: 'f77b8f64-7a75-43ac-b65f-918d2db70c9f',
                value: 'SUPPORTS',
                label: 'Supports',
                color: 'green',
                position: 0,
              },
              {
                id: '53b7572c-26e9-4f2b-8372-2dfcbfd560ff',
                value: 'CONTRADICTS',
                label: 'Contradicts',
                color: 'red',
                position: 0,
              },
              {
                id: '3af080c7-b833-4c1e-923a-1edc70e0e93c',
                value: 'SUPERSEDES',
                label: 'Supersedes',
                color: 'orange',
                position: 0,
              },
              {
                id: 'ee0d2617-4de2-44fb-b56e-7e574890acdf',
                value: 'DERIVED_FROM',
                label: 'Derived from',
                color: 'purple',
                position: 0,
              },
            ],
            isNullable: true,
            defaultValue: "'RELATED'",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        description: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainLink',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'description',
            type: FieldMetadataType.TEXT,
            label: 'Description',
            description: 'Description',
            icon: 'IconTextCaption',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        targetPage: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainLink',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'targetPage',
            label: 'Target Page',
            description: 'Target Page',
            icon: 'IconTag',
            targetObjectName: 'brandBrainPage',
            targetFieldName: 'targetPageLinks',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'targetPageId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sourcePage: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainLink',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'sourcePage',
            label: 'Source Page',
            description: 'Source Page',
            icon: 'IconTag',
            targetObjectName: 'brandBrainPage',
            targetFieldName: 'sourcePageLinks',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'sourcePageId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'brandBrainPage':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        title: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'title',
            type: FieldMetadataType.TEXT,
            label: 'Title',
            description: 'Title',
            icon: 'IconHeading',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        slug: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'slug',
            type: FieldMetadataType.TEXT,
            label: 'Slug',
            description: 'Slug',
            icon: 'IconLink',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        canonicalPath: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'canonicalPath',
            type: FieldMetadataType.TEXT,
            label: 'Canonical Path',
            description: 'Canonical Path',
            icon: 'IconRoute',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        idPath: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'idPath',
            type: FieldMetadataType.TEXT,
            label: 'ID Path',
            description: 'ID Path',
            icon: 'IconBinaryTree',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        pageType: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'pageType',
            type: FieldMetadataType.SELECT,
            label: 'Page Type',
            description: 'Page Type',
            icon: 'IconCategory',
            options: [
              {
                id: '1cc61a12-c3f0-43ef-904f-ed58c0a9f3c4',
                value: 'BRAND_ROOT',
                label: 'Brand root',
                color: 'purple',
                position: 0,
              },
              {
                id: 'fc0ad6a2-61f9-4985-a6be-e8978f5733c3',
                value: 'FOLDER',
                label: 'Folder',
                color: 'blue',
                position: 0,
              },
              {
                id: '91ca184c-5274-4e1d-b960-07fe10b4e8f4',
                value: 'PAGE',
                label: 'Page',
                color: 'green',
                position: 0,
              },
              {
                id: 'f47b7f64-ee39-4896-a27f-cbc069e712fa',
                value: 'INDEX',
                label: 'Index',
                color: 'sky',
                position: 0,
              },
              {
                id: 'e6c933f3-111d-4966-a7b2-7e72ee4d4d92',
                value: 'LOG',
                label: 'Log',
                color: 'orange',
                position: 0,
              },
              {
                id: '83e84f56-a98b-4a36-92d7-23b2ea3160f1',
                value: 'SOURCE',
                label: 'Source',
                color: 'gray',
                position: 0,
              },
              {
                id: '2cf85c0b-8662-4de2-a2c4-63715358f931',
                value: 'PROMPT',
                label: 'Prompt',
                color: 'pink',
                position: 0,
              },
              {
                id: '138f5749-c522-4c04-a55b-e23c29c3e188',
                value: 'PLAYBOOK',
                label: 'Playbook',
                color: 'turquoise',
                position: 0,
              },
            ],
            isNullable: true,
            defaultValue: "'PAGE'",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        status: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'status',
            type: FieldMetadataType.SELECT,
            label: 'Status',
            description: 'Status',
            icon: 'IconProgressCheck',
            options: [
              {
                id: '7eeae3ef-e85f-431a-8889-562057d78e40',
                value: 'DRAFT',
                label: 'Draft',
                color: 'gray',
                position: 0,
              },
              {
                id: '47617c1b-b0d0-44b4-8b5d-6c1f3dc365a2',
                value: 'APPROVED',
                label: 'Approved',
                color: 'green',
                position: 1,
              },
              {
                id: 'b366dc27-8151-4203-bc8d-55ae2013fbbe',
                value: 'STALE',
                label: 'Stale',
                color: 'orange',
                position: 2,
              },
              {
                id: 'caebc76e-47f1-4498-b2ad-8a0d6d28a469',
                value: 'ARCHIVED',
                label: 'Archived',
                color: 'red',
                position: 3,
              },
            ],
            isNullable: true,
            defaultValue: "'DRAFT'",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        body: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'body',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Body',
            description: 'Body',
            icon: 'IconNotes',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        summary: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'summary',
            type: FieldMetadataType.TEXT,
            label: 'Summary',
            description: 'Summary',
            icon: 'IconTextCaption',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        tags: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'tags',
            type: FieldMetadataType.ARRAY,
            label: 'Tags',
            description: 'Tags',
            icon: 'IconTags',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sortOrder: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'sortOrder',
            type: FieldMetadataType.NUMBER,
            label: 'Sort Order',
            description: 'Sort Order',
            icon: 'IconSortAscending',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        aliases: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'aliases',
            type: FieldMetadataType.ARRAY,
            label: 'Aliases',
            description: 'Aliases',
            icon: 'IconArrowFork',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        targetPageLinks: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'targetPageLinks',
            label: 'Incoming Links',
            description: 'Incoming Links',
            icon: 'IconTag',
            targetObjectName: 'brandBrainLink',
            targetFieldName: 'targetPage',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        updateProposals: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'updateProposals',
            label: 'Update Proposals',
            description: 'Update Proposals',
            icon: 'IconTag',
            targetObjectName: 'brandBrainUpdateProposal',
            targetFieldName: 'targetPage',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        childPages: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'childPages',
            label: 'Child Pages',
            description: 'Child Pages',
            icon: 'IconTag',
            targetObjectName: 'brandBrainPage',
            targetFieldName: 'parentPage',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        parentPage: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'parentPage',
            label: 'Parent Page',
            description: 'Parent Page',
            icon: 'IconTag',
            targetObjectName: 'brandBrainPage',
            targetFieldName: 'childPages',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              joinColumnName: 'parentPageId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sourcePageLinks: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'sourcePageLinks',
            label: 'Outgoing Links',
            description: 'Outgoing Links',
            icon: 'IconTag',
            targetObjectName: 'brandBrainLink',
            targetFieldName: 'sourcePage',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        noteTargets: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'noteTargets',
            label: 'Notes',
            description: 'Notes tied to the Brand Brain page',
            icon: 'IconNotes',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'noteTarget',
            targetFieldName: 'targetBrandBrainPage',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        taskTargets: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainPage',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'taskTargets',
            label: 'Tasks',
            description: 'Tasks tied to the Brand Brain page',
            icon: 'IconCheckbox',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'taskTarget',
            targetFieldName: 'targetBrandBrainPage',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'brandBrainUpdateProposal':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        title: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'title',
            type: FieldMetadataType.TEXT,
            label: 'Title',
            description: 'Title',
            icon: 'IconHeading',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        proposalType: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'proposalType',
            type: FieldMetadataType.SELECT,
            label: 'Proposal Type',
            description: 'Proposal Type',
            icon: 'IconEdit',
            options: [
              {
                id: 'dd5522a7-f3d6-4ce3-a1ea-336f4f0b772f',
                value: 'CREATE_PAGE',
                label: 'Create page',
                color: 'green',
                position: 0,
              },
              {
                id: '4e61f20b-6643-4307-913c-06696947aef8',
                value: 'UPDATE_PAGE',
                label: 'Update page',
                color: 'blue',
                position: 0,
              },
              {
                id: 'b5ab743d-6337-4c51-a7dc-56c28341e697',
                value: 'APPEND_LOG',
                label: 'Append log',
                color: 'orange',
                position: 0,
              },
              {
                id: '08137fbf-127b-472c-b3ea-2255f86a7db5',
                value: 'UPDATE_INDEX',
                label: 'Update index',
                color: 'sky',
                position: 0,
              },
              {
                id: '51b3a48a-c9ed-4420-80d5-990ee5d0d4c9',
                value: 'ADD_LINK',
                label: 'Add link',
                color: 'purple',
                position: 0,
              },
              {
                id: '7d4f06a5-8623-46a2-8780-7ab9cd337919',
                value: 'ARCHIVE_PAGE',
                label: 'Archive page',
                color: 'red',
                position: 0,
              },
            ],
            isNullable: true,
            defaultValue: "'UPDATE_PAGE'",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        status: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'status',
            type: FieldMetadataType.SELECT,
            label: 'Status',
            description: 'Status',
            icon: 'IconProgressCheck',
            options: [
              {
                id: '064cf1aa-f26e-4397-8fd8-15d24b8c0122',
                value: 'PENDING',
                label: 'Pending',
                color: 'orange',
                position: 0,
              },
              {
                id: '69fdb8eb-6fc3-46fc-a554-edeb13fff56b',
                value: 'APPROVED',
                label: 'Approved',
                color: 'green',
                position: 0,
              },
              {
                id: 'c8de23d7-3b9e-4c63-9c7b-37b901eb5773',
                value: 'REJECTED',
                label: 'Rejected',
                color: 'red',
                position: 0,
              },
              {
                id: 'ea5d03c1-d933-468a-8bc8-e3e5fc33cf23',
                value: 'APPLIED',
                label: 'Applied',
                color: 'blue',
                position: 0,
              },
            ],
            isNullable: true,
            defaultValue: "'PENDING'",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        reason: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'reason',
            type: FieldMetadataType.TEXT,
            label: 'Reason',
            description: 'Reason',
            icon: 'IconMessage2Question',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        proposedPatch: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'proposedPatch',
            type: FieldMetadataType.TEXT,
            label: 'Proposed Patch',
            description: 'Proposed Patch',
            icon: 'IconDiff',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sourceSummary: createMyahStandardFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'sourceSummary',
            type: FieldMetadataType.TEXT,
            label: 'Source Summary',
            description: 'Source Summary',
            icon: 'IconSourceCode',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        targetPage: createStandardRelationFieldFlatMetadata({
          objectName: 'brandBrainUpdateProposal',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'targetPage',
            label: 'Target Page',
            description: 'Target Page',
            icon: 'IconTag',
            targetObjectName: 'brandBrainPage',
            targetFieldName: 'updateProposals',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'targetPageId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'offer':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaign: createStandardRelationFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaign',
            label: 'Campaign',
            description: 'Campaign',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaign',
            targetFieldName: 'offers',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'campaignId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        promotedAsset: createStandardRelationFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'promotedAsset',
            label: 'Promoted Asset',
            description: 'Promoted Asset',
            icon: 'IconPackage',
            targetObjectName: 'promotedAsset',
            targetFieldName: 'offers',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'promotedAssetId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        termsSummary: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'termsSummary',
            type: FieldMetadataType.TEXT,
            label: 'Terms summary',
            description: 'Terms summary',
            icon: 'IconFileDollar',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        commissionRate: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'commissionRate',
            type: FieldMetadataType.NUMBER,
            label: 'Commission rate',
            description: 'Commission rate',
            icon: 'IconPercentage',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        fixedFee: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'fixedFee',
            type: FieldMetadataType.NUMBER,
            label: 'Fixed fee',
            description: 'Fixed fee',
            icon: 'IconCash',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        cpaAmount: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'cpaAmount',
            type: FieldMetadataType.NUMBER,
            label: 'CPA amount',
            description: 'CPA amount',
            icon: 'IconReceipt',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        giftedProductNotes: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'giftedProductNotes',
            type: FieldMetadataType.TEXT,
            label: 'Gifted product notes',
            description: 'Gifted product notes',
            icon: 'IconPackageExport',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        usageRightsNotes: createMyahStandardFieldFlatMetadata({
          objectName: 'offer',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'usageRightsNotes',
            type: FieldMetadataType.TEXT,
            label: 'Usage rights notes',
            description: 'Usage rights notes',
            icon: 'IconLicense',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'outreachAction':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreator: createStandardRelationFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreator',
            label: 'Campaign Creator',
            description: 'Campaign Creator',
            icon: 'IconUserCheck',
            targetObjectName: 'campaignCreator',
            targetFieldName: 'outreachActions',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'campaignCreatorId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        outreachStep: createStandardRelationFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'outreachStep',
            label: 'Outreach Step',
            description: 'Outreach Step',
            icon: 'IconListCheck',
            targetObjectName: 'outreachStep',
            targetFieldName: 'actions',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'outreachStepId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        channel: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'channel',
            type: FieldMetadataType.TEXT,
            label: 'Channel',
            description: 'Channel',
            icon: 'IconSend',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        status: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'status',
            type: FieldMetadataType.SELECT,
            label: 'Status',
            description: 'Status',
            icon: 'IconProgress',
            options: [
              {
                id: '064cf1aa-f26e-4397-8fd8-15d24b8c0122',
                value: 'PENDING',
                label: 'Pending',
                color: 'orange',
                position: 0,
              },
              {
                id: '69fdb8eb-6fc3-46fc-a554-edeb13fff56b',
                value: 'APPROVED',
                label: 'Approved',
                color: 'green',
                position: 0,
              },
              {
                id: 'c8de23d7-3b9e-4c63-9c7b-37b901eb5773',
                value: 'REJECTED',
                label: 'Rejected',
                color: 'red',
                position: 0,
              },
              {
                id: 'ea5d03c1-d933-468a-8bc8-e3e5fc33cf23',
                value: 'APPLIED',
                label: 'Applied',
                color: 'blue',
                position: 0,
              },
            ],
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        scheduledAt: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'scheduledAt',
            type: FieldMetadataType.DATE_TIME,
            label: 'Scheduled at',
            description: 'Scheduled at',
            icon: 'IconCalendarDue',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        completedAt: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'completedAt',
            type: FieldMetadataType.DATE_TIME,
            label: 'Completed at',
            description: 'Completed at',
            icon: 'IconCircleCheck',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        resultSummary: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'resultSummary',
            type: FieldMetadataType.TEXT,
            label: 'Result summary',
            description: 'Result summary',
            icon: 'IconReportAnalytics',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        subject: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'subject',
            type: FieldMetadataType.TEXT,
            label: 'Subject',
            description: 'Subject',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        body: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'body',
            type: FieldMetadataType.TEXT,
            label: 'Body',
            description: 'Body',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        contentDigest: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'contentDigest',
            type: FieldMetadataType.TEXT,
            label: 'Content digest',
            description: 'Content digest',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        recipientEmail: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'recipientEmail',
            type: FieldMetadataType.TEXT,
            label: 'Recipient email',
            description: 'Recipient email',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        connectedAccountId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'connectedAccountId',
            type: FieldMetadataType.TEXT,
            label: 'Connected account ID',
            description: 'Connected account ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        messageChannelId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'messageChannelId',
            type: FieldMetadataType.TEXT,
            label: 'Message channel ID',
            description: 'Message channel ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignAccountId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'campaignAccountId',
            type: FieldMetadataType.TEXT,
            label: 'Campaign account ID',
            description: 'Campaign account ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        senderEmail: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'senderEmail',
            type: FieldMetadataType.TEXT,
            label: 'Sender email',
            description: 'Sender email',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        senderDisplayName: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'senderDisplayName',
            type: FieldMetadataType.TEXT,
            label: 'Sender display name',
            description: 'Sender display name',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        approvalBindingId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'approvalBindingId',
            type: FieldMetadataType.TEXT,
            label: 'Approval binding ID',
            description: 'Approval binding ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        executionReceiptId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'executionReceiptId',
            type: FieldMetadataType.TEXT,
            label: 'Execution receipt ID',
            description: 'Execution receipt ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        providerDraftExternalId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'providerDraftExternalId',
            type: FieldMetadataType.TEXT,
            label: 'Provider draft external ID',
            description: 'Provider draft external ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sentHeaderMessageId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'sentHeaderMessageId',
            type: FieldMetadataType.TEXT,
            label: 'Sent header message ID',
            description: 'Sent header message ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        providerMessageExternalId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'providerMessageExternalId',
            type: FieldMetadataType.TEXT,
            label: 'Provider message external ID',
            description: 'Provider message external ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        providerThreadExternalId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'providerThreadExternalId',
            type: FieldMetadataType.TEXT,
            label: 'Provider thread external ID',
            description: 'Provider thread external ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        messageId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'messageId',
            type: FieldMetadataType.TEXT,
            label: 'Message ID',
            description: 'Message ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        messageThreadId: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'messageThreadId',
            type: FieldMetadataType.TEXT,
            label: 'Message thread ID',
            description: 'Message thread ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        inReplyTo: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachAction',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'inReplyTo',
            type: FieldMetadataType.TEXT,
            label: 'In reply to',
            description: 'In reply to',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'outreachSequence':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachSequence',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaign: createStandardRelationFieldFlatMetadata({
          objectName: 'outreachSequence',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaign',
            label: 'Campaign',
            description: 'Campaign',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaign',
            targetFieldName: 'outreachSequences',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'campaignId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        status: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachSequence',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'status',
            type: FieldMetadataType.SELECT,
            label: 'Status',
            description: 'Status',
            icon: 'IconProgress',
            options: [
              {
                id: '064cf1aa-f26e-4397-8fd8-15d24b8c0122',
                value: 'PENDING',
                label: 'Pending',
                color: 'orange',
                position: 0,
              },
              {
                id: '69fdb8eb-6fc3-46fc-a554-edeb13fff56b',
                value: 'APPROVED',
                label: 'Approved',
                color: 'green',
                position: 0,
              },
              {
                id: 'c8de23d7-3b9e-4c63-9c7b-37b901eb5773',
                value: 'REJECTED',
                label: 'Rejected',
                color: 'red',
                position: 0,
              },
              {
                id: 'ea5d03c1-d933-468a-8bc8-e3e5fc33cf23',
                value: 'APPLIED',
                label: 'Applied',
                color: 'blue',
                position: 0,
              },
            ],
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        description: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachSequence',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'description',
            type: FieldMetadataType.TEXT,
            label: 'Description',
            description: 'Description',
            icon: 'IconFileDescription',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        steps: createStandardRelationFieldFlatMetadata({
          objectName: 'outreachSequence',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'steps',
            label: 'Steps',
            description: 'Steps',
            icon: 'IconListCheck',
            targetObjectName: 'outreachStep',
            targetFieldName: 'outreachSequence',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'outreachStep':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        outreachSequence: createStandardRelationFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'outreachSequence',
            label: 'Outreach Sequence',
            description: 'Outreach Sequence',
            icon: 'IconRoute',
            targetObjectName: 'outreachSequence',
            targetFieldName: 'steps',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'outreachSequenceId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        stepPosition: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'stepPosition',
            type: FieldMetadataType.NUMBER,
            label: 'Step position',
            description: 'Step position',
            icon: 'IconSortAscending',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        trigger: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'trigger',
            type: FieldMetadataType.TEXT,
            label: 'Trigger',
            description: 'Trigger',
            icon: 'IconBolt',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        channel: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'channel',
            type: FieldMetadataType.TEXT,
            label: 'Channel',
            description: 'Channel',
            icon: 'IconSend',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        delayDays: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'delayDays',
            type: FieldMetadataType.NUMBER,
            label: 'Delay days',
            description: 'Delay days',
            icon: 'IconClock',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        templateSummary: createMyahStandardFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'templateSummary',
            type: FieldMetadataType.TEXT,
            label: 'Template summary',
            description: 'Template summary',
            icon: 'IconTemplate',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        actions: createStandardRelationFieldFlatMetadata({
          objectName: 'outreachStep',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'actions',
            label: 'Actions',
            description: 'Actions',
            icon: 'IconSend',
            targetObjectName: 'outreachAction',
            targetFieldName: 'outreachStep',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'promotedAsset':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'promotedAsset',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        assetType: createMyahStandardFieldFlatMetadata({
          objectName: 'promotedAsset',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'assetType',
            type: FieldMetadataType.TEXT,
            label: 'Asset type',
            description: 'Asset type',
            icon: 'IconCategory',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        url: createMyahStandardFieldFlatMetadata({
          objectName: 'promotedAsset',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'url',
            type: FieldMetadataType.TEXT,
            label: 'URL',
            description: 'URL',
            icon: 'IconLink',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        description: createMyahStandardFieldFlatMetadata({
          objectName: 'promotedAsset',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'description',
            type: FieldMetadataType.TEXT,
            label: 'Description',
            description: 'Description',
            icon: 'IconFileDescription',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        offers: createStandardRelationFieldFlatMetadata({
          objectName: 'promotedAsset',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'offers',
            label: 'Offers',
            description: 'Offers',
            icon: 'IconGift',
            targetObjectName: 'offer',
            targetFieldName: 'promotedAsset',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'campaignAccount':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        campaign: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignAccount',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaign',
            label: 'Campaign',
            description: 'Campaign',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaign',
            targetFieldName: 'campaignAccounts',
            morphId: null,
            isNullable: false,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'campaignId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        channel: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignAccount',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'channel',
            type: FieldMetadataType.SELECT,
            label: 'Channel',
            description: 'Channel',
            icon: 'IconMail',
            isNullable: false,
            defaultValue: "'EMAIL'",
            options: [
              {
                id: '09ea1008-3c89-5d22-a546-35944756caeb',
                value: 'EMAIL',
                label: 'Email',
                color: 'blue',
                position: 0,
              },
            ],
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        connectedAccountId: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignAccount',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'connectedAccountId',
            type: FieldMetadataType.TEXT,
            label: 'Connected account ID',
            description: 'Connected account ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        messageChannelId: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignAccount',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'messageChannelId',
            type: FieldMetadataType.TEXT,
            label: 'Message channel ID',
            description: 'Message channel ID',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        isDefault: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignAccount',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'isDefault',
            type: FieldMetadataType.BOOLEAN,
            label: 'Default',
            description: 'Whether this linked account is the campaign default',
            icon: 'IconCircleCheck',
            isNullable: false,
            defaultValue: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'campaignCreatorList':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        campaign: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreatorList',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaign',
            label: 'Campaign',
            description: 'Campaign',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaign',
            targetFieldName: 'campaignCreatorLists',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'campaignId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        creatorList: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreatorList',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'creatorList',
            label: 'Creator List',
            description: 'Creator List',
            icon: 'IconList',
            targetObjectName: 'creatorList',
            targetFieldName: 'campaignCreatorLists',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'creatorListId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'campaignCreatorListSource':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        campaignCreator: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreatorListSource',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreator',
            label: 'Campaign Creator',
            description: 'Campaign Creator',
            icon: 'IconUserStar',
            targetObjectName: 'campaignCreator',
            targetFieldName: 'campaignCreatorListSources',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'campaignCreatorId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        creatorList: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreatorListSource',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'creatorList',
            label: 'Creator List',
            description: 'Creator List',
            icon: 'IconList',
            targetObjectName: 'creatorList',
            targetFieldName: 'campaignCreatorListSources',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.CASCADE,
              joinColumnName: 'creatorListId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'campaignCreator':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        creator: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'creator',
            label: 'Creator',
            description: 'Creator',
            icon: 'IconUserStar',
            targetObjectName: 'creator',
            targetFieldName: 'campaignCreators',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'creatorId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaign: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaign',
            label: 'Campaign',
            description: 'Campaign',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaign',
            targetFieldName: 'campaignCreators',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'campaignId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        isDirectlyAdded: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'isDirectlyAdded',
            type: FieldMetadataType.BOOLEAN,
            label: 'Directly added',
            description:
              'Whether this Creator was added directly to the Campaign',
            icon: 'IconUserPlus',
            isNullable: false,
            defaultValue: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        stage: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'stage',
            type: FieldMetadataType.SELECT,
            label: 'Stage',
            description: 'Campaign outreach stage',
            icon: 'IconProgress',
            isNullable: true,
            defaultValue: `'${MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE}'`,
            options: [...MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS],
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        excludedAt: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'excludedAt',
            type: FieldMetadataType.DATE_TIME,
            label: 'Excluded at',
            description: 'When this Creator was excluded from Campaign sends',
            icon: 'IconUserOff',
            isNullable: true,
            isUIEditable: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        excludedByWorkspaceMemberId: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'excludedByWorkspaceMemberId',
            type: FieldMetadataType.TEXT,
            label: 'Excluded by',
            description: 'Workspace member who excluded this Creator',
            icon: 'IconUserOff',
            isNullable: true,
            isUIEditable: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        exclusionReason: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'exclusionReason',
            type: FieldMetadataType.TEXT,
            label: 'Exclusion reason',
            description: 'Why this Creator was excluded from Campaign sends',
            icon: 'IconUserOff',
            isNullable: true,
            isUIEditable: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        selectedContactMethod: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'selectedContactMethod',
            type: FieldMetadataType.TEXT,
            label: 'Selected contact method',
            description: 'Selected contact method',
            icon: 'IconSend',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        assignedManagedMailboxId: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'assignedManagedMailboxId',
            type: FieldMetadataType.TEXT,
            label: 'Managed mailbox',
            description: 'Managed mailbox assigned for campaign outreach',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        nextActionAt: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'nextActionAt',
            type: FieldMetadataType.DATE_TIME,
            label: 'Next action at',
            description: 'Next action at',
            icon: 'IconCalendarDue',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        selectionReason: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'selectionReason',
            type: FieldMetadataType.TEXT,
            label: 'Selection reason',
            description: 'Selection reason',
            icon: 'IconMessageCircle',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        dealSummary: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'dealSummary',
            type: FieldMetadataType.TEXT,
            label: 'Deal summary',
            description: 'Deal summary',
            icon: 'IconFileDollar',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        outcomeSummary: createMyahStandardFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'outcomeSummary',
            type: FieldMetadataType.TEXT,
            label: 'Outcome summary',
            description: 'Outcome summary',
            icon: 'IconReportAnalytics',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        outreachActions: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'outreachActions',
            label: 'Outreach actions',
            description: 'Outreach actions',
            icon: 'IconSend',
            targetObjectName: 'outreachAction',
            targetFieldName: 'campaignCreator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreatorListSources: createStandardRelationFieldFlatMetadata({
          objectName: 'campaignCreator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreatorListSources',
            label: 'Creator List Sources',
            description: 'Retained Creator List admission sources',
            icon: 'IconListCheck',
            targetObjectName: 'campaignCreatorListSource',
            targetFieldName: 'campaignCreator',
            morphId: null,
            settings: {
              relationType: RelationType.ONE_TO_MANY,
              emptyStateLabel: 'Legacy / source unavailable',
              emptyStateWhenBooleanFieldIsFalse: 'isDirectlyAdded',
            },
            junctionTargetFieldUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.campaignCreatorListSource.fields.creatorList
                .universalIdentifier,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'campaign':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        status: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'status',
            type: FieldMetadataType.SELECT,
            label: 'Legacy status',
            description: 'Deprecated legacy Campaign status',
            icon: 'IconProgress',
            options: [
              {
                id: '064cf1aa-f26e-4397-8fd8-15d24b8c0122',
                value: 'PENDING',
                label: 'Pending',
                color: 'orange',
                position: 0,
              },
              {
                id: '69fdb8eb-6fc3-46fc-a554-edeb13fff56b',
                value: 'APPROVED',
                label: 'Approved',
                color: 'green',
                position: 1,
              },
              {
                id: 'c8de23d7-3b9e-4c63-9c7b-37b901eb5773',
                value: 'REJECTED',
                label: 'Rejected',
                color: 'red',
                position: 2,
              },
              {
                id: 'ea5d03c1-d933-468a-8bc8-e3e5fc33cf23',
                value: 'APPLIED',
                label: 'Applied',
                color: 'blue',
                position: 3,
              },
            ],
            isNullable: true,
            isUIEditable: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        lifecycleStatus: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'lifecycleStatus',
            type: FieldMetadataType.SELECT,
            label: 'Status',
            description: 'Campaign lifecycle status',
            icon: 'IconProgress',
            options: [
              {
                id: '33761880-4f9f-4cd0-8aa1-af581acc9007',
                value: 'DRAFT',
                label: 'Draft',
                color: 'gray',
                position: 0,
              },
              {
                id: '146b71f4-261b-46d3-8968-49d64b29ce5a',
                value: 'ACTIVE',
                label: 'Active',
                color: 'green',
                position: 1,
              },
              {
                id: '2011eae8-6fcb-48c2-9160-d33f71bc5a6e',
                value: 'PAUSED',
                label: 'Paused',
                color: 'orange',
                position: 2,
              },
              {
                id: 'f1edc24c-6615-4936-88b6-776103e11b17',
                value: 'COMPLETED',
                label: 'Completed',
                color: 'blue',
                position: 3,
              },
            ],
            isNullable: true,
            isUIEditable: false,
            defaultValue: "'DRAFT'",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sequenceAuthorization: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            // The generated shared metadata barrel/type surface is linked in W8.
            fieldName: 'sequenceAuthorization' as never,
            type: FieldMetadataType.RAW_JSON,
            label: 'Sequence authorization',
            description:
              'System-managed current Campaign sequence authorization projection',
            icon: 'IconLockAccess',
            isSystem: true,
            isNullable: true,
            isUIEditable: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        objective: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'objective',
            type: FieldMetadataType.TEXT,
            label: 'Objective',
            description: 'Objective',
            icon: 'IconTarget',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        owner: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'owner',
            label: 'Owner',
            description: 'Owner',
            icon: 'IconUserCircle',
            targetObjectName: 'workspaceMember',
            targetFieldName: 'ownedCampaigns',
            morphId: null,
            isNullable: true,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'ownerId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        targetPlatforms: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'targetPlatforms',
            type: FieldMetadataType.TEXT,
            label: 'Target platforms',
            description: 'Target platforms',
            icon: 'IconApps',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        targetDemographics: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'targetDemographics',
            type: FieldMetadataType.TEXT,
            label: 'Target demographics',
            description: 'Target demographics',
            icon: 'IconUsersGroup',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        icpGoal: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'icpGoal',
            type: FieldMetadataType.TEXT,
            label: 'ICP goal',
            description: 'ICP goal',
            icon: 'IconSparkles',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        budgetNotes: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'budgetNotes',
            type: FieldMetadataType.TEXT,
            label: 'Budget notes',
            description: 'Budget notes',
            icon: 'IconCash',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignBrief: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'campaignBrief',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Detailed Campaign brief',
            description:
              'The detailed campaign-specific brief: outcome, offer/context, intended creator work, and relevant operating context.',
            icon: 'IconFileText',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        communicationGuidelines: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'communicationGuidelines',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Communication guidelines',
            description:
              'Voice, claims, tone, channel, and communication constraints for campaign drafting.',
            icon: 'IconFileText',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        replyRules: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'replyRules',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Reply rules and approved answers',
            description:
              'Reply boundaries, approved answer patterns, and situations requiring a draft instead of action.',
            icon: 'IconFileText',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        escalationBoundaries: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'escalationBoundaries',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Escalation boundaries',
            description:
              'Situations that must be escalated to an operator and campaign-specific escalation constraints.',
            icon: 'IconFileText',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        additionalNotes: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'additionalNotes',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Additional notes',
            description:
              'Campaign-specific material not represented by another guided section.',
            icon: 'IconFileText',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        emailSignature: createMyahStandardFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'emailSignature',
            type: FieldMetadataType.RICH_TEXT,
            label: 'Email signature',
            description:
              'Complete closing block appended to generated replies. Include your preferred sign-off, name, title, company, and contact details.',
            icon: 'IconSignature',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        outreachWorkflows: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'outreachWorkflows',
            label: 'Outreach workflows',
            description: 'Outreach workflow owned by this Campaign',
            icon: 'IconSettingsAutomation',
            targetObjectName: 'workflow',
            targetFieldName: 'outreachCampaign',
            morphId: null,
            isUIEditable: false,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreators: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreators',
            label: 'Campaign creators',
            description: 'Campaign creators',
            icon: 'IconUsersGroup',
            targetObjectName: 'campaignCreator',
            targetFieldName: 'campaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreatorLists: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreatorLists',
            label: 'Creator Lists',
            description: 'Creator Lists attached to this Campaign',
            icon: 'IconList',
            targetObjectName: 'campaignCreatorList',
            targetFieldName: 'campaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignAccounts: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignAccounts',
            label: 'Campaign accounts',
            description: 'Workspace accounts linked to this Campaign',
            icon: 'IconMail',
            targetObjectName: 'campaignAccount',
            targetFieldName: 'campaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        offers: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'offers',
            label: 'Offers',
            description: 'Offers',
            icon: 'IconGift',
            targetObjectName: 'offer',
            targetFieldName: 'campaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        outreachSequences: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'outreachSequences',
            label: 'Outreach sequences',
            description: 'Outreach sequences',
            icon: 'IconRoute',
            targetObjectName: 'outreachSequence',
            targetFieldName: 'campaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        inboxThreads: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'inboxThreads',
            label: 'Inbox threads',
            description: 'Inbox threads',
            icon: 'IconMail',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'messageThread',
            targetFieldName: 'myahCampaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        timelineActivities: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'timelineActivities',
            label: 'Timeline Activities',
            description: 'Timeline activities tied to the Campaign',
            icon: 'IconTimelineEvent',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'timelineActivity',
            targetFieldName: 'targetCampaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        noteTargets: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'noteTargets',
            label: 'Notes',
            description: 'Notes tied to the campaign',
            icon: 'IconNotes',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'noteTarget',
            targetFieldName: 'targetCampaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        taskTargets: createStandardRelationFieldFlatMetadata({
          objectName: 'campaign',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'taskTargets',
            label: 'Tasks',
            description: 'Tasks tied to the campaign',
            icon: 'IconCheckbox',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'taskTarget',
            targetFieldName: 'targetCampaign',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'creatorListMember':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'creatorListMember',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        creator: createStandardRelationFieldFlatMetadata({
          objectName: 'creatorListMember',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'creator',
            label: 'Creator',
            description: 'Creator',
            icon: 'IconUserStar',
            targetObjectName: 'creator',
            targetFieldName: 'listMemberships',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'creatorId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        creatorList: createStandardRelationFieldFlatMetadata({
          objectName: 'creatorListMember',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'creatorList',
            label: 'Creator List',
            description: 'Creator List',
            icon: 'IconListDetails',
            targetObjectName: 'creatorList',
            targetFieldName: 'members',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'creatorListId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        source: createMyahStandardFieldFlatMetadata({
          objectName: 'creatorListMember',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'source',
            type: FieldMetadataType.TEXT,
            label: 'Source',
            description: 'Source',
            icon: 'IconDatabaseImport',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        notes: createMyahStandardFieldFlatMetadata({
          objectName: 'creatorListMember',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'notes',
            type: FieldMetadataType.TEXT,
            label: 'Notes',
            description: 'Notes',
            icon: 'IconNotes',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'creatorList':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'creatorList',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconTag',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        source: createMyahStandardFieldFlatMetadata({
          objectName: 'creatorList',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'source',
            type: FieldMetadataType.TEXT,
            label: 'Source',
            description: 'Source',
            icon: 'IconDatabaseImport',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        description: createMyahStandardFieldFlatMetadata({
          objectName: 'creatorList',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'description',
            type: FieldMetadataType.TEXT,
            label: 'Description',
            description: 'Description',
            icon: 'IconFileDescription',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        members: createStandardRelationFieldFlatMetadata({
          objectName: 'creatorList',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'members',
            label: 'Members',
            description: 'Members',
            icon: 'IconUsersGroup',
            targetObjectName: 'creatorListMember',
            targetFieldName: 'creatorList',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreatorLists: createStandardRelationFieldFlatMetadata({
          objectName: 'creatorList',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreatorLists',
            label: 'Campaign Creator Lists',
            description: 'Campaigns using this Creator List',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaignCreatorList',
            targetFieldName: 'creatorList',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreatorListSources: createStandardRelationFieldFlatMetadata({
          objectName: 'creatorList',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreatorListSources',
            label: 'Campaign Creator List Sources',
            description: 'Campaign Creator admissions from this List',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaignCreatorListSource',
            targetFieldName: 'creatorList',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
            junctionTargetFieldUniversalIdentifier:
              MYAH_STANDARD_OBJECTS.campaignCreatorListSource.fields
                .campaignCreator.universalIdentifier,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'socialProfile':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Derived social profile label',
            icon: 'IconUserCircle',
            isNullable: false,
            isUIEditable: false,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        creator: createStandardRelationFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'creator',
            label: 'Creator',
            description: 'Creator who owns this social profile',
            icon: 'IconUserStar',
            isNullable: false,
            targetObjectName: 'creator',
            targetFieldName: 'socialProfiles',
            morphId: null,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.RESTRICT,
              joinColumnName: 'creatorId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        platform: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'platform',
            type: FieldMetadataType.SELECT,
            label: 'Platform',
            description: 'Social platform',
            icon: 'IconWorld',
            isNullable: false,
            isUIEditable: false,
            options: [
              {
                id: '635e50f6-aced-52b7-9e6f-59c12703d0b5',
                value: 'INSTAGRAM',
                label: 'Instagram',
                color: 'pink',
                position: 0,
              },
              {
                id: '181fb825-37d9-555b-8208-990d0fbc89b4',
                value: 'TIKTOK',
                label: 'TikTok',
                color: 'gray',
                position: 1,
              },
              {
                id: 'aacb7cfd-7e10-5955-ac04-65b0091653cc',
                value: 'YOUTUBE',
                label: 'YouTube',
                color: 'red',
                position: 2,
              },
              {
                id: 'ff65c9e4-2e95-5bc9-b3ce-507d23f16a72',
                value: 'TWITTER',
                label: 'Twitter / X',
                color: 'blue',
                position: 3,
              },
              {
                id: 'bdab81b8-92a7-53d6-9f3b-00ed77757eb1',
                value: 'TWITCH',
                label: 'Twitch',
                color: 'purple',
                position: 4,
              },
              {
                id: '58d06f50-bbf4-5c47-8158-83f973cfbc8b',
                value: 'PATREON',
                label: 'Patreon',
                color: 'orange',
                position: 5,
              },
            ],
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        handle: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'handle',
            type: FieldMetadataType.TEXT,
            label: 'Handle',
            description: 'Platform account handle',
            icon: 'IconAt',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        profileUrl: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'profileUrl',
            type: FieldMetadataType.TEXT,
            label: 'Profile URL',
            description: 'Canonical profile URL',
            icon: 'IconLink',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        normalizedLocator: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'normalizedLocator',
            type: FieldMetadataType.TEXT,
            label: 'Normalized locator',
            description: 'Canonical account locator used for identity matching',
            icon: 'IconFingerprint',
            isSystem: true,
            isNullable: true,
            isUIEditable: false,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        platformAccountId: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'platformAccountId',
            type: FieldMetadataType.TEXT,
            label: 'Platform account ID',
            description: 'Stable platform account identifier',
            icon: 'IconFingerprint',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        followerCount: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'followerCount',
            type: FieldMetadataType.NUMBER,
            label: 'Follower count',
            description: 'Observed follower or subscriber count',
            icon: 'IconUsers',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        followerCountObservedAt: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'followerCountObservedAt',
            type: FieldMetadataType.DATE_TIME,
            label: 'Follower count observed at',
            description: 'Time the follower count was observed',
            icon: 'IconCalendarClock',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        followerCountSource: createMyahStandardFieldFlatMetadata({
          objectName: 'socialProfile',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'followerCountSource',
            type: FieldMetadataType.TEXT,
            label: 'Follower count source',
            description: 'Source of the follower count observation',
            icon: 'IconDatabase',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'creator':
      return {
        ...buildMyahBaseSystemFields({ objectName, ...args }),
        instagramConversations: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'instagramConversations',
            label: 'Instagram conversations',
            description: 'Instagram conversations',
            icon: 'IconMessages',
            targetObjectName: 'myahSocialConversation',
            targetFieldName: 'creator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        instagramMessageDrafts: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'instagramMessageDrafts',
            label: 'Instagram message drafts',
            description: 'Instagram message drafts',
            icon: 'IconMessagePlus',
            targetObjectName: 'myahInstagramReplyDraft',
            targetFieldName: 'creator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        name: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'name',
            type: FieldMetadataType.TEXT,
            label: 'Name',
            description: 'Name',
            icon: 'IconUser',
            isNullable: true,
            defaultValue: "''",
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        email: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'email',
            type: FieldMetadataType.TEXT,
            label: 'Email',
            description: 'Email',
            icon: 'IconMail',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        phone: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'phone',
            type: FieldMetadataType.TEXT,
            label: 'Phone',
            description: 'Phone',
            icon: 'IconPhone',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        location: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'location',
            type: FieldMetadataType.TEXT,
            label: 'Location',
            description: 'Location',
            icon: 'IconMapPin',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        language: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'language',
            type: FieldMetadataType.TEXT,
            label: 'Language',
            description: 'Language',
            icon: 'IconLanguage',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        owner: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'owner',
            label: 'Owner',
            description: 'Owner',
            icon: 'IconUserCircle',
            targetObjectName: 'workspaceMember',
            targetFieldName: 'ownedCreators',
            morphId: null,
            isNullable: true,
            settings: {
              relationType: RelationType.MANY_TO_ONE,
              onDelete: RelationOnDeleteAction.SET_NULL,
              joinColumnName: 'ownerId',
            },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        source: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'source',
            type: FieldMetadataType.TEXT,
            label: 'Source',
            description: 'Source',
            icon: 'IconDatabaseImport',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        sourceUrl: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'sourceUrl',
            type: FieldMetadataType.TEXT,
            label: 'Source URL',
            description: 'Source URL',
            icon: 'IconLink',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        importSource: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'importSource',
            type: FieldMetadataType.TEXT,
            label: 'Import source',
            description: 'Import source',
            icon: 'IconFileImport',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        lastImportedAt: createMyahStandardFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            fieldName: 'lastImportedAt',
            type: FieldMetadataType.DATE_TIME,
            label: 'Last imported at',
            description: 'Last imported at',
            icon: 'IconCalendarImport',
            isNullable: true,
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        socialProfiles: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'socialProfiles',
            label: 'Social profiles',
            description: 'Social accounts owned by this Creator',
            icon: 'IconUsers',
            targetObjectName: 'socialProfile',
            targetFieldName: 'creator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        listMemberships: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'listMemberships',
            label: 'List memberships',
            description: 'List memberships',
            icon: 'IconListDetails',
            targetObjectName: 'creatorListMember',
            targetFieldName: 'creator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        campaignCreators: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'campaignCreators',
            label: 'Campaign creators',
            description: 'Campaign creators',
            icon: 'IconTargetArrow',
            targetObjectName: 'campaignCreator',
            targetFieldName: 'creator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        inboxThreads: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'inboxThreads',
            label: 'Inbox threads',
            description: 'Inbox threads',
            icon: 'IconMail',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'messageThread',
            targetFieldName: 'creator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        timelineActivities: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'timelineActivities',
            label: 'Timeline Activities',
            description: 'Creators tied to the Creator',
            icon: 'IconBuildingSkyscraper',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'timelineActivity',
            targetFieldName: 'targetCreator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        attachments: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'attachments',
            label: 'Attachments',
            description: 'Creators tied to the Creator',
            icon: 'IconBuildingSkyscraper',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'attachment',
            targetFieldName: 'targetCreator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        noteTargets: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'noteTargets',
            label: 'Notes',
            description: 'Notes tied to the creator',
            icon: 'IconNotes',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'noteTarget',
            targetFieldName: 'targetCreator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
        taskTargets: createStandardRelationFieldFlatMetadata({
          objectName: 'creator',
          workspaceId: args.workspaceId,
          context: {
            type: FieldMetadataType.RELATION,
            fieldName: 'taskTargets',
            label: 'Tasks',
            description: 'Tasks tied to the creator',
            icon: 'IconCheckbox',
            isNullable: true,
            isUIEditable: false,
            targetObjectName: 'taskTarget',
            targetFieldName: 'targetCreator',
            morphId: null,
            settings: { relationType: RelationType.ONE_TO_MANY },
          },
          standardObjectMetadataRelatedEntityIds:
            args.standardObjectMetadataRelatedEntityIds,
          dependencyFlatEntityMaps: args.dependencyFlatEntityMaps,
          twentyStandardApplicationId: args.twentyStandardApplicationId,
          now: args.now,
        }),
      };

    case 'myahInstagramAccount':
    case 'myahSocialConversation':
    case 'myahSocialMessage':
    case 'myahInstagramReplyDraft':
      return buildMyahInstagramStandardFlatFieldMetadatas({
        objectName,
        ...args,
      });

    default:
      return {};
  }
};
export const MYAH_RELATION_FIELD_COUNT = 40;

type MyahInstagramFieldConfig = {
  name: string;
  type: FieldMetadataType;
  label: string;
  description?: string;
  icon?: string;
  isNullable?: boolean;
  isUnique?: boolean;
  isUIEditable?: boolean;
  defaultValue?: unknown;
  options?: unknown;
  universalSettings?: unknown;
};
const MYAH_INSTAGRAM_ACCOUNT_FIELD_CONFIGS = [
  {
    type: FieldMetadataType.TEXT,
    label: 'Label',
    name: 'label',
    description: 'Human-readable account label shown to workspace members.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Legacy connected account ID',
    name: 'connectedAccountId',
    isUnique: true,
    description:
      'Legacy provider connection id retained with this workspace Instagram account.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Legacy provider user ID',
    name: 'composioUserId',
    description: 'Legacy workspace user id retained for historical records.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Legacy authorization config ID',
    name: 'authConfigId',
    isNullable: true,
    defaultValue: null,
    description:
      'Legacy authorization configuration id retained for historical records.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Instagram account ID',
    name: 'igUserId',
    isNullable: true,
    isUnique: true,
    defaultValue: null,
    description: 'Instagram-scoped account id when returned by provider data.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Unipile account ID',
    name: 'unipileAccountId',
    isNullable: true,
    isUnique: true,
    defaultValue: null,
    description: 'Unipile account id for this workspace Instagram account.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Username',
    name: 'username',
    isNullable: true,
    defaultValue: null,
    description: 'Instagram username or handle when known.',
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Status',
    name: 'status',
    defaultValue: `'${'ACTIVE'}'`,
    options: [
      {
        id: '91e5543f-6fc5-4f49-a5bf-dccbbee7b625',
        value: 'ACTIVE',
        label: 'Active',
        position: 0,
        color: 'green',
      },
      {
        id: 'cb391884-78b4-4f8b-be4a-1ab8266654df',
        value: 'INACTIVE',
        label: 'Inactive',
        position: 1,
        color: 'gray',
      },
      {
        id: '0630ec55-2b0f-4ba1-ad69-776baf2889e7',
        value: 'NEEDS_RECONNECT',
        label: 'Needs reconnect',
        position: 2,
        color: 'orange',
      },
      {
        id: '343ff77a-a842-4549-9ff2-8f2fa02bbd3e',
        value: 'ERROR',
        label: 'Error',
        position: 3,
        color: 'red',
      },
      {
        id: 'b14dcff4-87a7-47b4-ad0b-507f825620cb',
        value: 'CONNECTING',
        label: 'Connecting',
        position: 4,
        color: 'blue',
      },
    ],
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Last checked at',
    name: 'lastCheckedAt',
    isNullable: true,
    defaultValue: null,
    description: 'Most recent status check time for this Instagram connection.',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Last conversation sync at',
    name: 'lastConversationSyncAt',
    isNullable: true,
    defaultValue: null,
    description:
      'Most recent manual conversation sync time. Polling is disabled.',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Completed chat sync at',
    name: 'completedChatSyncAt',
    isNullable: true,
    defaultValue: null,
    description: 'When the initial chat synchronization completed.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Conversation after cursor',
    name: 'conversationAfterCursor',
    isNullable: true,
    defaultValue: null,
    description:
      'Safe cursor for future manual or scheduled conversation sync. Do not store tokenized paging.next URLs.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Last error',
    name: 'lastError',
    isNullable: true,
    defaultValue: null,
    description:
      'Redacted latest provider/status error if the connection fails.',
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Conversations',
    name: 'conversations',
    description: 'Instagram conversations associated with this account.',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.ONE_TO_MANY,
    },
  },
] as const;
const MYAH_SOCIAL_CONVERSATION_FIELD_CONFIGS = [
  {
    type: FieldMetadataType.TEXT,
    label: 'Label',
    name: 'label',
    description: 'Human-readable thread label, such as creator handle.',
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Provider',
    name: 'provider',
    defaultValue: `'${'COMPOSIO_HISTORY'}'`,
    options: [
      {
        id: 'e161e884-2f21-44ad-a6ac-5e221a0c1cee',
        value: 'COMPOSIO_HISTORY',
        label: 'Composio history',
        position: 0,
        color: 'purple',
      },
      {
        id: '5dcd0095-ae5f-431a-8fe2-d5d0e22c98ce',
        value: 'UNIPILE',
        label: 'Unipile',
        position: 1,
        color: 'blue',
      },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Lifecycle',
    name: 'lifecycle',
    defaultValue: `'${'HISTORICAL'}'`,
    options: [
      {
        id: 'f0dec157-630f-46d0-ba8a-678f9082d2f9',
        value: 'ACTIVE',
        label: 'Active',
        position: 0,
        color: 'green',
      },
      {
        id: '4845c0dc-5892-46dc-9682-b008c6f6070f',
        value: 'HISTORICAL',
        label: 'Historical',
        position: 1,
        color: 'gray',
      },
    ],
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Provider conversation ID',
    name: 'providerConversationId',
    description:
      'Provider conversation id retained with the conversation metadata.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Recipient IGSID',
    name: 'recipientIgsid',
    isNullable: true,
    defaultValue: null,
    description:
      'Instagram-scoped recipient id required by server-owned reply delivery. Usernames are not accepted.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Recipient username',
    name: 'recipientUsername',
    isNullable: true,
    defaultValue: null,
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Recipient display name',
    name: 'recipientDisplayName',
    isNullable: true,
    defaultValue: null,
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Instagram account',
    name: 'instagramAccount',
    description: 'Connected Instagram account that owns this conversation.',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: RelationOnDeleteAction.SET_NULL,
      joinColumnName: 'instagramAccountId',
    },
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Creator',
    name: 'creator',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: RelationOnDeleteAction.SET_NULL,
      joinColumnName: 'creatorId',
    },
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Completed message sync at',
    name: 'completedMessageSyncAt',
    isNullable: true,
    defaultValue: null,
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Messages',
    name: 'messages',
    description: 'Messages in this conversation.',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.ONE_TO_MANY,
    },
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Reply drafts',
    name: 'replyDrafts',
    description: 'Reply drafts prepared for this conversation.',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.ONE_TO_MANY,
    },
  },
] as const;
const MYAH_SOCIAL_MESSAGE_FIELD_CONFIGS = [
  {
    type: FieldMetadataType.TEXT,
    label: 'Text',
    name: 'text',
    isNullable: true,
    defaultValue: null,
    description: 'Message text or a local note for media-only messages.',
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Direction',
    name: 'direction',
    defaultValue: `'${'OUTBOUND'}'`,
    options: [
      {
        id: '13d27078-c7bc-40b1-ae19-1ddbbfe15642',
        value: 'INBOUND',
        label: 'Inbound',
        position: 0,
        color: 'green',
      },
      {
        id: '34847dd8-c965-43b1-b979-572a0830b97f',
        value: 'OUTBOUND',
        label: 'Outbound',
        position: 1,
        color: 'blue',
      },
      {
        id: '9b7e22a4-21f8-4379-8b1f-549a0a802434',
        value: 'UNKNOWN',
        label: 'Unknown',
        position: 2,
        color: 'gray',
      },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Sent via',
    name: 'sentVia',
    defaultValue: `'${'MANUAL'}'`,
    options: [
      {
        id: 'a2df96c5-8d37-433b-995a-8b972b85a8aa',
        value: 'MANUAL',
        label: 'Manual',
        position: 0,
        color: 'gray',
      },
      {
        id: '958683e0-a74a-40c2-9e33-43a36a972b03',
        value: 'COMPOSIO',
        label: 'Composio',
        position: 1,
        color: 'purple',
      },
      {
        id: 'e2dc9bec-bf06-48aa-9add-a7a99f7d2917',
        value: 'UNKNOWN',
        label: 'Unknown',
        position: 2,
        color: 'orange',
      },
      {
        id: '6989ae94-6f41-4f00-af49-3aba0e4c2897',
        value: 'UNIPILE',
        label: 'Unipile',
        position: 3,
        color: 'blue',
      },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Provider',
    name: 'provider',
    defaultValue: `'${'COMPOSIO_HISTORY'}'`,
    options: [
      {
        id: 'e177ebaf-239f-4b44-aa9d-4f4358a1d244',
        value: 'COMPOSIO_HISTORY',
        label: 'Composio history',
        position: 0,
        color: 'purple',
      },
      {
        id: '8f616732-93b5-4a23-9f2a-bcb4d47931e4',
        value: 'UNIPILE',
        label: 'Unipile',
        position: 1,
        color: 'blue',
      },
    ],
  },
  {
    type: FieldMetadataType.BOOLEAN,
    label: 'Has attachments',
    name: 'hasAttachments',
    defaultValue: false,
  },
  {
    type: FieldMetadataType.NUMBER,
    label: 'Attachment count',
    name: 'attachmentCount',
    defaultValue: 0,
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Delivery state',
    name: 'deliveryState',
    defaultValue: `'${'UNKNOWN'}'`,
    options: [
      {
        id: 'ee88c704-acba-411b-9e61-8d953915e7d4',
        value: 'UNKNOWN',
        label: 'Unknown',
        position: 0,
        color: 'gray',
      },
      {
        id: 'cd27dfbc-7e8c-44a5-88fd-cd8eeceeab48',
        value: 'RECEIVED',
        label: 'Received',
        position: 1,
        color: 'green',
      },
      {
        id: '69d2a394-a90a-4be9-88e8-84acd3378d5e',
        value: 'SENT',
        label: 'Sent',
        position: 2,
        color: 'blue',
      },
      {
        id: 'ea556c36-fc36-4d54-917b-cf859a6f095e',
        value: 'DELIVERED',
        label: 'Delivered',
        position: 3,
        color: 'turquoise',
      },
      {
        id: 'bebfcc76-371c-40bb-8eec-64093cbd2eb0',
        value: 'READ',
        label: 'Read',
        position: 4,
        color: 'purple',
      },
    ],
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Delivery state updated at',
    name: 'deliveryStateUpdatedAt',
    isNullable: true,
    defaultValue: null,
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Provider message ID',
    name: 'providerMessageId',
    isNullable: true,
    defaultValue: null,
    description:
      'Instagram message id when known. Manual first-DM rows may not have one before reconciliation.',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Provider created at',
    name: 'providerCreatedAt',
    isNullable: true,
    defaultValue: null,
    description: 'Timestamp reported by Instagram for this message.',
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Conversation',
    name: 'conversation',
    description: 'Conversation containing this message.',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: RelationOnDeleteAction.SET_NULL,
      joinColumnName: 'conversationId',
    },
  },
] as const;
const MYAH_INSTAGRAM_REPLY_DRAFT_FIELD_CONFIGS = [
  {
    type: FieldMetadataType.TEXT,
    label: 'Title',
    name: 'title',
    description: 'Short label for the draft reply.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Body',
    name: 'body',
    description: 'Reply text to review before explicit send.',
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Kind',
    name: 'kind',
    defaultValue: `'${'REPLY'}'`,
    options: [
      {
        id: '391098f4-d2a7-4969-9352-9f24103dd12c',
        value: 'FIRST_MESSAGE',
        label: 'First message',
        position: 0,
        color: 'blue',
      },
      {
        id: '560e4db8-2875-432c-8131-f14cf59395df',
        value: 'REPLY',
        label: 'Reply',
        position: 1,
        color: 'gray',
      },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Status',
    name: 'status',
    defaultValue: `'${'DRAFT'}'`,
    options: [
      {
        id: 'f1d82de8-e995-4d97-a8f8-6ebdef1c049b',
        value: 'DRAFT',
        label: 'Draft',
        position: 0,
        color: 'gray',
      },
      {
        id: '3aa09d72-e11e-4c8a-b69f-f6ff0e270360',
        value: 'NEEDS_REVIEW',
        label: 'Needs review',
        position: 1,
        color: 'orange',
      },
      {
        id: '8e46a2b5-fcdb-4ead-9dd5-0c1f31649cd5',
        value: 'APPROVED',
        label: 'Approved',
        position: 2,
        color: 'green',
      },
      {
        id: '704cbe46-2eb2-4cc3-a5fd-ac6367e1b0c4',
        value: 'SENT',
        label: 'Sent',
        position: 3,
        color: 'blue',
      },
      {
        id: '85188535-fc9b-4635-9ce0-2ba1a03b612d',
        value: 'DISCARDED',
        label: 'Discarded',
        position: 4,
        color: 'red',
      },
    ],
  },
  {
    type: FieldMetadataType.SELECT,
    label: 'Source',
    name: 'source',
    defaultValue: `'${'MANUAL'}'`,
    options: [
      {
        id: '1d31a9c0-5040-4d07-81d2-e5e3a6714328',
        value: 'MANUAL',
        label: 'Manual',
        position: 0,
        color: 'gray',
      },
      {
        id: '3718ac3b-5d92-4ef9-98bb-f27ff00f77c6',
        value: 'AI',
        label: 'AI',
        position: 1,
        color: 'purple',
      },
      {
        id: '43d1780f-28c5-4323-8211-134d745bac58',
        value: 'TEMPLATE',
        label: 'Template',
        position: 2,
        color: 'blue',
      },
    ],
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Inbound message record ID',
    name: 'inboundMessageRecordId',
    isNullable: true,
    defaultValue: null,
    description: 'Exact local inbound message evidence for this reply draft.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Inbound provider message ID',
    name: 'inboundProviderMessageId',
    isNullable: true,
    defaultValue: null,
    description: 'Exact Instagram inbound message ID for this reply draft.',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Generated at',
    name: 'generatedAt',
    isNullable: true,
    defaultValue: null,
    description: 'When AI or a template generated this draft.',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Approved at',
    name: 'approvedAt',
    isNullable: true,
    defaultValue: null,
    description: 'When a human approved this draft for a future explicit send.',
  },
  {
    type: FieldMetadataType.DATE_TIME,
    label: 'Sent at',
    name: 'sentAt',
    isNullable: true,
    defaultValue: null,
    description: 'When the approved draft was explicitly sent.',
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Send blocked reason',
    name: 'sendBlockedReason',
    isNullable: true,
    defaultValue: null,
    description:
      'Reason a draft cannot be sent, such as a closed Instagram reply window.',
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Creator',
    name: 'creator',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: RelationOnDeleteAction.SET_NULL,
      joinColumnName: 'creatorId',
    },
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Recipient username',
    name: 'recipientUsername',
    isNullable: true,
    defaultValue: null,
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Recipient provider ID',
    name: 'recipientProviderId',
    isNullable: true,
    defaultValue: null,
  },
  {
    type: FieldMetadataType.NUMBER,
    label: 'Revision',
    name: 'revision',
    defaultValue: 1,
  },
  {
    type: FieldMetadataType.TEXT,
    label: 'Composer input digest',
    name: 'composerInputDigest',
    isNullable: true,
    isUIEditable: false,
    defaultValue: null,
    description:
      'Server-owned immutable digest for a verified Instagram composer attempt.',
  },
  {
    type: FieldMetadataType.RAW_JSON,
    label: 'Instagram message snapshot',
    name: 'instagramMessageSnapshot',
    isNullable: true,
    isUIEditable: false,
    defaultValue: null,
    description:
      'Server-owned immutable identity snapshot for a verified Instagram composer attempt.',
  },
  {
    type: FieldMetadataType.RELATION,
    label: 'Conversation',
    name: 'conversation',
    description: 'Conversation this draft replies to.',
    isNullable: true,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: RelationOnDeleteAction.SET_NULL,
      joinColumnName: 'conversationId',
    },
  },
] as const;

const MYAH_INSTAGRAM_RELATION_TARGETS: Record<
  string,
  readonly [MyahStandardObjectName, string]
> = {
  'myahInstagramAccount.conversations': [
    'myahSocialConversation',
    'instagramAccount',
  ],
  'myahSocialConversation.instagramAccount': [
    'myahInstagramAccount',
    'conversations',
  ],
  'myahSocialConversation.creator': ['creator', 'instagramConversations'],
  'myahSocialConversation.messages': ['myahSocialMessage', 'conversation'],
  'myahSocialConversation.replyDrafts': [
    'myahInstagramReplyDraft',
    'conversation',
  ],
  'myahSocialMessage.conversation': ['myahSocialConversation', 'messages'],
  'myahInstagramReplyDraft.creator': ['creator', 'instagramMessageDrafts'],
  'myahInstagramReplyDraft.conversation': [
    'myahSocialConversation',
    'replyDrafts',
  ],
};

const buildMyahInstagramBaseSystemFields = (args: Args) => ({
  ...buildMyahBaseSystemFields(args),
  name: createMyahStandardFieldFlatMetadata({
    ...args,
    context: {
      fieldName: 'name',
      type: FieldMetadataType.TEXT,
      label: 'Name',
      description: 'Name',
      icon: 'IconAbc',
      isNullable: true,
    },
  }),
});

const buildMyahInstagramStandardFlatFieldMetadatas = ({
  objectName,
  ...args
}: Args) => {
  const configsByObject = {
    myahInstagramAccount: MYAH_INSTAGRAM_ACCOUNT_FIELD_CONFIGS,
    myahSocialConversation: MYAH_SOCIAL_CONVERSATION_FIELD_CONFIGS,
    myahSocialMessage: MYAH_SOCIAL_MESSAGE_FIELD_CONFIGS,
    myahInstagramReplyDraft: MYAH_INSTAGRAM_REPLY_DRAFT_FIELD_CONFIGS,
  } as const;
  const configs = configsByObject[objectName as keyof typeof configsByObject];
  const fields = Object.fromEntries(
    configs.map((raw) => {
      const field = raw as MyahInstagramFieldConfig;
      const relationTarget =
        MYAH_INSTAGRAM_RELATION_TARGETS[`${objectName}.${field.name}`];
      const flatField = createMyahStandardFieldFlatMetadata({
        ...args,
        objectName,
        context: {
          fieldName: field.name as never,
          type: field.type,
          label: field.label,
          description: field.description ?? field.label,
          icon: field.icon ?? 'Icon123',
          isNullable: field.isNullable,
          isUnique: field.isUnique,
          isUIEditable: field.isUIEditable,
          defaultValue: field.defaultValue as never,
          options: field.options as never,
          settings: field.universalSettings as never,
        },
      });
      if (!relationTarget) return [field.name, flatField];
      const [targetObjectName, targetFieldName] = relationTarget;
      return [
        field.name,
        {
          ...flatField,
          relationTargetObjectMetadataId:
            args.standardObjectMetadataRelatedEntityIds[targetObjectName].id,
          relationTargetFieldMetadataId: (
            args.standardObjectMetadataRelatedEntityIds[targetObjectName]
              .fields as Record<string, { id: string }>
          )[targetFieldName].id,
          relationTargetObjectMetadataUniversalIdentifier:
            MYAH_STANDARD_OBJECTS[targetObjectName].universalIdentifier,
          relationTargetFieldMetadataUniversalIdentifier: (
            MYAH_STANDARD_OBJECTS[targetObjectName].fields as Record<
              string,
              { universalIdentifier: string }
            >
          )[targetFieldName].universalIdentifier,
        },
      ];
    }),
  );
  return {
    ...buildMyahInstagramBaseSystemFields({ objectName, ...args }),
    ...fields,
  } as Record<string, FlatFieldMetadata>;
};

export const buildMyahInstagramAccountStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'myahInstagramAccount',
    context: {
      universalIdentifier: '2d357469-831a-4629-ad4b-47335900e883',
      nameSingular: 'myahInstagramAccount',
      namePlural: 'myahInstagramAccounts',
      labelSingular: 'Myah Instagram account',
      labelPlural: 'Myah Instagram accounts',
      description:
        'Workspace Instagram account metadata retained for server-managed messaging.',
      icon: 'IconBrandInstagram',
      labelIdentifierFieldMetadataName: 'label',
    },
  });
export const buildMyahSocialConversationStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'myahSocialConversation',
    context: {
      universalIdentifier: '36817464-855f-42db-9fbb-f8853643f8d6',
      nameSingular: 'myahSocialConversation',
      namePlural: 'myahSocialConversations',
      labelSingular: 'Myah social conversation',
      labelPlural: 'Myah social conversations',
      description:
        'Instagram DM conversation metadata retained for historical display and server-managed messaging.',
      icon: 'IconMessages',
      labelIdentifierFieldMetadataName: 'label',
    },
  });
export const buildMyahSocialMessageStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'myahSocialMessage',
    context: {
      universalIdentifier: '7241bd44-e474-4904-8636-339276b3feff',
      nameSingular: 'myahSocialMessage',
      namePlural: 'myahSocialMessages',
      labelSingular: 'Myah social message',
      labelPlural: 'Myah social messages',
      description:
        'Persisted Instagram DM message or manual first-DM touchpoint retained for server-managed messaging.',
      icon: 'IconMessage',
      labelIdentifierFieldMetadataName: 'text',
    },
  });
export const buildMyahInstagramReplyDraftStandardFlatObjectMetadata = (
  args: ObjectArgs,
): FlatObjectMetadata =>
  createStandardObjectFlatMetadata({
    ...args,
    objectName: 'myahInstagramReplyDraft',
    context: {
      universalIdentifier: '85762d24-541b-407f-9d6a-cdf89552c665',
      nameSingular: 'myahInstagramReplyDraft',
      namePlural: 'myahInstagramReplyDrafts',
      labelSingular: 'Myah Instagram message draft',
      labelPlural: 'Myah Instagram message drafts',
      description:
        'Instagram message draft awaiting human review. Approval never auto-sends; a separate explicit send action is required.',
      icon: 'IconMessagePlus',
      isUIEditable: false,
      isUICreatable: false,
      labelIdentifierFieldMetadataName: 'title',
    },
  });
