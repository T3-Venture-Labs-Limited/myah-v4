import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import { type AllStandardObjectName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-name.type';
import { type AllStandardObjectViewName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-name.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
  type CreateStandardViewFieldOptions,
} from './create-standard-view-field-flat-metadata.util';

type Args = Omit<CreateStandardViewFieldArgs, 'context'>;
type Spec<
  O extends AllStandardObjectName,
  V extends AllStandardObjectViewName<O>,
> = CreateStandardViewFieldOptions<O, V>;

const buildForObject = <
  O extends AllStandardObjectName,
  V extends AllStandardObjectViewName<O>,
>(
  args: Args,
  objectName: O,
  specs: readonly Spec<O, V>[],
): Record<string, FlatViewField> =>
  Object.fromEntries(
    specs.map((context) => [
      `${objectName}${String(context.viewName)}${String(context.viewFieldName)}`,
      createStandardViewFieldFlatMetadata({ ...args, objectName, context }),
    ]),
  );

const campaignFields = [
  {
    viewName: 'view5865bdbf',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 0,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'view5865bdbf',
    viewFieldName: 'lifecycleStatus',
    fieldName: 'lifecycleStatus',
    position: 1,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'view5865bdbf',
    viewFieldName: 'objective',
    fieldName: 'objective',
    position: 2,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'view5865bdbf',
    viewFieldName: 'targetPlatforms',
    fieldName: 'targetPlatforms',
    position: 3,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'view5865bdbf',
    viewFieldName: 'icpGoal',
    fieldName: 'icpGoal',
    position: 4,
    isVisible: true,
    size: 160,
  },
] satisfies readonly Spec<'campaign', 'view5865bdbf'>[];
const campaignOverviewFields = [
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'lifecycleStatus',
    fieldName: 'lifecycleStatus',
    position: 0,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 1,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'campaignBrief',
    fieldName: 'campaignBrief',
    position: 2,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'communicationGuidelines',
    fieldName: 'communicationGuidelines',
    position: 3,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'replyRules',
    fieldName: 'replyRules',
    position: 4,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'escalationBoundaries',
    fieldName: 'escalationBoundaries',
    position: 5,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'additionalNotes',
    fieldName: 'additionalNotes',
    position: 6,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'createdAt',
    fieldName: 'createdAt',
    position: 7,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'updatedAt',
    fieldName: 'updatedAt',
    position: 8,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'createdBy',
    fieldName: 'createdBy',
    position: 9,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'updatedBy',
    fieldName: 'updatedBy',
    position: 10,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'owner',
    fieldName: 'owner',
    position: 11,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'objective',
    fieldName: 'objective',
    position: 12,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'targetPlatforms',
    fieldName: 'targetPlatforms',
    position: 13,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'targetDemographics',
    fieldName: 'targetDemographics',
    position: 14,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'icpGoal',
    fieldName: 'icpGoal',
    position: 15,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view6bfee1b9',
    viewFieldName: 'budgetNotes',
    fieldName: 'budgetNotes',
    position: 16,
    isVisible: true,
    size: 150,
  },
] satisfies readonly Spec<'campaign', 'view6bfee1b9'>[];
const campaignOperationsFields = [
  {
    viewName: 'view9c4f90c5',
    viewFieldName: 'lifecycleStatus',
    fieldName: 'lifecycleStatus',
    position: 0,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'view9c4f90c5',
    viewFieldName: 'emailSignature',
    fieldName: 'emailSignature',
    position: 1,
    isVisible: true,
    size: 320,
  },
] satisfies readonly Spec<'campaign', 'view9c4f90c5'>[];
const campaignInstructionsFields = [
  {
    viewName: 'vieweb4da94a',
    viewFieldName: 'campaignBrief',
    fieldName: 'campaignBrief',
    position: 0,
    isVisible: true,
    size: 320,
  },
  {
    viewName: 'vieweb4da94a',
    viewFieldName: 'communicationGuidelines',
    fieldName: 'communicationGuidelines',
    position: 1,
    isVisible: true,
    size: 320,
  },
  {
    viewName: 'vieweb4da94a',
    viewFieldName: 'replyRules',
    fieldName: 'replyRules',
    position: 2,
    isVisible: true,
    size: 320,
  },
  {
    viewName: 'vieweb4da94a',
    viewFieldName: 'escalationBoundaries',
    fieldName: 'escalationBoundaries',
    position: 3,
    isVisible: true,
    size: 320,
  },
  {
    viewName: 'vieweb4da94a',
    viewFieldName: 'additionalNotes',
    fieldName: 'additionalNotes',
    position: 4,
    isVisible: true,
    size: 320,
  },
] satisfies readonly Spec<'campaign', 'vieweb4da94a'>[];
const creatorListFields = [
  {
    viewName: 'view1bc58554',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 0,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'view1bc58554',
    viewFieldName: 'source',
    fieldName: 'source',
    position: 1,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'view1bc58554',
    viewFieldName: 'description',
    fieldName: 'description',
    position: 2,
    isVisible: true,
    size: 220,
  },
] satisfies readonly Spec<'creatorList', 'view1bc58554'>[];
const creatorFields = [
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 0,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'email',
    fieldName: 'email',
    position: 1,
    isVisible: true,
    size: 200,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'gender',
    fieldName: 'gender',
    position: 2,
    isVisible: true,
    size: 140,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'location',
    fieldName: 'location',
    position: 3,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'phone',
    fieldName: 'phone',
    position: 4,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'tiktokLink',
    fieldName: 'tiktokLink',
    position: 5,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'instagramLink',
    fieldName: 'instagramLink',
    position: 6,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'youtubeLink',
    fieldName: 'youtubeLink',
    position: 7,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'twitterLink',
    fieldName: 'twitterLink',
    position: 8,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'creatorStatus',
    fieldName: 'creatorStatus',
    position: 9,
    isVisible: true,
    size: 140,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'source',
    fieldName: 'source',
    position: 10,
    isVisible: true,
    size: 160,
  },
] satisfies readonly Spec<'creator', 'viewa5abdae3'>[];

