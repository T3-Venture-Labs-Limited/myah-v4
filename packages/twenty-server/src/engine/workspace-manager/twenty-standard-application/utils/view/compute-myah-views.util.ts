import { ViewOpenRecordIn, ViewType } from 'twenty-shared/types';
import { type FlatView } from 'src/engine/metadata-modules/flat-view/types/flat-view.type';
import {
  createStandardViewFlatMetadata,
  type CreateStandardViewArgs,
} from './create-standard-view-flat-metadata.util';

type Args = Omit<CreateStandardViewArgs, 'context'>;

export const computeMyahViews = (args: Args): Record<string, FlatView> => ({
  brandBrainPageRecordPageFields: createStandardViewFlatMetadata({
    ...args,
    objectName: 'brandBrainPage',
    context: {
      viewName: 'view2774101b',
      name: 'Brand Brain Page Record Fields',
      type: ViewType.FIELDS_WIDGET,
      key: null,
      position: 0,
      icon: 'IconList',
    },
  }),
  pendingBrandBrainProposals: createStandardViewFlatMetadata({
    ...args,
    objectName: 'brandBrainUpdateProposal',
    context: {
      viewName: 'view25d4c1a3',
      name: 'Pending Brand Brain Proposals',
      type: ViewType.TABLE,
      key: null,
      position: 2,
      icon: 'IconFilePencil',
    },
  }),
  allBrandBrainPages: createStandardViewFlatMetadata({
    ...args,
    objectName: 'brandBrainPage',
    context: {
      viewName: 'view914bd2ad',
      name: 'All Brand Brain',
      type: ViewType.TABLE,
      key: null,
      position: 0,
      icon: 'IconNotebook',
    },
  }),
  campaigns: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaign',
    context: {
      viewName: 'view5865bdbf',
      name: 'Campaigns',
      type: ViewType.TABLE,
      key: null,
      position: 0,
      icon: 'IconTargetArrow',
      openRecordIn: ViewOpenRecordIn.RECORD_PAGE,
    },
  }),
  campaignOverviewFields: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaign',
    context: {
      viewName: 'view6bfee1b9',
      name: 'Campaign Overview Fields',
      type: ViewType.FIELDS_WIDGET,
      key: null,
      position: 1,
      icon: 'IconList',
    },
  }),
  campaignInstructionsFields: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaign',
    context: {
      viewName: 'vieweb4da94a',
      name: 'Campaign Instructions Fields',
      type: ViewType.FIELDS_WIDGET,
      key: null,
      position: 2,
      icon: 'IconFileText',
    },
  }),
  creatorLists: createStandardViewFlatMetadata({
    ...args,
    objectName: 'creatorList',
    context: {
      viewName: 'view1bc58554',
      name: 'Creator Lists',
      type: ViewType.TABLE,
      key: null,
      position: 0,
      icon: 'IconListDetails',
    },
  }),
  campaignInfluencers: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaignCreator',
    context: {
      viewName: 'campaignInfluencers',
      name: 'Campaign Influencers',
      type: ViewType.TABLE_WIDGET,
      key: null,
      position: 0,
      icon: 'IconUsers',
    },
  }),
  campaignInformationCreatorLists: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaign',
    context: {
      viewName: 'viewCampaignInformationCreatorLists',
      name: 'Campaign Creator Lists',
      type: ViewType.FIELDS_WIDGET,
      key: null,
      position: 4,
      icon: 'IconListDetails',
    },
  }),
  campaignCreatorLists: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaignCreatorList',
    context: {
      viewName: 'campaignCreatorLists',
      name: 'Campaign Creator Lists',
      type: ViewType.TABLE,
      key: null,
      position: 0,
      icon: 'IconListDetails',
    },
  }),
  creatorRecordPageFields: createStandardViewFlatMetadata({
    ...args,
    objectName: 'creator',
    context: {
      viewName: 'creatorRecordPageFields',
      name: 'Creator Record Fields',
      type: ViewType.FIELDS_WIDGET,
      key: null,
      position: 0,
      icon: 'IconList',
    },
  }),
  creators: createStandardViewFlatMetadata({
    ...args,
    objectName: 'creator',
    context: {
      viewName: 'viewa5abdae3',
      name: 'Creators',
      type: ViewType.TABLE,
      key: null,
      position: 0,
      icon: 'IconUserStar',
    },
  }),
  creatorMetrics: createStandardViewFlatMetadata({
    ...args,
    objectName: 'creator',
    context: {
      viewName: 'creatorMetrics',
      name: 'Creator metrics',
      type: ViewType.TABLE,
      key: null,
      position: 2,
      icon: 'IconChartBar',
    },
  }),
  qualifiedCreatorsWithEmail: createStandardViewFlatMetadata({
    ...args,
    objectName: 'creator',
    context: {
      viewName: 'qualifiedCreatorsWithEmail',
      name: 'Qualified creators with email',
      type: ViewType.TABLE,
      key: null,
      position: 1,
      icon: 'IconUsers',
    },
  }),
  campaignOperationsFields: createStandardViewFlatMetadata({
    ...args,
    objectName: 'campaign',
    context: {
      viewName: 'view9c4f90c5',
      name: 'Campaign Operations Fields',
      type: ViewType.FIELDS_WIDGET,
      key: null,
      position: 3,
      icon: 'IconSettings',
    },
  }),
});
export const computeMyahBrandBrainPageViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) =>
        key === 'brandBrainPageRecordPageFields' ||
        key === 'allBrandBrainPages',
    ),
  );
export const computeMyahBrandBrainUpdateProposalViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) => key === 'pendingBrandBrainProposals',
    ),
  );
export const computeMyahCampaignViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) =>
        key === 'campaigns' ||
        key === 'campaignOverviewFields' ||
        key === 'campaignInstructionsFields' ||
        key === 'campaignOperationsFields' ||
        key === 'campaignInformationCreatorLists',
    ),
  );
export const computeMyahCampaignCreatorViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) => key === 'campaignInfluencers',
    ),
  );
export const computeMyahCampaignCreatorListViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) => key === 'campaignCreatorLists',
    ),
  );
export const computeMyahCreatorListViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) => key === 'creatorLists',
    ),
  );
export const computeMyahCreatorViews = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViews(args)).filter(
      ([key]) =>
        key === 'creatorRecordPageFields' ||
        key === 'creators' ||
        key === 'creatorMetrics' ||
        key === 'qualifiedCreatorsWithEmail',
    ),
  );
