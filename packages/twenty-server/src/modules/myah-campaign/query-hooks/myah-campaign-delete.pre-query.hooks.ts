import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import {
  type WorkspacePreQueryHookInstance,
  type WorkspacePreQueryHookTransactionContext,
} from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import {
  type DeleteManyResolverArgs,
  type DeleteOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';

const getCampaignIds = (filter: unknown): string[] => {
  if (typeof filter !== 'object' || filter === null || !('id' in filter)) {
    throw new WorkflowQueryValidationException(
      'Campaign deletion requires explicit Campaign IDs.',
      WorkflowQueryValidationExceptionCode.FORBIDDEN,
    );
  }

  const idFilter = filter.id;

  if (typeof idFilter !== 'object' || idFilter === null) {
    throw new WorkflowQueryValidationException(
      'Campaign deletion requires explicit Campaign IDs.',
      WorkflowQueryValidationExceptionCode.FORBIDDEN,
    );
  }

  if ('eq' in idFilter && typeof idFilter.eq === 'string') {
    return [idFilter.eq];
  }

  if (
    'in' in idFilter &&
    Array.isArray(idFilter.in) &&
    idFilter.in.length > 0 &&
    idFilter.in.every((id) => typeof id === 'string')
  ) {
    return idFilter.in;
  }

  throw new WorkflowQueryValidationException(
    'Campaign deletion requires explicit Campaign IDs.',
    WorkflowQueryValidationExceptionCode.FORBIDDEN,
  );
};

const assertCampaignDeletionAllowed = async ({
  authContext,
  campaignIds,
  lifecycleService,
  transactionContext,
}: {
  authContext: WorkspaceAuthContext;
  campaignIds: string[];
  lifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService;
  transactionContext?: WorkspacePreQueryHookTransactionContext;
}): Promise<void> => {
  const workspace = authContext.workspace;

  assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

  if (!transactionContext) {
    throw new WorkflowQueryValidationException(
      'Campaign deletion requires a transaction.',
      WorkflowQueryValidationExceptionCode.FORBIDDEN,
    );
  }

  await lifecycleService.assertCampaignDeletionAllowedInTransaction({
    authContext,
    campaignIds,
    entityManager: transactionContext.entityManager,
    workspaceId: workspace.id,
  });
};

@WorkspaceQueryHook('campaign.deleteOne')
export class MyahCampaignDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  readonly shouldRunInTransaction = true as const;

  constructor(
    private readonly lifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteOneResolverArgs,
    transactionContext?: WorkspacePreQueryHookTransactionContext,
  ): Promise<DeleteOneResolverArgs> {
    await assertCampaignDeletionAllowed({
      authContext,
      campaignIds: [payload.id],
      lifecycleService: this.lifecycleService,
      transactionContext,
    });

    return payload;
  }
}

@WorkspaceQueryHook('campaign.deleteMany')
export class MyahCampaignDeleteManyPreQueryHook implements WorkspacePreQueryHookInstance {
  readonly shouldRunInTransaction = true as const;

  constructor(
    private readonly lifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteManyResolverArgs,
    transactionContext?: WorkspacePreQueryHookTransactionContext,
  ): Promise<DeleteManyResolverArgs> {
    await assertCampaignDeletionAllowed({
      authContext,
      campaignIds: getCampaignIds(payload.filter),
      lifecycleService: this.lifecycleService,
      transactionContext,
    });

    return payload;
  }
}
