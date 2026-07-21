import { ViewFilterOperand } from 'twenty-shared/types';
import { type FlatViewFilter } from 'src/engine/metadata-modules/flat-view-filter/types/flat-view-filter.type';
import {
  createStandardViewFilterFlatMetadata,
  type CreateStandardViewFilterArgs,
} from './create-standard-view-filter-flat-metadata.util';

type MyahViewFilterObjectName = 'brandBrainUpdateProposal' | 'creator';
type Args = Omit<
  CreateStandardViewFilterArgs<MyahViewFilterObjectName>,
  'context'
>;

export const computeMyahViewFilters = (
  args: Args,
): Record<string, FlatViewFilter> => ({
  ...(args.objectName === 'brandBrainUpdateProposal'
    ? {
        pendingBrandBrainProposalsStatusIs:
          createStandardViewFilterFlatMetadata({
            ...args,
            objectName: 'brandBrainUpdateProposal',
            context: {
              viewName: 'view25d4c1a3',
              viewFilterName: 'status',
              fieldName: 'status',
              operand: ViewFilterOperand.IS,
              value: JSON.stringify(['PENDING']),
            },
          }),
      }
    : {}),
  ...(args.objectName === 'creator'
    ? {
        qualifiedCreatorsWithEmailCreatorStatusIs:
          createStandardViewFilterFlatMetadata({
            ...args,
            objectName: 'creator',
            context: {
              viewName: 'qualifiedCreatorsWithEmail',
              viewFilterName: 'creatorStatus',
              fieldName: 'creatorStatus',
              operand: ViewFilterOperand.IS,
              value: JSON.stringify(['QUALIFIED']),
            },
          }),
        qualifiedCreatorsWithEmailEmailIsNotEmpty:
          createStandardViewFilterFlatMetadata({
            ...args,
            objectName: 'creator',
            context: {
              viewName: 'qualifiedCreatorsWithEmail',
              viewFilterName: 'email',
              fieldName: 'email',
              operand: ViewFilterOperand.IS_NOT_EMPTY,
              value: JSON.stringify([]),
            },
          }),
      }
    : {}),
});