const creatorMetricsFields = [
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 0,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'instagramFollowerCount',
    fieldName: 'instagramFollowerCount',
    position: 1,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'instagramEngagementPercent',
    fieldName: 'instagramEngagementPercent',
    position: 2,
    isVisible: true,
    size: 200,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'tiktokFollowerCount',
    fieldName: 'tiktokFollowerCount',
    position: 3,
    isVisible: true,
    size: 170,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'tiktokEngagementPercent',
    fieldName: 'tiktokEngagementPercent',
    position: 4,
    isVisible: true,
    size: 190,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'tiktokPlayCountMedian',
    fieldName: 'tiktokPlayCountMedian',
    position: 5,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'youtubeSubscriberCount',
    fieldName: 'youtubeSubscriberCount',
    position: 6,
    isVisible: true,
    size: 190,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'youtubeEngagementPercent',
    fieldName: 'youtubeEngagementPercent',
    position: 7,
    isVisible: true,
    size: 200,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'youtubeAvgViewsLong',
    fieldName: 'youtubeAvgViewsLong',
    position: 8,
    isVisible: true,
    size: 190,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'hasBrandDeals',
    fieldName: 'hasBrandDeals',
    position: 9,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'promotesAffiliateLinks',
    fieldName: 'promotesAffiliateLinks',
    position: 10,
    isVisible: true,
    size: 190,
  },
  {
    viewName: 'creatorMetrics',
    viewFieldName: 'source',
    fieldName: 'source',
    position: 11,
    isVisible: true,
    size: 160,
  },
] satisfies readonly Spec<'creator', 'creatorMetrics'>[];

const creatorRecordPageFields = [
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 0,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'creatorStatus',
    fieldName: 'creatorStatus',
    position: 1,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'owner',
    fieldName: 'owner',
    position: 2,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'email',
    fieldName: 'email',
    position: 3,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'phone',
    fieldName: 'phone',
    position: 4,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'profileType',
    fieldName: 'profileType',
    position: 5,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'categories',
    fieldName: 'categories',
    position: 6,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'niches',
    fieldName: 'niches',
    position: 7,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'location',
    fieldName: 'location',
    position: 8,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'language',
    fieldName: 'language',
    position: 9,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'source',
    fieldName: 'source',
    position: 10,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'sourceUrl',
    fieldName: 'sourceUrl',
    position: 11,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'notes',
    fieldName: 'notes',
    position: 12,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'instagramUsername',
    fieldName: 'instagramUsername',
    position: 13,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'instagramFollowerCount',
    fieldName: 'instagramFollowerCount',
    position: 14,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'tiktokUsername',
    fieldName: 'tiktokUsername',
    position: 15,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'tiktokFollowerCount',
    fieldName: 'tiktokFollowerCount',
    position: 16,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'youtubeTitle',
    fieldName: 'youtubeTitle',
    position: 17,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'youtubeSubscriberCount',
    fieldName: 'youtubeSubscriberCount',
    position: 18,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'patreonUrl',
    fieldName: 'patreonUrl',
    position: 19,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'creatorRecordPageFields',
    viewFieldName: 'youtubeUrl',
    fieldName: 'youtubeUrl',
    position: 20,
    isVisible: true,
    size: 180,
  },
] satisfies readonly Spec<'creator', 'creatorRecordPageFields'>[];
const qualifiedCreatorsWithEmailFields = [
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'name',
    fieldName: 'name',
    position: 0,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'creatorStatus',
    fieldName: 'creatorStatus',
    position: 1,
    isVisible: true,
    size: 140,
  },
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'owner',
    fieldName: 'owner',
    position: 2,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'email',
    fieldName: 'email',
    position: 3,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'instagramLink',
    fieldName: 'instagramLink',
    position: 4,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'instagramFollowerCount',
    fieldName: 'instagramFollowerCount',
    position: 5,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'qualifiedCreatorsWithEmail',
    viewFieldName: 'source',
    fieldName: 'source',
    position: 6,
    isVisible: true,
    size: 160,
  },
] satisfies readonly Spec<'creator', 'qualifiedCreatorsWithEmail'>[];

