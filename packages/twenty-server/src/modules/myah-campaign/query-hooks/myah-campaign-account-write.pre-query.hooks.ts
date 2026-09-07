import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

const rejectGenericCampaignAccountWrite = (): never => {
  throw new Error('Campaign Accounts are system-managed');
};

@WorkspaceQueryHook('campaignAccount.createOne')
export class MyahCampaignAccountCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.createMany')
export class MyahCampaignAccountCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.updateOne')
export class MyahCampaignAccountUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.updateMany')
export class MyahCampaignAccountUpdateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.deleteOne')
export class MyahCampaignAccountDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.deleteMany')
export class MyahCampaignAccountDeleteManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.destroyOne')
export class MyahCampaignAccountDestroyOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.destroyMany')
export class MyahCampaignAccountDestroyManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.restoreOne')
export class MyahCampaignAccountRestoreOnePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}

@WorkspaceQueryHook('campaignAccount.restoreMany')
export class MyahCampaignAccountRestoreManyPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    return rejectGenericCampaignAccountWrite();
  }
}
