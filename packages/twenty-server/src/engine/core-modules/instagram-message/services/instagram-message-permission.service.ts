import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { type InstagramMessageActionKind } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

@Injectable()
export class InstagramMessagePermissionService {
  constructor(private readonly permissionsService: PermissionsService) {}

  async assertCanSend(input: {
    actionKind: InstagramMessageActionKind;
    rolePermissionConfig: RolePermissionConfig;
    workspaceId: string;
  }): Promise<void> {
    const permissionFlag =
      input.actionKind === 'START_CHAT'
        ? PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL
        : PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL;
    const hasPermission = await this.permissionsService.hasToolPermission(
      input.rolePermissionConfig,
      input.workspaceId,
      permissionFlag,
    );

    if (!hasPermission) {
      throw new Error('Instagram message send permission is required');
    }
  }
}
