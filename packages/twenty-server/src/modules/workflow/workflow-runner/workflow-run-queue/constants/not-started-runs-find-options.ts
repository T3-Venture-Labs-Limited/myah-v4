import { type FindOptionsWhere, IsNull } from 'typeorm';

import {
  WorkflowRunStatus,
  type WorkflowRunWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';

export const NOT_STARTED_RUNS_FIND_OPTIONS: FindOptionsWhere<WorkflowRunWorkspaceEntity> =
  {
    deletedAt: IsNull(),
    status: WorkflowRunStatus.NOT_STARTED,
    workflow: { outreachCampaignId: IsNull() },
  };
