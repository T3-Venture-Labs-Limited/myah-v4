import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

@Injectable()
export class ResolveInstagramOutcomePermissionGuard implements CanActivate {
  readonly permissionFlag = PermissionFlagType.RESOLVE_INSTAGRAM_SEND_OUTCOME;

  constructor(
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const graphqlContext = GqlExecutionContext.create(context).getContext<{
      req: {
        user?: Parameters<MyahTeamAuthorizationService['isMyahTeamMember']>[0];
        workspace?: { id: string };
        userWorkspaceId?: string;
        apiKey?: { id: string };
      };
    }>();
    const request = graphqlContext.req;

    if (
      !this.myahTeamAuthorizationService.isMyahTeamMember(request.user) ||
      !request.workspace?.id ||
      !request.userWorkspaceId
    ) {
      return false;
    }

    return this.permissionsService.userHasWorkspaceSettingPermission({
      userWorkspaceId: request.userWorkspaceId,
      workspaceId: request.workspace.id,
      setting: PermissionFlagType.RESOLVE_INSTAGRAM_SEND_OUTCOME,
      apiKeyId: request.apiKey?.id,
    });
  }
}