const campaignInfluencerFields = [
  {
    viewName: 'campaignInfluencers',
    viewFieldName: 'creator',
    fieldName: 'creator',
    position: 0,
    isVisible: true,
    size: 220,
  },
  {
    viewName: 'campaignInfluencers',
    viewFieldName: 'stage',
    fieldName: 'stage',
    position: 1,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'campaignInfluencers',
    viewFieldName: 'isDirectlyAdded',
    fieldName: 'isDirectlyAdded',
    position: 2,
    isVisible: true,
    size: 140,
  },
  {
    viewName: 'campaignInfluencers',
    viewFieldName: 'campaignCreatorListSources',
    fieldName: 'campaignCreatorListSources',
    position: 3,
    isVisible: true,
    size: 220,
  },
] satisfies readonly Spec<'campaignCreator', 'campaignInfluencers'>[];

const campaignInformationCreatorListsFields = [
  {
    viewName: 'viewCampaignInformationCreatorLists',
    viewFieldName: 'campaignCreatorLists',
    fieldName: 'campaignCreatorLists',
    position: 0,
    isVisible: true,
    size: 220,
  },
] satisfies readonly Spec<'campaign', 'viewCampaignInformationCreatorLists'>[];
const campaignCreatorListFields = [
  {
    viewName: 'campaignCreatorLists',
    viewFieldName: 'creatorList',
    fieldName: 'creatorList',
    position: 0,
    isVisible: true,
    size: 220,
  },
] satisfies readonly Spec<'campaignCreatorList', 'campaignCreatorLists'>[];

export const computeMyahViewFields = (
  args: Args,
): Record<string, FlatViewField> => ({
  ...buildForObject(args, 'campaign', campaignFields),
  ...buildForObject(args, 'campaign', campaignOverviewFields),
  ...buildForObject(args, 'campaign', campaignInformationCreatorListsFields),
  ...buildForObject(args, 'campaignCreator', campaignInfluencerFields),
  ...buildForObject(args, 'campaignCreatorList', campaignCreatorListFields),
  ...buildForObject(args, 'campaign', campaignInstructionsFields),
  ...buildForObject(args, 'creatorList', creatorListFields),
  ...buildForObject(args, 'creator', creatorRecordPageFields),
  ...buildForObject(args, 'creator', creatorFields),
  ...buildForObject(args, 'creator', creatorMetricsFields),
  ...buildForObject(args, 'creator', qualifiedCreatorsWithEmailFields),
  ...buildForObject(args, 'campaign', campaignOperationsFields),
});

export const computeMyahCampaignViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(
      ([key]) =>
        key.startsWith('campaign') && !key.startsWith('campaignCreator'),
    ),
  );
export const computeMyahCampaignCreatorViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(
      ([key]) =>
        key.startsWith('campaignCreator') &&
        !key.startsWith('campaignCreatorList'),
    ),
  );
export const computeMyahCampaignCreatorListViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(([key]) =>
      key.startsWith('campaignCreatorList'),
    ),
  );
export const computeMyahCreatorListViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(([key]) =>
      key.startsWith('creatorList'),
    ),
  );
export const computeMyahCreatorViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(
      ([key]) =>
        key.startsWith('creatorcreatorRecordPageFields') ||
        key.startsWith('creatorview') ||
        key.startsWith('creatorcreatorMetrics') ||
        key.startsWith('creatorqualifiedCreatorsWithEmail'),
    ),
  );
