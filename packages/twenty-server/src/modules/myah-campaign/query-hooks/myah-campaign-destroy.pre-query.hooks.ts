import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import {
  type DestroyManyResolverArgs,
  type DestroyOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';

const getCampaignIdsFromDestroyFilter = (filter: unknown): string[] => {
  if (typeof filter !== 'object' || filter === null || !('id' in filter)) {
    throw new Error('Campaign destruction requires an explicit ID filter');
  }

  const idFilter = filter.id;

  if (typeof idFilter !== 'object' || idFilter === null) {
    throw new Error('Campaign destruction requires an explicit ID filter');
  }

  if ('eq' in idFilter && typeof idFilter.eq === 'string') {
    return [idFilter.eq];
  }

  if (
    'in' in idFilter &&
    Array.isArray(idFilter.in) &&
    idFilter.in.every((id) => typeof id === 'string')
  ) {
    return idFilter.in;
  }

  throw new Error('Campaign destruction requires an explicit ID filter');
};

const cleanCampaignWorkflowsBeforeDestruction = async ({
  authContext,
  campaignIds,
  campaignOutreachWorkflowLifecycleService,
}: {
  authContext: WorkspaceAuthContext;
  campaignIds: string[];
  campaignOutreachWorkflowLifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService;
}): Promise<void> => {
  const workspace = authContext.workspace;

  assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

  if (!isDefined(campaignIds[0])) {
    return;
  }

  await campaignOutreachWorkflowLifecycleService.assertCampaignsAreAccessible({
    authContext,
    campaignIds,
    workspaceId: workspace.id,
  });
  await campaignOutreachWorkflowLifecycleService.handleCampaignDeletion({
    authContext,
    campaignIds,
    operation: 'destroy',
    workspaceId: workspace.id,
  });
};

@WorkspaceQueryHook('campaign.destroyOne')
export class MyahCampaignDestroyOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly campaignOutreachWorkflowLifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DestroyOneResolverArgs,
  ): Promise<DestroyOneResolverArgs> {
    await cleanCampaignWorkflowsBeforeDestruction({
      authContext,
      campaignIds: [payload.id],
      campaignOutreachWorkflowLifecycleService:
        this.campaignOutreachWorkflowLifecycleService,
    });

    return payload;
  }
}

@WorkspaceQueryHook('campaign.destroyMany')
export class MyahCampaignDestroyManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly campaignOutreachWorkflowLifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DestroyManyResolverArgs,
  ): Promise<DestroyManyResolverArgs> {
    await cleanCampaignWorkflowsBeforeDestruction({
      authContext,
      campaignIds: getCampaignIdsFromDestroyFilter(payload.filter),
      campaignOutreachWorkflowLifecycleService:
        this.campaignOutreachWorkflowLifecycleService,
    });

    return payload;
  }
}
