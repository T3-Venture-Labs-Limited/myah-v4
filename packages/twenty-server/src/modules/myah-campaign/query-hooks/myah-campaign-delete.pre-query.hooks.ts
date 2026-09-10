import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import {
  type DeleteManyResolverArgs,
  type DeleteOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { rejectGenericCampaignLifecycleOperation } from 'src/modules/myah-campaign/utils/reject-generic-campaign-lifecycle-operation.util';

@WorkspaceQueryHook('campaign.deleteOne')
export class MyahCampaignDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DeleteOneResolverArgs,
  ): Promise<DeleteOneResolverArgs> {
    return rejectGenericCampaignLifecycleOperation();
  }
}

@WorkspaceQueryHook('campaign.deleteMany')
export class MyahCampaignDeleteManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DeleteManyResolverArgs,
  ): Promise<DeleteManyResolverArgs> {
    return rejectGenericCampaignLifecycleOperation();
  }
}
