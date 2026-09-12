import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { MessageChannelType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';
import { type PersistSentMessageInput } from 'src/modules/messaging/message-outbound-manager/types/persist-sent-message-input.type';
import { type PersistedSentMessage } from 'src/modules/messaging/message-outbound-manager/types/persisted-sent-message.type';
import { formatSentMessage } from 'src/modules/messaging/message-outbound-manager/utils/format-sent-message.util';

@Injectable()
export class SentMessagePersistenceService {
  constructor(
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    private readonly saveMessagesAndEnqueueContactCreationService: MessagingSaveMessagesAndEnqueueContactCreationService,
  ) {}

  async persistSentMessage(
    input: PersistSentMessageInput,
  ): Promise<PersistedSentMessage | undefined> {
    if (
      (input.expectedMessageId !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          input.expectedMessageId,
        )) ||
      (input.providerAcceptedAt !== undefined &&
        Number.isNaN(input.providerAcceptedAt.getTime()))
    ) {
      throw new Error('Deterministic sent Message evidence is invalid');
    }
    const suppliedRunner = input.transactionManager?.queryRunner;
    if (
      input.transactionManager !== undefined &&
      (!suppliedRunner?.isTransactionActive ||
        suppliedRunner.isReleased ||
        suppliedRunner.manager !== input.transactionManager)
    ) {
      throw new Error('Sent Message persistence requires active manager');
    }
    const messageChannelRepository = suppliedRunner
      ? suppliedRunner.manager.getRepository(MessageChannelEntity)
      : this.messageChannelRepository;
    const messageChannel = await messageChannelRepository.findOneOrFail({
      where: {
        id: input.messageChannelId,
        workspaceId: input.workspaceId,
      },
      relations: { connectedAccount: true },
    });

    const connectedAccount = messageChannel.connectedAccount;
    if (
      messageChannel.connectedAccountId !== connectedAccount.id ||
      connectedAccount.workspaceId !== input.workspaceId ||
      input.connectedAccount.id !== connectedAccount.id ||
      input.connectedAccount.workspaceId !== input.workspaceId
    ) {
      throw new Error('Connected account does not own the message channel');
    }

    const senderHandle = (
      messageChannel.type === MessageChannelType.EMAIL_GROUP
        ? connectedAccount.handle
        : messageChannel.handle
    )
      .trim()
      .toLowerCase();
    const connectedAccountHandles = new Set(
      [connectedAccount.handle, ...(connectedAccount.handleAliases ?? [])]
        .filter(isNonEmptyString)
        .map((handle) => handle.trim().toLowerCase()),
    );
    if (
      !isNonEmptyString(senderHandle) ||
      !connectedAccountHandles.has(senderHandle)
    ) {
      throw new Error(
        'Message channel sender is not a connected account alias',
      );
    }

    const messageToSave = formatSentMessage({
      ...input,
      connectedAccount: {
        ...connectedAccount,
        handle: senderHandle,
      },
    });

    const savedMessagesResult =
      await this.saveMessagesAndEnqueueContactCreationService.saveMessagesAndEnqueueContactCreation(
        [messageToSave],
        messageChannel,
        connectedAccount,
        input.workspaceId,
        input.transactionManager,
      );

    const messageId = savedMessagesResult?.messageExternalIdsAndIdsMap.get(
      messageToSave.externalId,
    );
    const messageThreadId =
      savedMessagesResult?.messageExternalIdToMessageThreadIdMap.get(
        messageToSave.externalId,
      );

    if (!isDefined(messageId) || !isDefined(messageThreadId)) {
      return undefined;
    }
    return { messageId, messageThreadId };
  }
}
