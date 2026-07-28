import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  CampaignLifecycleService,
  type CampaignUpdateManyArgs,
} from 'src/modules/myah-campaign/services/campaign-lifecycle.service';

@WorkspaceQueryHook('campaign.updateMany')
export class MyahCampaignUpdateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly campaignLifecycleService: CampaignLifecycleService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CampaignUpdateManyArgs,
  ): Promise<CampaignUpdateManyArgs> {
    return this.campaignLifecycleService.prepareUpdateMany(
      authContext,
      objectName,
      payload,
    );
  }
}
