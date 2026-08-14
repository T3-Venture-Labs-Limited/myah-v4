import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { type CampaignWorkspaceRecord } from 'src/modules/myah-campaign/types/campaign-workspace-record.type';

const handleDeletedCampaigns = async ({
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

  await campaignOutreachWorkflowLifecycleService.handleCampaignDeletion({
    campaignIds,
    operation: 'delete',
    workspaceId: workspace.id,
  });
};

@WorkspaceQueryHook({
  key: 'campaign.deleteOne',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class MyahCampaignDeleteOnePostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(
    private readonly campaignOutreachWorkflowLifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignWorkspaceRecord[],
  ): Promise<void> {
    await handleDeletedCampaigns({
      authContext,
      campaignIds: payload.map(({ id }) => id),
      campaignOutreachWorkflowLifecycleService:
        this.campaignOutreachWorkflowLifecycleService,
    });
  }
}

@WorkspaceQueryHook({
  key: 'campaign.deleteMany',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class MyahCampaignDeleteManyPostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(
    private readonly campaignOutreachWorkflowLifecycleService: CampaignOutreachWorkflowLifecycleWorkspaceService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignWorkspaceRecord[],
  ): Promise<void> {
    await handleDeletedCampaigns({
      authContext,
      campaignIds: payload.map(({ id }) => id),
      campaignOutreachWorkflowLifecycleService:
        this.campaignOutreachWorkflowLifecycleService,
    });
  }
}
