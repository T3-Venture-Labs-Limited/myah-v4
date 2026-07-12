import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { msg } from '@lingui/core/macro';
import { type PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

type SettingsPermissionRequest = {
  workspace: {
    id: string;
    activationStatus: WorkspaceActivationStatus;
  };
  userWorkspaceId?: string;
  apiKey?: { id?: string };
  application?: { id?: string };
};

const getRequestFromExecutionContext = (
  context: ExecutionContext,
): SettingsPermissionRequest => {
  if (context.getType() === 'http') {
    return context.switchToHttp().getRequest<SettingsPermissionRequest>();
  }

  return GqlExecutionContext.create(context).getContext().req;
};

export const SettingsPermissionGuard = (
  requiredPermission: PermissionFlagType,
): Type<CanActivate> => {
  @Injectable()
  class SettingsPermissionMixin implements CanActivate {
    constructor(private readonly permissionsService: PermissionsService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = getRequestFromExecutionContext(context);
      const workspaceId = request.workspace.id;
      const userWorkspaceId = request.userWorkspaceId;
      const workspaceActivationStatus = request.workspace.activationStatus;

      if (
        [
          WorkspaceActivationStatus.PENDING_CREATION,
          WorkspaceActivationStatus.ONGOING_CREATION,
        ].includes(workspaceActivationStatus)
      ) {
        return true;
      }

      const hasPermission =
        await this.permissionsService.userHasWorkspaceSettingPermission({
          userWorkspaceId,
          setting: requiredPermission,
          workspaceId,
          apiKeyId: request.apiKey?.id,
          applicationId: request.application?.id,
        });

      if (hasPermission === true) {
        return true;
      }

      throw new PermissionsException(
        PermissionsExceptionMessage.PERMISSION_DENIED,
        PermissionsExceptionCode.PERMISSION_DENIED,
        {
          userFriendlyMessage: msg`You do not have permission to access this feature. Please contact your workspace administrator for access.`,
        },
      );
    }
  }

  return mixin(SettingsPermissionMixin);
};
