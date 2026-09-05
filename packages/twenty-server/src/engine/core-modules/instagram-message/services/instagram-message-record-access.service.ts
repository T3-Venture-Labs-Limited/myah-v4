import { Injectable } from '@nestjs/common';

import { IsNull, Not } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

type AccessibleInstagramDraft = ObjectRecord & {
  id: string;
  revision: number | string;
  kind: 'FIRST_MESSAGE' | 'REPLY';
  creatorId: string | null;
  conversationId: string | null;
};
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

  async assertCanExecuteDraft(input: {
    workspaceId: string;
    draftId: string;
    rolePermissionConfig: RolePermissionConfig;
  }): Promise<{
    draft: AccessibleInstagramDraft;
    instagramAccountRecordId: string;
  }> {
    const draftRepository =
      await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
        input.workspaceId,
        'myahInstagramReplyDraft',
        input.rolePermissionConfig,
      );
    const draft = (await draftRepository.findOne({
      where: { id: input.draftId, deletedAt: IsNull() },
    })) as AccessibleInstagramDraft | null;

    if (
      !draft ||
      !Number.isSafeInteger(Number(draft.revision)) ||
      Number(draft.revision) < 1 ||
      (draft.kind !== 'FIRST_MESSAGE' && draft.kind !== 'REPLY')
    ) {
      throw new Error('Instagram message draft is unavailable');
    }

    await this.assertCanSaveDraft({
      workspaceId: input.workspaceId,
      draftId: draft.id,
      expectedRevision: Number(draft.revision),
      kind: draft.kind,
      creatorRecordId: draft.creatorId,
      conversationRecordId: draft.conversationId,
      rolePermissionConfig: input.rolePermissionConfig,
    });

    const accountRepository =
      await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
        input.workspaceId,
        'myahInstagramAccount',
        input.rolePermissionConfig,
      );
    const account = await accountRepository.findOne({
      where: {
        deletedAt: IsNull(),
        status: 'ACTIVE',
        unipileAccountId: Not(IsNull()),
      },
      select: { id: true },
    });

    if (!account) {
      throw new Error('Instagram account is unavailable');
    }

    return {
      draft,
      instagramAccountRecordId: account.id,
    };
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
