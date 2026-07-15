import { ViewFilterOperand } from 'twenty-shared/types';
import { type FlatViewFilter } from 'src/engine/metadata-modules/flat-view-filter/types/flat-view-filter.type';
import { createStandardViewFilterFlatMetadata, type CreateStandardViewFilterArgs } from './create-standard-view-filter-flat-metadata.util';

type Args = Omit<CreateStandardViewFilterArgs<'brandBrainUpdateProposal'>, 'context'>;
export const computeMyahViewFilters = (args: Args): Record<string, FlatViewFilter> => ({
  pendingBrandBrainProposalsStatusIs: createStandardViewFilterFlatMetadata({
    ...args,
    objectName: 'brandBrainUpdateProposal',
    context: { viewName: 'view25d4c1a3', viewFilterName: 'status', fieldName: 'status', operand: ViewFilterOperand.IS, value: JSON.stringify(['PENDING']) },
  }),
});
