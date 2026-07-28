import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { type CampaignMutationData } from 'src/modules/myah-campaign/types/campaign-workspace-record.type';

@WorkspaceQueryHook('campaign.createOne')
export class MyahCampaignCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly campaignLifecycleService: CampaignLifecycleService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateOneResolverArgs<CampaignMutationData>,
  ): Promise<CreateOneResolverArgs<CampaignMutationData>> {
    return this.campaignLifecycleService.prepareCreateOne(
      authContext,
      objectName,
      payload,
    );
  }
}
