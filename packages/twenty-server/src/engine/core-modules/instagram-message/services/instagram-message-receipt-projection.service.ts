import { Inject, Injectable } from '@nestjs/common';

import { IsNull } from 'typeorm';

import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { type ActionReceiptProjectionInput } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  INSTAGRAM_MESSAGE_AUTHORITY_READER,
  type InstagramMessageAuthorityReader,
} from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { InstagramMessageDraftService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft.service';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import {
  hasContradictoryUnipileInstagramSenderEvidence,
  unipileInstagramMessageDirection,
} from 'src/modules/myah-unipile/types/unipile-v1.type';

@Injectable()
export class InstagramMessageReceiptProjectionService {
  constructor(
    @Inject(INSTAGRAM_MESSAGE_AUTHORITY_READER)
    private readonly authorityReader: InstagramMessageAuthorityReader,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    private readonly accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
    private readonly unipileClient: UnipileV1ClientService,
    private readonly projectionService: UnipileInstagramProjectionService,
    private readonly draftService: InstagramMessageDraftService,
  ) {}

  async project(input: ActionReceiptProjectionInput): Promise<void> {
    if (input.actionName !== 'send_instagram_message') {
      throw new Error('An Instagram message v2 projection is required');
    }
    if (!input.providerExternalMessageId || !input.providerThreadExternalId) {
      throw new Error(
        'Accepted Instagram provider identifiers are unavailable',
      );
    }

    // Current authority/provider matches cannot verify historical START identity.
    if (input.actionVersion === 2 && input.actionKind === 'START_CHAT') {
      throw new Error('Instagram first-contact projection is unavailable');
    }

    const recovery =
      input.actionVersion === 3
        ? await this.authorityReader.readV3RecoveryContext({
            workspaceId: input.workspaceId,
            binding: input,
          })
        : null;
    const authority = recovery
      ? null
      : await this.authorityReader.rebuildForReconciliation({
          workspaceId: input.workspaceId,
          binding: input,
        });
    const snapshot = recovery?.snapshot;
    const account = snapshot
      ? {
          bindingId: snapshot.accountBindingId,
          unipileAccountId: snapshot.unipileAccountId,
          instagramUserId: snapshot.instagramUserId,
        }
      : authority!.canonicalGraph.account;
    const attendeeId =
      snapshot?.providerMessagingId ??
      authority!.canonicalGraph.draft.recipientProviderId;
    if (
      snapshot?.actionKind === 'REPLY' &&
      input.providerThreadExternalId !== snapshot.providerChatId
    )
      throw new Error(
        'Accepted Instagram conversation does not match approval',
      );
    const accountBinding = await this.accountBindingRepository.findOne(
      input.workspaceId,
      {
        where: {
          id: account.bindingId,
          ...(snapshot
            ? {
                workspaceInstagramAccountRecordId:
                  snapshot.instagramAccountRecordId,
                unipileAccountId: snapshot.unipileAccountId,
                instagramUserId: snapshot.instagramUserId,
              }
            : {}),
          status: UnipileInstagramAccountBindingStatus.ACTIVE,
          deactivatedAt: IsNull(),
        },
      },
    );
    if (!accountBinding) {
      throw new Error('Accepted Instagram account binding is unavailable');
    }

    const chat = await this.unipileClient.getChat({
      accountId: account.unipileAccountId,
      chatId: input.providerThreadExternalId,
      expectedAttendeeId: attendeeId,
    });
    if (
      snapshot &&
      (chat.accountId !== snapshot.unipileAccountId ||
        chat.chatId !== input.providerThreadExternalId ||
        chat.accountType !== 'INSTAGRAM' ||
        chat.type !== 'ONE_TO_ONE' ||
        chat.attendeeProviderId !== snapshot.providerMessagingId)
    )
      throw new Error(
        'Accepted Instagram conversation does not match approval',
      );
    const message = await this.unipileClient.getMessage({
      accountId: account.unipileAccountId,
      chatId: input.providerThreadExternalId,
      messageId: input.providerExternalMessageId,
    });
    if (
      (snapshot &&
        (message.accountId !== snapshot.unipileAccountId ||
          message.chatId !== input.providerThreadExternalId ||
          message.messageId !== input.providerExternalMessageId ||
          message.timestamp === null ||
          !Number.isFinite(Date.parse(message.timestamp)))) ||
      hasContradictoryUnipileInstagramSenderEvidence(
        message,
        account.instagramUserId,
        chat.attendeeProviderId,
      ) ||
      unipileInstagramMessageDirection(
        message,
        account.instagramUserId,
        chat.attendeeProviderId,
      ) !== 'OUTBOUND' ||
      message.deleted ||
      message.hidden ||
      message.isEvent ||
      message.text == null ||
      computeActionContentDigest(message.text) !== input.contentDigest
    ) {
      throw new Error(
        'Accepted Instagram message does not match the approved content',
      );
    }

    const workspace = { id: input.workspaceId } as WorkspaceEntity;
    const { conversationRecordId } =
      await this.projectionService.upsertVerifiedChat({
        workspace,
        binding: accountBinding,
        chat,
        ...(snapshot
          ? {
              creatorRecordId: snapshot.creatorRecordId,
              expectedConversationRecordId:
                snapshot.conversationRecordId ?? undefined,
            }
          : {}),
      });
    await this.projectionService.upsertVerifiedMessage({
      workspace,
      binding: accountBinding,
      chat,
      conversationRecordId,
      message,
      ...(snapshot ? { creatorRecordId: snapshot.creatorRecordId } : {}),
      triageMode: 'LIVE',
      sourceGenerationId: `action-receipt:${input.receiptId}`,
    });
    await this.draftService.markSent({
      workspaceId: input.workspaceId,
      draftId: input.draftId,
      contentDigest: input.contentDigest,
    });
  }
}
