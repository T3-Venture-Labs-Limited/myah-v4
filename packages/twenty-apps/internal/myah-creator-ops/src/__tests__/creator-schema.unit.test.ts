import { describe, expect, it } from 'vitest';
import {
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';
import {
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_METRICS_VIEW_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
  PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
  QUALIFIED_CREATORS_WITH_EMAIL_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

import creatorObjectResult from 'src/objects/creator.object';
import ownedCreatorsOnWorkspaceMemberResult from 'src/fields/owned-creators-on-workspace-member.field';
import defaultRoleResult from 'src/default-role';
import creatorMetricsViewResult from 'src/views/creator-metrics.view';
import creatorsViewResult from 'src/views/creators.view';
import qualifiedCreatorsWithEmailViewResult from 'src/views/qualified-creators-with-email.view';

const unwrapValidationResult = <T>(result: {
  success: boolean;
  config: T;
  errors: string[];
}): T => {
  if (result.success === false) {
    throw new Error(result.errors.join(', '));
  }

  return result.config;
};

const creatorObject = unwrapValidationResult(creatorObjectResult);
const defaultRole = unwrapValidationResult(defaultRoleResult);
const ownedCreatorsOnWorkspaceMember = unwrapValidationResult(
  ownedCreatorsOnWorkspaceMemberResult,
);
const creatorMetricsView = unwrapValidationResult(creatorMetricsViewResult);
const creatorsView = unwrapValidationResult(creatorsViewResult);
const qualifiedCreatorsWithEmailView = unwrapValidationResult(
  qualifiedCreatorsWithEmailViewResult,
);

const expectedFieldNames = [
  'name',
  'email',
  'phone',
  'location',
  'gender',
  'language',
  'profileType',
  'creatorStatus',
  'source',
  'sourceUrl',
  'importSource',
  'lastImportedAt',
  'hasLinkInBio',
  'hasBrandDeals',
  'promotesAffiliateLinks',
  'hasMerch',
  'linksInBio',
  'externalUrls',
  'hashtagsUsed',
  'categories',
  'niches',
  'notes',
  'instagramLink',
  'instagramUsername',
  'instagramBio',
  'instagramFollowerCount',
  'instagramEngagementPercent',
  'instagramMostRecentPostDate',
  'instagramMediaCount',
  'instagramAvgLikes',
  'instagramAvgComments',
  'instagramReelsPercent',
  'instagramReelsAvgViewCount',
  'instagramPostingFrequencyRecentMonths',
  'instagramEstimatedIncomeMin',
  'instagramEstimatedIncomeMax',
  'tiktokLink',
  'tiktokUsername',
  'tiktokBio',
  'tiktokFollowerCount',
  'tiktokMostRecentPostDate',
  'tiktokEngagementPercent',
  'tiktokVideoCount',
  'tiktokPlayCountMedian',
  'tiktokAvgLikes',
  'tiktokAvgComments',
  'tiktokAvgDownloads',
  'tiktokPostingFrequencyRecentMonths',
  'youtubeLink',
  'youtubeCustomUrl',
  'youtubeTitle',
  'youtubeDescription',
  'youtubeTopicDetails',
  'youtubeSubscriberCount',
  'youtubeLastUploadDate',
  'youtubeLastStreamUploadDate',
  'youtubeShortsPercentage',
  'youtubeVideoCount',
  'youtubeEngagementPercent',
  'youtubeAvgViewsLong',
  'youtubeAvgViewsShorts',
  'youtubeAvgStreamViews',
  'youtubeAvgStreamDuration',
  'youtubePostingFrequencyRecentMonths',
  'youtubeEstimatedIncomeMin',
  'youtubeEstimatedIncomeMax',
  'twitterLink',
  'twitterUsername',
  'twitterBio',
  'twitterFollowerCount',
  'twitterEngagementPercent',
  'twitchUrl',
  'twitchUsername',
  'twitchDisplayName',
  'twitchTotalFollowers',
  'patreonUrl',
] as const;

const expectedTypeByFieldName: Partial<Record<string, FieldType>> = {
  profileType: FieldType.SELECT,
  gender: FieldType.SELECT,
  instagramLink: FieldType.LINKS,
  tiktokLink: FieldType.LINKS,
  youtubeLink: FieldType.LINKS,
  twitterLink: FieldType.LINKS,
  creatorStatus: FieldType.SELECT,
  lastImportedAt: FieldType.DATE_TIME,
  hasLinkInBio: FieldType.BOOLEAN,
  hasBrandDeals: FieldType.BOOLEAN,
  promotesAffiliateLinks: FieldType.BOOLEAN,
  hasMerch: FieldType.BOOLEAN,
  instagramMostRecentPostDate: FieldType.DATE,
  tiktokMostRecentPostDate: FieldType.DATE,
  youtubeLastUploadDate: FieldType.DATE,
  youtubeLastStreamUploadDate: FieldType.DATE,
};

const numberFieldNames = [
  'instagramFollowerCount',
  'instagramEngagementPercent',
  'instagramMediaCount',
  'instagramAvgLikes',
  'instagramAvgComments',
  'instagramReelsPercent',
  'instagramReelsAvgViewCount',
  'instagramPostingFrequencyRecentMonths',
  'instagramEstimatedIncomeMin',
  'instagramEstimatedIncomeMax',
  'tiktokFollowerCount',
  'tiktokEngagementPercent',
  'tiktokVideoCount',
  'tiktokPlayCountMedian',
  'tiktokAvgLikes',
  'tiktokAvgComments',
  'tiktokAvgDownloads',
  'tiktokPostingFrequencyRecentMonths',
  'youtubeSubscriberCount',
  'youtubeShortsPercentage',
  'youtubeVideoCount',
  'youtubeEngagementPercent',
  'youtubeAvgViewsLong',
  'youtubeAvgViewsShorts',
  'youtubeAvgStreamViews',
  'youtubeAvgStreamDuration',
  'youtubePostingFrequencyRecentMonths',
  'youtubeEstimatedIncomeMin',
  'youtubeEstimatedIncomeMax',
  'twitterFollowerCount',
  'twitterEngagementPercent',
  'twitchTotalFollowers',
];

describe('Creator object schema', () => {
  it('should expose wide import fields directly on Creator', () => {
    expect(creatorObject.nameSingular).toBe('creator');
    expect(creatorObject.namePlural).toBe('creators');

    for (const fieldName of expectedFieldNames) {
      expect(
        creatorObject.fields.some((field) => field.name === fieldName),
      ).toBe(true);
    }
  });

  it('should use import-friendly field types', () => {
    for (const [fieldName, expectedType] of Object.entries(
      expectedTypeByFieldName,
    )) {
      expect(
        creatorObject.fields.find((field) => field.name === fieldName)?.type,
      ).toBe(expectedType);
    }

    for (const fieldName of numberFieldNames) {
      expect(
        creatorObject.fields.find((field) => field.name === fieldName)?.type,
      ).toBe(FieldType.NUMBER);
    }
  });

  it('uses the rollout metadata identifiers pinned by MYAH-231', () => {
    expect(CREATOR_FIELD_UNIVERSAL_IDENTIFIERS).toMatchObject({
      gender: '14a9ada5-6439-4ea8-8557-e6a2ca815330',
      instagramLink: 'f0d18169-7558-487c-bafd-eb0e6adaf63a',
      tiktokLink: '184b0e66-11d9-45bd-8dde-e694355c57f1',
      youtubeLink: 'dcb35d52-cad9-4871-8ae2-8e97e38578f1',
      twitterLink: '8bb2d28c-cecf-4111-b043-89b6c7255710',
    });
    expect(CREATOR_METRICS_VIEW_UNIVERSAL_IDENTIFIER).toBe(
      'd1758d79-a3e7-48e7-b960-2103a7a3be19',
    );
    expect(CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS).toMatchObject({
      gender: '32b1c350-f11e-4118-8d22-531a631b4147',
      phone: '9d5a2863-7216-4889-a6ee-91aacbf7158f',
      instagramLink: '99404764-56ea-4f25-bea5-fb746c77c97b',
      tiktokLink: '4f4a0263-7e5f-4f5e-826d-d642ae5197af',
      youtubeLink: '6f715c13-46b7-4939-8ec7-9b41259ac3de',
      twitterLink: 'c6b9840c-7684-4889-9f24-3592febefe57',
    });
    expect(
      QUALIFIED_CREATORS_WITH_EMAIL_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramLink,
    ).toBe('c9178a1f-2c30-4ab2-aa6c-a208223d1250');
    expect(CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS).toEqual({
      name: '721888aa-6983-4c7f-8593-60afdf75a088',
      instagramFollowerCount: 'e957624d-df26-4d29-9f84-9d53149924e3',
      instagramEngagementPercent: '122472c1-39f1-49e9-9309-7053cf91f80d',
      tiktokFollowerCount: '8dee3cc3-373a-4dd1-937e-3cf2ff15acee',
      tiktokEngagementPercent: '7fa03bfe-0ab3-4979-a7ec-5c7a4e4acecd',
      tiktokPlayCountMedian: 'c7c4b4fb-a3e3-49ca-92f8-877350668c6c',
      youtubeSubscriberCount: '0923a836-29f9-4d9f-9c1b-978af2bee1f9',
      youtubeEngagementPercent: 'bd10a7d9-acdd-415e-b172-af6a88b4d04e',
      youtubeAvgViewsLong: 'd0ccee20-d308-45b5-b6f5-de04b33bdbb7',
      hasBrandDeals: '84ebcf92-7c3f-423f-af6d-062216402fa6',
      promotesAffiliateLinks: '45ba4f40-035e-49fa-bc9e-26540d8298c3',
      source: '82e70d56-2b81-4311-bcc4-b68d1182d19c',
    });
    expect(
      creatorObject.fields.find((field) => field.name === 'gender')?.options,
    ).toEqual([
      expect.objectContaining({ id: '08c80e6b-3bb8-480d-a96f-ab5200289ad2' }),
      expect.objectContaining({ id: '8d5af3fe-88b9-4204-947e-048b1845cdf0' }),
      expect.objectContaining({ id: '5afa8fb4-f3f6-4ab0-8dbd-18989c280c38' }),
      expect.objectContaining({ id: 'ac6e6123-7cbe-41a6-bfd1-5ab5fe7a3df1' }),
      expect.objectContaining({ id: '00277c36-b012-4fea-b50a-fbf54c209f24' }),
    ]);
  });

  it('should define nullable editable Gender options and only native social links', () => {
    expect(
      creatorObject.fields.find((field) => field.name === 'gender'),
    ).toMatchObject({
      type: FieldType.SELECT,
      isNullable: true,
      isUIEditable: true,
      options: [
        expect.objectContaining({ label: 'Female', value: 'FEMALE' }),
        expect.objectContaining({ label: 'Male', value: 'MALE' }),
        expect.objectContaining({ label: 'Non-binary', value: 'NON_BINARY' }),
        expect.objectContaining({ label: 'Other', value: 'OTHER' }),
        expect.objectContaining({ label: 'Unknown', value: 'UNKNOWN' }),
      ],
    });

    for (const fieldName of [
      'instagramLink',
      'tiktokLink',
      'youtubeLink',
      'twitterLink',
    ]) {
      expect(
        creatorObject.fields.find((field) => field.name === fieldName),
      ).toMatchObject({
        type: FieldType.LINKS,
        isNullable: true,
      });
    }

    for (const fieldName of [
      'instagramUrl',
      'tiktokUrl',
      'youtubeUrl',
      'twitterUrl',
    ]) {
      expect(
        creatorObject.fields.some((field) => field.name === fieldName),
      ).toBe(false);
    }
  });

  it('keeps default Creator views focused and free of obsolete social URL fields', () => {
    expect(
      creatorsView.fields.map(
        (field) => field.fieldMetadataUniversalIdentifier,
      ),
    ).toEqual([
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.email,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.gender,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.location,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.phone,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokLink,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramLink,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeLink,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.twitterLink,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
    ]);

    expect(
      creatorMetricsView.fields.map(
        (field) => field.fieldMetadataUniversalIdentifier,
      ),
    ).toEqual([
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramEngagementPercent,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokEngagementPercent,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokPlayCountMedian,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeEngagementPercent,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeAvgViewsLong,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.hasBrandDeals,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.promotesAffiliateLinks,
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
    ]);

    expect(
      qualifiedCreatorsWithEmailView.fields.map(
        (field) => field.fieldMetadataUniversalIdentifier,
      ),
    ).toContain(CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramLink);
  });

  it('relates optional Creator owners to WorkspaceMembers', () => {
    expect(
      creatorObject.fields.find((field) => field.name === 'owner'),
    ).toMatchObject({
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
          .universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.ownedCreators,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'ownerId',
      },
    });
    expect(ownedCreatorsOnWorkspaceMember).toMatchObject({
      type: FieldType.RELATION,
      isNullable: true,
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
          .universalIdentifier,
      relationTargetObjectMetadataUniversalIdentifier:
        CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.owner,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    });
  });

  it('scopes the default role and protects all creator identity fields', () => {
    expect(defaultRole.canReadAllObjectRecords).toBe(false);
    expect(defaultRole.canUpdateAllObjectRecords).toBe(false);
    expect(defaultRole.canSoftDeleteAllObjectRecords).toBe(false);
    const expectedObjectIds = [
      CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
      CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
      CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
      CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
      OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
      OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
      OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
      OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
    ];
    expect(defaultRole.objectPermissions).toHaveLength(
      expectedObjectIds.length,
    );
    expect(
      defaultRole.objectPermissions?.map(
        (permission) => permission.objectUniversalIdentifier,
      ),
    ).toEqual(expect.arrayContaining(expectedObjectIds));
    expect(
      new Set(
        defaultRole.objectPermissions?.map(
          (permission) => permission.objectUniversalIdentifier,
        ),
      ),
    ).toEqual(new Set(expectedObjectIds));
    for (const permission of defaultRole.objectPermissions ?? []) {
      expect(permission).toMatchObject({
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: true,
        canDestroyObjectRecords: false,
      });
    }
    expect(defaultRole.objectPermissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectUniversalIdentifier: creatorObject.universalIdentifier,
          canReadObjectRecords: true,
          canUpdateObjectRecords: true,
          canSoftDeleteObjectRecords: true,
          canDestroyObjectRecords: false,
        }),
      ]),
    );

    const protectedFieldNames = [
      'email',
      'phone',
      'instagramLink',
      'instagramUsername',
      'instagramBio',
      'tiktokLink',
      'tiktokUsername',
      'tiktokBio',
      'youtubeLink',
      'youtubeCustomUrl',
      'youtubeTitle',
      'youtubeDescription',
      'twitterLink',
      'twitterUsername',
      'twitterBio',
      'twitchUrl',
      'twitchUsername',
      'twitchDisplayName',
      'patreonUrl',
    ];
    const permissionsById = new Map(
      (defaultRole.fieldPermissions ?? []).map((permission) => [
        permission.fieldUniversalIdentifier,
        permission,
      ]),
    );

    for (const fieldName of protectedFieldNames) {
      const field = creatorObject.fields.find(
        (candidate) => candidate.name === fieldName,
      );
      expect(field).toBeDefined();
      expect(permissionsById.get(field?.universalIdentifier)).toMatchObject({
        canReadFieldValue: false,
        canUpdateFieldValue: false,
      });
    }
  });
});
