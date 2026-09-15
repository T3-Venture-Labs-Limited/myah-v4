import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowVersionValidationWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-version-validation.workspace-service';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';

const getRequestedWorkflowIds = (
  data: UpdateOneResolverArgs<WorkflowVersionWorkspaceEntity>['data'],
): string[] => {
  const requestedWorkflowIds: string[] = [];

  if (Object.prototype.hasOwnProperty.call(data, 'workflowId')) {
    if (typeof data.workflowId === 'string') {
      requestedWorkflowIds.push(data.workflowId);
    } else if (data.workflowId !== null) {
      throw new WorkflowQueryValidationException(
        'Workflow version reassociation target is invalid.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'workflow')) {
    const relation = data.workflow as unknown;

    if (typeof relation !== 'object' || relation === null) {
      throw new WorkflowQueryValidationException(
        'Workflow version reassociation target is invalid.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    if ('connect' in relation) {
      const connect = relation.connect;
      const targetId =
        typeof connect === 'object' &&
        connect !== null &&
        'where' in connect &&
        typeof connect.where === 'object' &&
        connect.where !== null &&
        'id' in connect.where
          ? connect.where.id
          : undefined;

      if (typeof targetId !== 'string') {
        throw new WorkflowQueryValidationException(
          'Workflow version reassociation target is invalid.',
          WorkflowQueryValidationExceptionCode.FORBIDDEN,
        );
      }

      requestedWorkflowIds.push(targetId);
    } else if (!('disconnect' in relation) || relation.disconnect !== true) {
      throw new WorkflowQueryValidationException(
        'Workflow version reassociation target is invalid.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }

  return [...new Set(requestedWorkflowIds)];
};

@WorkspaceQueryHook(`workflowVersion.updateOne`)
export class WorkflowVersionUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
    private readonly workflowVersionValidationWorkspaceService: WorkflowVersionValidationWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs<WorkflowVersionWorkspaceEntity>,
  ): Promise<UpdateOneResolverArgs<WorkflowVersionWorkspaceEntity>> {
    const { workspace } = authContext;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);
    await this.workflowOutreachAccessGuardService.assertGenericWorkflowVersionMutationAllowed(
      { workflowVersionId: payload.id, workspaceId: workspace.id },
    );

    for (const workflowId of getRequestedWorkflowIds(payload.data)) {
      await this.workflowOutreachAccessGuardService.assertGenericWorkflowMutationAllowed(
        { workflowId, workspaceId: workspace.id },
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(payload.data, 'campaignSequence')
    ) {
      throw new WorkflowQueryValidationException(
        'campaignSequence cannot be changed through generic workflow APIs.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    await this.workflowVersionValidationWorkspaceService.validateWorkflowVersionForUpdateOne(
      {
        workspaceId: workspace.id,
        payload,
      },
    );

    return payload;
  }
}
