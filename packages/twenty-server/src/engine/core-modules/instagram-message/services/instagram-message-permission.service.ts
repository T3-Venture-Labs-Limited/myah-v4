import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { type InstagramMessageActionKind } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

@Injectable()
export class InstagramMessagePermissionService {
  constructor(private readonly permissionsService: PermissionsService) {}

  async canSend(input: {
    actionKind: InstagramMessageActionKind;
    rolePermissionConfig: RolePermissionConfig;
    workspaceId: string;
  }): Promise<boolean> {
    return this.permissionsService.hasToolPermission(
      input.rolePermissionConfig,
      input.workspaceId,
      input.actionKind === 'START_CHAT'
        ? PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL
        : PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
    );
  }

  async canQueryComposerAccount(input: {
    rolePermissionConfig: RolePermissionConfig;
    workspaceId: string;
  }): Promise<boolean> {
    const [canStart, canReply] = await Promise.all([
      this.canSend({ ...input, actionKind: 'START_CHAT' }),
      this.canSend({ ...input, actionKind: 'REPLY' }),
    ]);

    return canStart || canReply;
  }

  async assertCanSend(input: {
    actionKind: InstagramMessageActionKind;
    rolePermissionConfig: RolePermissionConfig;
    workspaceId: string;
  }): Promise<void> {
    if (!(await this.canSend(input))) {
      throw new Error('Instagram message send permission is required');
    }
  }
}
