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

const brandBrainPageRecordFields = [
  {
    viewName: 'view2774101b',
    viewFieldName: 'title',
    fieldName: 'title',
    position: 0,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'slug',
    fieldName: 'slug',
    position: 1,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'canonicalPath',
    fieldName: 'canonicalPath',
    position: 2,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'idPath',
    fieldName: 'idPath',
    position: 3,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'pageType',
    fieldName: 'pageType',
    position: 4,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'summary',
    fieldName: 'summary',
    position: 5,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'body',
    fieldName: 'body',
    position: 6,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'parentPage',
    fieldName: 'parentPage',
    position: 7,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'childPages',
    fieldName: 'childPages',
    position: 8,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'sourceLinks',
    fieldName: 'sourcePageLinks',
    position: 9,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view2774101b',
    viewFieldName: 'targetLinks',
    fieldName: 'targetPageLinks',
    position: 10,
    isVisible: true,
    size: 150,
  },
] satisfies readonly Spec<'brandBrainPage', 'view2774101b'>[];
const allBrandBrainPageFields = [
  {
    viewName: 'view914bd2ad',
    viewFieldName: 'title',
    fieldName: 'title',
    position: 0,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view914bd2ad',
    viewFieldName: 'canonicalPath',
    fieldName: 'canonicalPath',
    position: 1,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view914bd2ad',
    viewFieldName: 'pageType',
    fieldName: 'pageType',
    position: 2,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view914bd2ad',
    viewFieldName: 'summary',
    fieldName: 'summary',
    position: 3,
    isVisible: true,
    size: 150,
  },
] satisfies readonly Spec<'brandBrainPage', 'view914bd2ad'>[];
const pendingProposalFields = [
  {
    viewName: 'view25d4c1a3',
    viewFieldName: 'title',
    fieldName: 'title',
    position: 0,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'view25d4c1a3',
    viewFieldName: 'proposalType',
    fieldName: 'proposalType',
    position: 1,
    isVisible: true,
    size: 150,
  },
  {
    viewName: 'view25d4c1a3',
    viewFieldName: 'status',
    fieldName: 'status',
    position: 2,
    isVisible: true,
    size: 130,
  },
  {
    viewName: 'view25d4c1a3',
    viewFieldName: 'reason',
    fieldName: 'reason',
    position: 3,
    isVisible: true,
    size: 240,
  },
  {
    viewName: 'view25d4c1a3',
    viewFieldName: 'proposedPatch',
    fieldName: 'proposedPatch',
    position: 4,
    isVisible: true,
    size: 320,
  },
] satisfies readonly Spec<'brandBrainUpdateProposal', 'view25d4c1a3'>[];
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
    viewFieldName: 'status',
    fieldName: 'status',
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
    viewFieldName: 'creatorStatus',
    fieldName: 'creatorStatus',
    position: 1,
    isVisible: true,
    size: 140,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'owner',
    fieldName: 'owner',
    position: 2,
    isVisible: true,
    size: 180,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'email',
    fieldName: 'email',
    position: 3,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'instagramUsername',
    fieldName: 'instagramUsername',
    position: 4,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'instagramFollowerCount',
    fieldName: 'instagramFollowerCount',
    position: 5,
    isVisible: true,
    size: 160,
  },
  {
    viewName: 'viewa5abdae3',
    viewFieldName: 'source',
    fieldName: 'source',
    position: 6,
    isVisible: true,
    size: 160,
  },
] satisfies readonly Spec<'creator', 'viewa5abdae3'>[];
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
    viewFieldName: 'instagramUsername',
    fieldName: 'instagramUsername',
    position: 4,
    isVisible: true,
    size: 160,
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

export const computeMyahViewFields = (
  args: Args,
): Record<string, FlatViewField> => ({
  ...buildForObject(args, 'brandBrainPage', brandBrainPageRecordFields),
  ...buildForObject(args, 'brandBrainPage', allBrandBrainPageFields),
  ...buildForObject(args, 'brandBrainUpdateProposal', pendingProposalFields),
  ...buildForObject(args, 'campaign', campaignFields),
  ...buildForObject(args, 'creatorList', creatorListFields),
  ...buildForObject(args, 'creator', creatorFields),
  ...buildForObject(args, 'creator', qualifiedCreatorsWithEmailFields),
});

export const computeMyahBrandBrainPageViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(([key]) =>
      key.startsWith('brandBrainPage'),
    ),
  );
export const computeMyahBrandBrainUpdateProposalViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(([key]) =>
      key.startsWith('brandBrainUpdateProposal'),
    ),
  );
export const computeMyahCampaignViewFields = (args: Args) =>
  Object.fromEntries(
    Object.entries(computeMyahViewFields(args)).filter(([key]) =>
      key.startsWith('campaign'),
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
        key.startsWith('creatorview') ||
        key.startsWith('creatorqualifiedCreatorsWithEmail'),
    ),
  );
