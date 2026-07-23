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
  CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
  PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

import creatorObjectResult from 'src/objects/creator.object';
import ownedCreatorsOnWorkspaceMemberResult from 'src/fields/owned-creators-on-workspace-member.field';
import defaultRoleResult from 'src/default-role';

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

const expectedFieldNames = [
  'name',
  'email',
  'phone',
  'location',
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
  'instagramUrl',
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
  'tiktokUrl',
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
  'youtubeUrl',
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
  'twitterUrl',
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

  it('relates optional Creator owners to WorkspaceMembers', () => {
    expect(
      creatorObject.fields.find((field) => field.name === 'owner'),
    ).toMatchObject({
      type: FieldType.RELATION,
      isNullable: true,
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
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
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
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
    expect(defaultRole.objectPermissions).toHaveLength(expectedObjectIds.length);
    expect(defaultRole.objectPermissions?.map(
      (permission) => permission.objectUniversalIdentifier,
    )).toEqual(expect.arrayContaining(expectedObjectIds));
    expect(new Set(
      defaultRole.objectPermissions?.map(
        (permission) => permission.objectUniversalIdentifier,
      ),
    )).toEqual(new Set(expectedObjectIds));
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
      'instagramUrl',
      'instagramUsername',
      'instagramBio',
      'tiktokUrl',
      'tiktokUsername',
      'tiktokBio',
      'youtubeUrl',
      'youtubeCustomUrl',
      'youtubeTitle',
      'youtubeDescription',
      'twitterUrl',
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
      const field = creatorObject.fields.find((candidate) => candidate.name === fieldName);
      expect(field).toBeDefined();
      expect(permissionsById.get(field?.universalIdentifier)).toMatchObject({
        canReadFieldValue: false,
        canUpdateFieldValue: false,
      });
    }
  });
});
