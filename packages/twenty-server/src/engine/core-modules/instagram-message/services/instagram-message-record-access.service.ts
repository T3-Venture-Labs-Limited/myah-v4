import { type InstagramMessageConfirmedDestinationSource } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { isInstagramComposerReady } from './instagram-message-composer-readiness.util';
import { Injectable } from '@nestjs/common';

import { IsNull, Not } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
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

  async getConfirmedDestination(input: {
    workspaceId: string;
    rolePermissionConfig: RolePermissionConfig;
    source: InstagramMessageConfirmedDestinationSource;
  }): Promise<{
    creatorRecordId: string;
    conversationRecordId: string;
  } | null> {
    const { snapshot, providerChatId, providerMessageId, contentDigest } =
      input.source;
    if (
      snapshot.actionKind === 'REPLY' &&
      snapshot.providerChatId !== providerChatId
    )
      return null;
    try {
      const binding = await this.accountBindingRepository.findOne(
        input.workspaceId,
        {
          where: {
            id: snapshot.accountBindingId,
            workspaceInstagramAccountRecordId:
              snapshot.instagramAccountRecordId,
            unipileAccountId: snapshot.unipileAccountId,
            instagramUserId: snapshot.instagramUserId,
            status: UnipileInstagramAccountBindingStatus.ACTIVE,
            deactivatedAt: IsNull(),
          },
        },
      );
      if (!binding) return null;
      const repository = (name: string) =>
        this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
          input.workspaceId,
          name,
          input.rolePermissionConfig,
        );
      const creator = await (
        await repository('creator')
      ).findOne({
        where: { id: snapshot.creatorRecordId, deletedAt: IsNull() },
        select: { id: true },
      });
      const account = await (
        await repository('myahInstagramAccount')
      ).findOne({
        where: {
          id: snapshot.instagramAccountRecordId,
          deletedAt: IsNull(),
          status: 'ACTIVE',
          unipileAccountId: snapshot.unipileAccountId,
        },
        select: { id: true },
      });
      if (!creator || !account) return null;
      const conversations = await (
        await repository('myahSocialConversation')
      ).find({
        where: {
          provider: 'UNIPILE',
          instagramAccountId: snapshot.instagramAccountRecordId,
          providerConversationId: providerChatId,
          deletedAt: IsNull(),
        },
        select: {
          id: true,
          creatorId: true,
          recipientIgsid: true,
          lifecycle: true,
        },
        take: 2,
      });
      if (
        conversations.length !== 1 ||
        conversations[0].creatorId !== snapshot.creatorRecordId ||
        conversations[0].recipientIgsid !== snapshot.providerMessagingId ||
        conversations[0].lifecycle !== 'ACTIVE' ||
        (snapshot.actionKind === 'REPLY' &&
          conversations[0].id !== snapshot.conversationRecordId)
      )
        return null;
      const messages = await (
        await repository('myahSocialMessage')
      ).find({
        where: {
          conversationId: conversations[0].id,
          provider: 'UNIPILE',
          providerMessageId,
          deletedAt: IsNull(),
        },
        select: {
          id: true,
          text: true,
          direction: true,
          providerCreatedAt: true,
        },
        take: 2,
      });
      if (
        messages.length !== 1 ||
        messages[0].direction !== 'OUTBOUND' ||
        typeof messages[0].text !== 'string' ||
        computeActionContentDigest(messages[0].text) !== contentDigest ||
        !messages[0].providerCreatedAt ||
        !Number.isFinite(new Date(messages[0].providerCreatedAt).getTime())
      )
        return null;
      return {
        creatorRecordId: creator.id,
        conversationRecordId: conversations[0].id,
      };
    } catch (error) {
      if (this.isPermissionDenied(error)) return null;
      throw error;
    }
  }

  async getComposerAccount(input: {
    workspaceId: string;
    rolePermissionConfig: RolePermissionConfig;
  }): Promise<{
    bindingId: string;
    instagramAccountRecordId: string;
    unipileAccountId: string;
    instagramUserId: string;
    label: string;
  } | null> {
    try {
      if (
        !(await isInstagramComposerReady(
          this.globalWorkspaceOrmManager,
          input.workspaceId,
        ))
      )
        return null;
      const bindings = await this.accountBindingRepository.find(
        input.workspaceId,
        {
          take: 2,
          where: {
            status: UnipileInstagramAccountBindingStatus.ACTIVE,
            deactivatedAt: IsNull(),
          },
        },
      );
      if (bindings.length !== 1) return null;

      const [binding] = bindings;
      if (
        !this.isNonEmptyOpaqueId(binding.id) ||
        !this.isNonEmptyOpaqueId(binding.workspaceInstagramAccountRecordId) ||
        !this.isNonEmptyOpaqueId(binding.unipileAccountId) ||
        !this.isNonEmptyOpaqueId(binding.instagramUserId)
      ) {
        return null;
      }

      const accountRepository =
        await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
          input.workspaceId,
          'myahInstagramAccount',
          input.rolePermissionConfig,
        );
      const account = (await accountRepository.findOne({
        where: {
          id: binding.workspaceInstagramAccountRecordId,
          deletedAt: IsNull(),
          status: 'ACTIVE',
          unipileAccountId: binding.unipileAccountId,
        },
        select: { id: true, label: true },
      })) as (ObjectRecord & { id: string; label: string | null }) | null;
      if (!account || !this.isNonEmptyOpaqueId(account.id)) return null;

      return {
        bindingId: binding.id,
        instagramAccountRecordId: account.id,
        unipileAccountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
        label:
          typeof account.label === 'string'
            ? account.label
            : 'Instagram account',
      };
    } catch (error) {
      if (this.isPermissionDenied(error)) return null;
      throw error;
    }
  }

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

  private isNonEmptyOpaqueId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }

  private isPermissionDenied(error: unknown): boolean {
    return (
      error instanceof PermissionsException &&
      error.code === PermissionsExceptionCode.PERMISSION_DENIED
    );
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
