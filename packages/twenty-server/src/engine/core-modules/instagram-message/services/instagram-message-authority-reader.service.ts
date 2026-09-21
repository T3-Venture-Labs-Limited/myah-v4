import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type Repository } from 'typeorm';

import { resolveInstagramRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';
import {
  type InstagramMessageActionAuthority,
  type InstagramMessageV3ActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import { InstagramMessageLocalAuthorityReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

@Injectable()
export class InstagramMessageAuthorityReaderService extends InstagramMessageLocalAuthorityReaderService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    workspaceRepository: Repository<WorkspaceEntity>,
    globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ObjectMetadataEntity)
    objectMetadataRepository: Repository<ObjectMetadataEntity>,
    private readonly unipileClient: UnipileV1ClientService,
  ) {
    super(
      workspaceRepository,
      globalWorkspaceOrmManager,
      accountBindingRepository,
      objectMetadataRepository,
    );
  }

  async createDirectAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    draftId: string;
    expectedRevision: number;
  }): Promise<InstagramMessageV3ActionAuthority> {
    return this.createFreshReplyAuthority({ ...input, threadId: null });
  }

  async createThreadReplyAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    draftId: string;
  }): Promise<InstagramMessageV3ActionAuthority> {
    if (!input.threadId)
      throw new Error('Instagram approval thread is unavailable');
    return this.createFreshReplyAuthority(input);
  }

  private async createFreshReplyAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    draftId: string;
    threadId: string | null;
    expectedRevision?: number;
  }): Promise<InstagramMessageV3ActionAuthority> {
    const workspace = await this.getWorkspace(input.workspaceId);
    const accountBinding = await this.getActiveAccountBinding(
      input.workspaceId,
    );
    const draft = await this.loadDraft(workspace, input.draftId);
    if (
      draft.kind !== 'REPLY' ||
      !draft.creatorId ||
      !draft.conversationId ||
      !draft.providerConversationId ||
      (input.expectedRevision !== undefined &&
        Number(draft.revision) !== input.expectedRevision)
    ) {
      throw new Error('Instagram reply draft is unavailable');
    }
    const recipient = resolveInstagramRecipient({
      instagramUsername: draft.creatorInstagramUsername,
      instagramUrl: draft.creatorInstagramUrl,
      instagramLink: {
        primaryLinkUrl: draft.creatorInstagramLinkPrimaryLinkUrl,
      },
    });
    const profile = await this.unipileClient.getInstagramMessagingProfile({
      accountId: accountBinding.unipileAccountId,
      username: recipient.normalizedUsername,
    });
    if (
      profile.username !== recipient.normalizedUsername ||
      !profile.providerId ||
      !profile.providerMessagingId
    ) {
      throw new Error('Instagram recipient identity is unavailable');
    }
    const authority = await this.buildAuthority({
      workspace,
      accountBinding,
      draft,
      approvalContext: {
        initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
        threadId: input.threadId,
        interactionContextType: input.threadId
          ? null
          : 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        interactionContextId: input.threadId ? null : input.draftId,
      },
      v3: {
        composerInputDigest: null,
        snapshot: {
          actionKind: 'REPLY',
          publicIdentifier: recipient.normalizedUsername,
          providerId: profile.providerId,
          providerMessagingId: profile.providerMessagingId,
          creatorRecordId: draft.creatorId,
          accountBindingId: accountBinding.id,
          instagramAccountRecordId:
            accountBinding.workspaceInstagramAccountRecordId,
          unipileAccountId: accountBinding.unipileAccountId,
          instagramUserId: accountBinding.instagramUserId,
          conversationRecordId: draft.conversationId,
          providerChatId: draft.providerConversationId,
          attendeeProviderId: profile.providerMessagingId,
          recipientSourceValues: recipient.sourceFields.map((field) => ({
            field,
            value:
              field === 'instagramUsername'
                ? draft.creatorInstagramUsername!
                : field === 'instagramUrl'
                  ? draft.creatorInstagramUrl!
                  : draft.creatorInstagramLinkPrimaryLinkUrl!,
          })),
        },
      },
    });
    await this.assertReadyAfterReservation(authority);
    if (authority.expectedActionBinding.actionVersion !== 3)
      throw new Error('Instagram v3 identity is required');
    return {
      ...authority,
      expectedActionBinding: authority.expectedActionBinding,
    };
  }

  private async assertExactV3Route(
    authority: InstagramMessageActionAuthority,
  ): Promise<void> {
    const binding = authority.expectedActionBinding;
    if (binding.actionVersion !== 3)
      throw new Error('Instagram v3 identity is required');
    const snapshot = binding.instagramMessageSnapshot;
    const matchingChats = new Set<string>();
    const seenChats = new Map<string, string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    for (let pageCount = 0; pageCount < 100; pageCount += 1) {
      const page = await this.unipileClient.listChats({
        accountId: snapshot.unipileAccountId,
        cursor,
        after: null,
        limit: 250,
      });
      for (const chat of page.chats) {
        if (
          chat.accountId !== snapshot.unipileAccountId ||
          chat.type !== 'ONE_TO_ONE' ||
          (seenChats.has(chat.chatId) &&
            seenChats.get(chat.chatId) !== chat.attendeeProviderId)
        ) {
          throw new Error('Instagram conversation evidence changed');
        }
        seenChats.set(chat.chatId, chat.attendeeProviderId);
        if (chat.attendeeProviderId === snapshot.providerMessagingId)
          matchingChats.add(chat.chatId);
      }
      if (!page.nextCursor) break;
      if (seenCursors.has(page.nextCursor) || pageCount === 99)
        throw new Error('Unipile chat traversal is incomplete');
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    if (snapshot.actionKind === 'START_CHAT') {
      if (matchingChats.size)
        throw new Error(
          'START_CHAT authority cannot target an existing conversation',
        );
      await this.assertNoLocalCurrentConversation(
        await this.getWorkspace(binding.workspaceId),
        await this.getActiveAccountBinding(binding.workspaceId),
        snapshot.publicIdentifier,
        snapshot.providerMessagingId,
      );
    } else {
      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      const localChats = await dataSource.query<
        Array<{
          id: string;
          providerConversationId: string;
          recipientIgsid: string;
        }>
      >(
        `SELECT "id", "providerConversationId", "recipientIgsid" FROM "${getWorkspaceSchemaName(binding.workspaceId)}"."_myahSocialConversation"
         WHERE "provider" = 'UNIPILE' AND "lifecycle" = 'ACTIVE' AND "deletedAt" IS NULL AND "instagramAccountId" = $1
         AND (lower("recipientUsername") = $2 OR "recipientIgsid" = $3) LIMIT 2`,
        [
          snapshot.instagramAccountRecordId,
          snapshot.publicIdentifier,
          snapshot.providerMessagingId,
        ],
        undefined,
        { shouldBypassPermissionChecks: true },
      );
      if (
        localChats.length !== 1 ||
        localChats[0].id !== snapshot.conversationRecordId ||
        localChats[0].providerConversationId !== snapshot.providerChatId ||
        localChats[0].recipientIgsid !== snapshot.attendeeProviderId
      )
        throw new Error('Instagram conversation evidence changed');
      if (
        matchingChats.size !== 1 ||
        !matchingChats.has(snapshot.providerChatId)
      )
        throw new Error('Instagram conversation evidence changed');
      const chat = await this.unipileClient.getChat({
        accountId: snapshot.unipileAccountId,
        chatId: snapshot.providerChatId,
        expectedAttendeeId: snapshot.attendeeProviderId,
      });
      if (
        chat.chatId !== snapshot.providerChatId ||
        chat.accountId !== snapshot.unipileAccountId ||
        chat.type !== 'ONE_TO_ONE' ||
        chat.attendeeProviderId !== snapshot.attendeeProviderId
      )
        throw new Error('Instagram conversation evidence changed');
    }
  }

  async assertReadyAfterReservation(
    authority: InstagramMessageActionAuthority,
  ): Promise<void> {
    const { account, draft } = authority.canonicalGraph;
    const accountBinding = await this.getActiveAccountBinding(
      authority.expectedActionBinding.workspaceId,
    );
    if (
      accountBinding.id !== account.bindingId ||
      accountBinding.workspaceInstagramAccountRecordId !==
        account.workspaceInstagramAccountRecordId ||
      accountBinding.unipileAccountId !== account.unipileAccountId ||
      accountBinding.instagramUserId !== account.instagramUserId
    ) {
      throw new Error('Instagram account binding changed');
    }
    const binding = authority.expectedActionBinding;
    if (binding.actionVersion === 3) {
      const snapshot = binding.instagramMessageSnapshot;
      const profile = await this.unipileClient.getInstagramMessagingProfile({
        accountId: snapshot.unipileAccountId,
        username: snapshot.publicIdentifier,
      });
      if (
        profile.username !== snapshot.publicIdentifier ||
        profile.providerId !== snapshot.providerId ||
        profile.providerMessagingId !== snapshot.providerMessagingId
      )
        throw new Error('Instagram recipient identity changed');
      await this.assertExactV3Route(authority);
    } else if (draft.kind === 'START_CHAT') {
      const workspace = await this.getWorkspace(
        authority.expectedActionBinding.workspaceId,
      );
      await this.assertNoCurrentConversation(
        workspace,
        accountBinding,
        draft.recipientUsername,
        draft.recipientProviderId,
      );
    } else {
      await this.unipileClient.getChat({
        accountId: account.unipileAccountId,
        chatId: draft.providerConversationId!,
        expectedAttendeeId: draft.recipientProviderId,
      });
    }

    // Recompare current local fingerprints after provider reads, before dispatch.
    // The draft lock does not serialize ordinary Creator edits.
    await this.rebuildExecutionAuthority({
      workspaceId: authority.expectedActionBinding.workspaceId,
      binding: authority.expectedActionBinding,
    });
  }

  private async assertNoCurrentConversation(
    workspace: FlatWorkspace,
    accountBinding: UnipileInstagramAccountBindingEntity,
    recipientUsername: string,
    recipientProviderId: string,
  ): Promise<void> {
    await this.assertNoLocalCurrentConversation(
      workspace,
      accountBinding,
      recipientUsername,
      recipientProviderId,
    );

    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    let pageCount = 0;
    do {
      const page = await this.unipileClient.listChats({
        accountId: accountBinding.unipileAccountId,
        cursor,
        after: null,
        limit: 250,
      });
      if (
        page.chats.some(
          ({ attendeeProviderId }) =>
            attendeeProviderId === recipientProviderId,
        )
      ) {
        throw new Error(
          'START_CHAT authority cannot target an existing conversation',
        );
      }
      pageCount += 1;
      if (
        page.nextCursor &&
        (seenCursors.has(page.nextCursor) || pageCount >= 100)
      ) {
        throw new Error('Unipile chat traversal is incomplete');
      }
      if (page.nextCursor) seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
  }
}
