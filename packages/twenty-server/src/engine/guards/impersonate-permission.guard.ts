import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'class-validator';
import { PermissionFlagType } from 'twenty-shared/constants';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

type ImpersonatePermissionContext = {
  req: {
    user?: Parameters<MyahTeamAuthorizationService['isMyahTeamMember']>[0];
    userWorkspaceId?: string;
    workspace: {
      id: string;
    };
  };
};

@Injectable()
export class ImpersonatePermissionGuard implements CanActivate {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const graphqlContext = GqlExecutionContext.create(context);
    const { req } = graphqlContext.getContext<ImpersonatePermissionContext>();
    const { userWorkspaceId, workspace } = req;

    if (!isDefined(userWorkspaceId)) {
      throw new PermissionsException(
        PermissionsExceptionMessage.PERMISSION_DENIED,
        PermissionsExceptionCode.PERMISSION_DENIED,
        {
          userFriendlyMessage: msg`Can't impersonate user via api key`,
        },
      );
    }

    if (this.myahTeamAuthorizationService.isMyahTeamMember(req.user)) {
      return true;
    }

    const hasPermission =
      await this.permissionsService.userHasWorkspaceSettingPermission({
        userWorkspaceId,
        setting: PermissionFlagType.IMPERSONATE,
        workspaceId: workspace.id,
      });

    if (hasPermission) {
      return true;
    }

    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
      {
        userFriendlyMessage: msg`You do not have permission to impersonate users. Please contact your workspace administrator for access.`,
      },
    );
  }
}
