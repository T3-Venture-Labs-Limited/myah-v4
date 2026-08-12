import { ViewFilterOperand } from 'twenty-shared/types';

import { type FlatViewFilter } from 'src/engine/metadata-modules/flat-view-filter/types/flat-view-filter.type';
import {
  createStandardViewFilterFlatMetadata,
  type CreateStandardViewFilterArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-filter/create-standard-view-filter-flat-metadata.util';

export const computeStandardWorkflowViewFilters = (
  args: Omit<CreateStandardViewFilterArgs<'workflow'>, 'context'>,
): Record<string, FlatViewFilter> => ({
  allWorkflowsOutreachCampaignIsEmpty: createStandardViewFilterFlatMetadata({
    ...args,
    objectName: 'workflow',
    context: {
      viewName: 'allWorkflows',
      viewFilterName: 'outreachCampaignIsEmpty',
      fieldName: 'outreachCampaign',
      operand: ViewFilterOperand.IS_EMPTY,
      value: JSON.stringify([]),
    },
  }),
});
