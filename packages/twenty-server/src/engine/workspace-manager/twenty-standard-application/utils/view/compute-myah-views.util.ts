import { ViewType } from 'twenty-shared/types';
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
      ([key]) => key === 'campaigns',
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
      ([key]) => key === 'creators',
    ),
  );
