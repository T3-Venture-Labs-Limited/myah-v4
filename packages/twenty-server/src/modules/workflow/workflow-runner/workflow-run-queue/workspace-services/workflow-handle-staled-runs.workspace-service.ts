import { Injectable, Logger } from '@nestjs/common';

import { IsNull } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  WorkflowRunStatus,
  WorkflowRunWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { getStaledRunsFindOptions } from 'src/modules/workflow/workflow-runner/workflow-run-queue/utils/get-staled-runs-find-options.util';
import { WorkflowThrottlingWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-throttling.workspace-service';

@Injectable()
export class WorkflowHandleStaledRunsWorkspaceService {
  private readonly logger = new Logger(
    WorkflowHandleStaledRunsWorkspaceService.name,
  );
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly workflowThrottlingWorkspaceService: WorkflowThrottlingWorkspaceService,
    private readonly workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  ) {}

  async handleStaledRunsForWorkspace(workspaceId: string) {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowRunRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          WorkflowRunWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const staledWorkflowRuns = await workflowRunRepository.find({
        where: getStaledRunsFindOptions(),
        withDeleted: true,
      });

      if (staledWorkflowRuns.length <= 0) {
        return;
      }

      await this.workflowOutreachAccessGuardService.assertGenericWorkflowRunMutationsAllowed(
        {
          workflowRunIds: staledWorkflowRuns.map(({ id }) => id),
          workspaceId,
        },
      );

      let transitionedRunCount = 0;

      for (const workflowRun of staledWorkflowRuns) {
        const updateResult = await workflowRunRepository.update(
          {
            id: workflowRun.id,
            status: WorkflowRunStatus.ENQUEUED,
            enqueuedAt: workflowRun.enqueuedAt ?? IsNull(),
          },
          {
            enqueuedAt: null,
            status: WorkflowRunStatus.NOT_STARTED,
          },
        );

        transitionedRunCount += updateResult.affected ?? 0;
      }

      if (transitionedRunCount > 0) {
        await this.workflowThrottlingWorkspaceService.recomputeWorkflowRunNotStartedCount(
          workspaceId,
        );
      }
    }, authContext);
  }
}
