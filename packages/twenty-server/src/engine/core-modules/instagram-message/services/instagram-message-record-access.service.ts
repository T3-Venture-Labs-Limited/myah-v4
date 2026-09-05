import { Injectable } from '@nestjs/common';

import { IsNull } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

@Injectable()
export class InstagramMessageRecordAccessService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assertCanReadDraft(input: {
    workspaceId: string;
    draftId: string;
    rolePermissionConfig: RolePermissionConfig;
  }): Promise<void> {
    const repository =
      await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
        input.workspaceId,
        'myahInstagramReplyDraft',
        input.rolePermissionConfig,
      );
    const draft = await repository.findOne({
      where: { id: input.draftId, deletedAt: IsNull() },
      select: { id: true },
    });
    if (!draft) throw new Error('Instagram message draft is unavailable');
  }

  async assertCanSaveDraft(input: {
    workspaceId: string;
    draftId: string;
    expectedRevision: number;
    kind: 'FIRST_MESSAGE' | 'REPLY';
    creatorRecordId: string | null;
    conversationRecordId: string | null;
    rolePermissionConfig: RolePermissionConfig;
  }): Promise<void> {
    if (input.expectedRevision > 0) {
      await this.assertCanReadDraft(input);
    }

    if (input.kind === 'FIRST_MESSAGE') {
      if (!input.creatorRecordId || input.conversationRecordId) {
        throw new Error(
          'FIRST_MESSAGE draft requires a Creator and no conversation',
        );
      }
      const repository =
        await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
          input.workspaceId,
          'creator',
          input.rolePermissionConfig,
        );
      const creator = await repository.findOne({
        where: { id: input.creatorRecordId, deletedAt: IsNull() },
        select: { id: true },
      });
      if (!creator) throw new Error('Creator is unavailable');

      return;
    }

    if (!input.conversationRecordId) {
      throw new Error('Active Unipile conversation is unavailable');
    }
    const repository =
      await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
        input.workspaceId,
        'myahSocialConversation',
        input.rolePermissionConfig,
      );
    const conversation = await repository.findOne({
      where: {
        id: input.conversationRecordId,
        deletedAt: IsNull(),
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!conversation) {
      throw new Error('Active Unipile conversation is unavailable');
    }
  }
}
