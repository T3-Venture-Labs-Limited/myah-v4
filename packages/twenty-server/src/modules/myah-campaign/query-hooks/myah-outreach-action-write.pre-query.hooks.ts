import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

class RejectOutreachActionWritePreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: ResolverArgs,
  ): Promise<ResolverArgs> {
    throw new Error('Outreach Actions are system-managed');
  }
}

@WorkspaceQueryHook('outreachAction.createOne')
export class MyahOutreachActionCreateOnePreQueryHook extends RejectOutreachActionWritePreQueryHook {}

@WorkspaceQueryHook('outreachAction.createMany')
export class MyahOutreachActionCreateManyPreQueryHook extends RejectOutreachActionWritePreQueryHook {}

@WorkspaceQueryHook('outreachAction.updateOne')
export class MyahOutreachActionUpdateOnePreQueryHook extends RejectOutreachActionWritePreQueryHook {}

@WorkspaceQueryHook('outreachAction.updateMany')
export class MyahOutreachActionUpdateManyPreQueryHook extends RejectOutreachActionWritePreQueryHook {}
