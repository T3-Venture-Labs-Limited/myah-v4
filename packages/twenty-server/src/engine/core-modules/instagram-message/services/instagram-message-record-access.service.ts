import { Injectable } from '@nestjs/common';

import { IsNull, Not } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

type AccessibleInstagramDraft = ObjectRecord & {
  id: string;
  revision: number | string;
  kind: 'FIRST_MESSAGE' | 'REPLY';
  creatorId: string | null;
  conversationId: string | null;
};

type AccessibleInstagramConversation = ObjectRecord & {
  id: string;
  instagramAccountId: string | null;
};

@Injectable()
export class InstagramMessageRecordAccessService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    private readonly accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
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
      select: { id: true, revision: true, body: true },
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

    const accessibleConversation = await this.assertCanSaveDraft({
      workspaceId: input.workspaceId,
      draftId: draft.id,
      expectedRevision: Number(draft.revision),
      kind: draft.kind,
      creatorRecordId: draft.creatorId,
      conversationRecordId: draft.conversationId,
      rolePermissionConfig: input.rolePermissionConfig,
    });

    const accountRecordId =
      draft.kind === 'REPLY'
        ? accessibleConversation?.instagramAccountId
        : await this.getActiveAccountRecordId(input.workspaceId);
    if (!accountRecordId) {
      throw new Error('Instagram account is unavailable');
    }

    const accountRepository =
      await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
        input.workspaceId,
        'myahInstagramAccount',
        input.rolePermissionConfig,
      );
    const account = await accountRepository.findOne({
      where: {
        id: accountRecordId,
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
  }): Promise<AccessibleInstagramConversation | undefined> {
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
    const conversation = (await repository.findOne({
      where: {
        id: input.conversationRecordId,
        deletedAt: IsNull(),
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
      },
      select: { id: true, instagramAccountId: true },
    })) as AccessibleInstagramConversation | null;
    if (!conversation) {
      throw new Error('Active Unipile conversation is unavailable');
    }

    return conversation;
  }

  private async getActiveAccountRecordId(
    workspaceId: string,
  ): Promise<string | null> {
    const bindings = await this.accountBindingRepository.find(workspaceId, {
      take: 2,
      where: {
        status: UnipileInstagramAccountBindingStatus.ACTIVE,
        deactivatedAt: IsNull(),
      },
    });
    if (bindings.length !== 1) {
      return null;
    }

    return bindings[0].workspaceInstagramAccountRecordId;
  }
}
