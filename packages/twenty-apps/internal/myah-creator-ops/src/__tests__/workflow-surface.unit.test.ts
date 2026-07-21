import { describe, expect, it } from 'vitest';
import {
  FieldType,
  NavigationMenuItemType,
  ViewFilterOperand,
  ViewType,
} from 'twenty-sdk/define';

import * as universalIdentifiers from 'src/constants/universal-identifiers';
import campaignObjectResult from 'src/objects/campaign.object';
import campaignCreatorObjectResult from 'src/objects/campaign-creator.object';
import creatorListObjectResult from 'src/objects/creator-list.object';
import creatorListMemberObjectResult from 'src/objects/creator-list-member.object';
import offerObjectResult from 'src/objects/offer.object';
import outreachActionObjectResult from 'src/objects/outreach-action.object';
import outreachSequenceObjectResult from 'src/objects/outreach-sequence.object';
import outreachStepObjectResult from 'src/objects/outreach-step.object';
import promotedAssetObjectResult from 'src/objects/promoted-asset.object';
import campaignsViewResult from 'src/views/campaigns.view';
import creatorListsViewResult from 'src/views/creator-lists.view';
import creatorsViewResult from 'src/views/creators.view';
import qualifiedCreatorsWithEmailViewResult from 'src/views/qualified-creators-with-email.view';
import campaignsNavigationMenuItemResult from 'src/navigation-menu-items/campaigns.navigation-menu-item';
import creatorListsNavigationMenuItemResult from 'src/navigation-menu-items/creator-lists.navigation-menu-item';
import creatorsNavigationMenuItemResult from 'src/navigation-menu-items/creators.navigation-menu-item';

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

const campaignObject = unwrapValidationResult(campaignObjectResult);
const campaignCreatorObject = unwrapValidationResult(campaignCreatorObjectResult);
const creatorListObject = unwrapValidationResult(creatorListObjectResult);
const creatorListMemberObject = unwrapValidationResult(
  creatorListMemberObjectResult,
);
const offerObject = unwrapValidationResult(offerObjectResult);
const outreachActionObject = unwrapValidationResult(outreachActionObjectResult);
const outreachSequenceObject = unwrapValidationResult(
  outreachSequenceObjectResult,
);
const outreachStepObject = unwrapValidationResult(outreachStepObjectResult);
const promotedAssetObject = unwrapValidationResult(promotedAssetObjectResult);
const campaignsView = unwrapValidationResult(campaignsViewResult);
const creatorListsView = unwrapValidationResult(creatorListsViewResult);
const creatorsView = unwrapValidationResult(creatorsViewResult);
const qualifiedCreatorsWithEmailView = unwrapValidationResult(
  qualifiedCreatorsWithEmailViewResult,
);
const campaignsNavigationMenuItem = unwrapValidationResult(
  campaignsNavigationMenuItemResult,
);
const creatorListsNavigationMenuItem = unwrapValidationResult(
  creatorListsNavigationMenuItemResult,
);
const creatorsNavigationMenuItem = unwrapValidationResult(
  creatorsNavigationMenuItemResult,
);

const getFieldNames = (objectDefinition: {
  fields: { name: string }[];
}): string[] =>
  objectDefinition.fields.map((fieldDefinition) => fieldDefinition.name);

const getField = (
  objectDefinition: { fields: { name: string; type: FieldType }[] },
  fieldName: string,
) => objectDefinition.fields.find((fieldDefinition) => fieldDefinition.name === fieldName);

const getVisibleFieldUniversalIdentifiers = (viewDefinition: {
  fields: {
    fieldMetadataUniversalIdentifier: string;
    isVisible: boolean;
  }[];
}): string[] =>
  viewDefinition.fields
    .filter((fieldDefinition) => fieldDefinition.isVisible === true)
    .map((fieldDefinition) => fieldDefinition.fieldMetadataUniversalIdentifier);

describe('Creator Ops workflow object schema', () => {
  it('should define workflow objects for the v0 operator surface', () => {
    expect(getFieldNames(creatorListObject)).toEqual([
      'name',
      'source',
      'description',
      'members',
    ]);
    expect(getFieldNames(creatorListMemberObject)).toEqual([
      'name',
      'creator',
      'creatorList',
      'source',
      'notes',
    ]);
    expect(getFieldNames(campaignObject)).toEqual([
      'name',
      'status',
      'objective',
      'targetPlatforms',
      'targetDemographics',
      'icpGoal',
      'budgetNotes',
      'campaignCreators',
      'offers',
      'outreachSequences',
    ]);
    expect(getFieldNames(campaignCreatorObject)).toEqual([
      'name',
      'creator',
      'campaign',
      'stage',
      'selectedContactMethod',
      'nextActionAt',
      'selectionReason',
      'dealSummary',
      'outcomeSummary',
      'outreachActions',
    ]);
    expect(getFieldNames(promotedAssetObject)).toEqual([
      'name',
      'assetType',
      'url',
      'description',
      'offers',
    ]);
    expect(getFieldNames(offerObject)).toEqual([
      'name',
      'campaign',
      'promotedAsset',
      'termsSummary',
      'commissionRate',
      'fixedFee',
      'cpaAmount',
      'giftedProductNotes',
      'usageRightsNotes',
    ]);
    expect(getFieldNames(outreachSequenceObject)).toEqual([
      'name',
      'campaign',
      'status',
      'description',
      'steps',
    ]);
    expect(getFieldNames(outreachStepObject)).toEqual([
      'name',
      'outreachSequence',
      'stepPosition',
      'trigger',
      'channel',
      'delayDays',
      'templateSummary',
      'actions',
    ]);
    expect(getFieldNames(outreachActionObject)).toEqual([
      'name',
      'campaignCreator',
      'outreachStep',
      'channel',
      'status',
      'scheduledAt',
      'completedAt',
      'resultSummary',
    ]);
  });

  it('should use relation fields for workflow joins', () => {
    const relationFields = [
      [creatorListObject, 'members'],
      [creatorListMemberObject, 'creator'],
      [creatorListMemberObject, 'creatorList'],
      [campaignObject, 'campaignCreators'],
      [campaignObject, 'offers'],
      [campaignObject, 'outreachSequences'],
      [campaignCreatorObject, 'creator'],
      [campaignCreatorObject, 'campaign'],
      [campaignCreatorObject, 'outreachActions'],
      [promotedAssetObject, 'offers'],
      [offerObject, 'campaign'],
      [offerObject, 'promotedAsset'],
      [outreachSequenceObject, 'campaign'],
      [outreachSequenceObject, 'steps'],
      [outreachStepObject, 'outreachSequence'],
      [outreachStepObject, 'actions'],
      [outreachActionObject, 'campaignCreator'],
      [outreachActionObject, 'outreachStep'],
    ] as const;

    for (const [objectDefinition, fieldName] of relationFields) {
      expect(getField(objectDefinition, fieldName)?.type).toBe(
        FieldType.RELATION,
      );
    }

    expect(getFieldNames(creatorListMemberObject)).not.toContain('creatorName');
    expect(getFieldNames(creatorListMemberObject)).not.toContain('listName');
    expect(getFieldNames(campaignCreatorObject)).not.toContain('campaignName');
    expect(getFieldNames(offerObject)).not.toContain('promotedAssetName');
  });
});

