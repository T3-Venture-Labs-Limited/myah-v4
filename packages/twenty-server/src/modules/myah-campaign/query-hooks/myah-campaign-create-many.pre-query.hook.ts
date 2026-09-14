import {
  type WorkspacePreQueryHookInstance,
  type WorkspaceRawInputPreQueryHookContext,
} from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';
import { type CampaignMutationData } from 'src/modules/myah-campaign/types/campaign-workspace-record.type';

@WorkspaceQueryHook('campaign.createMany')
export class MyahCampaignCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly campaignLifecycleService: CampaignLifecycleService,
  ) {}

  validateRawInput(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs<CampaignMutationData>,
    context: WorkspaceRawInputPreQueryHookContext,
  ): void {
    this.campaignLifecycleService.validateRawCreateMany(context, payload);
  }

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateManyResolverArgs<CampaignMutationData>,
  ): Promise<CreateManyResolverArgs<CampaignMutationData>> {
    return this.campaignLifecycleService.prepareCreateMany(
      authContext,
      objectName,
      payload,
    );
  }
}