describe('Creator Ops operator views', () => {
  it('should expose qualification-focused Creator tables', () => {
    expect(creatorsView.universalIdentifier).toBe(
      universalIdentifiers.CREATORS_VIEW_UNIVERSAL_IDENTIFIER,
    );
    expect(qualifiedCreatorsWithEmailView.universalIdentifier).toBe(
      universalIdentifiers.QUALIFIED_CREATORS_WITH_EMAIL_VIEW_UNIVERSAL_IDENTIFIER,
    );

    for (const creatorView of [
      creatorsView,
      qualifiedCreatorsWithEmailView,
    ]) {
      expect(creatorView.type).toBe(ViewType.TABLE);
      expect(creatorView.objectUniversalIdentifier).toBe(
        universalIdentifiers.CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      );
      expect(getVisibleFieldUniversalIdentifiers(creatorView)).toEqual([
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.owner,
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.email,
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramUsername,
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
        universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
      ]);
    }

    expect(qualifiedCreatorsWithEmailView.filters).toEqual([
      expect.objectContaining({
        fieldMetadataUniversalIdentifier:
          universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
        operand: ViewFilterOperand.IS,
        value: ['QUALIFIED'],
      }),
      expect.objectContaining({
        fieldMetadataUniversalIdentifier:
          universalIdentifiers.CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.email,
        operand: ViewFilterOperand.IS_NOT_EMPTY,
        value: [],
      }),
    ]);
  });

  it('should expose campaign planning fields in the Campaigns table', () => {
    expect(campaignsView.type).toBe(ViewType.TABLE);
    expect(campaignsView.objectUniversalIdentifier).toBe(
      universalIdentifiers.CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
    );

    expect(getVisibleFieldUniversalIdentifiers(campaignsView)).toEqual([
      universalIdentifiers.CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.name,
      universalIdentifiers.CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.status,
      universalIdentifiers.CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.objective,
      universalIdentifiers.CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.targetPlatforms,
      universalIdentifiers.CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS.icpGoal,
    ]);
  });

  it('should expose source and description fields in the Creator Lists table', () => {
    expect(creatorListsView.type).toBe(ViewType.TABLE);
    expect(creatorListsView.objectUniversalIdentifier).toBe(
      universalIdentifiers.CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
    );

    expect(getVisibleFieldUniversalIdentifiers(creatorListsView)).toEqual([
      universalIdentifiers.CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.name,
      universalIdentifiers.CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.source,
      universalIdentifiers.CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS.description,
    ]);
  });
});

describe('Creator Ops navigation menu', () => {
  it('should expose only the v0 operator nav entries', () => {
    const navigationItems = [
      creatorsNavigationMenuItem,
      creatorListsNavigationMenuItem,
      campaignsNavigationMenuItem,
    ];

    expect(navigationItems).toHaveLength(3);
    expect(
      navigationItems.map((navigationItem) => navigationItem.type),
    ).toEqual([
      NavigationMenuItemType.VIEW,
      NavigationMenuItemType.VIEW,
      NavigationMenuItemType.VIEW,
    ]);
    expect(
      navigationItems.map(
        (navigationItem) => navigationItem.viewUniversalIdentifier,
      ),
    ).toEqual([
      universalIdentifiers.CREATORS_VIEW_UNIVERSAL_IDENTIFIER,
      universalIdentifiers.CREATOR_LISTS_VIEW_UNIVERSAL_IDENTIFIER,
      universalIdentifiers.CAMPAIGNS_VIEW_UNIVERSAL_IDENTIFIER,
    ]);
  });

  it('should not expose SocialProfile as a v0 app surface', () => {
    const exportedIdentifierNames = Object.keys(universalIdentifiers).join(' ');

    expect(exportedIdentifierNames).not.toContain('SocialProfile');
    expect(exportedIdentifierNames).not.toContain('SOCIAL_PROFILE');
  });
});
