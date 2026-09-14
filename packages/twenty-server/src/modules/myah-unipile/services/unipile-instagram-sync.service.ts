import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  IsNull,
  type DataSource,
  type EntityManager,
  type Repository,
} from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramChatCheckpointEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-chat-checkpoint.entity';
import {
  UnipileInstagramSyncRunEntity,
  UnipileInstagramSyncRunStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-sync-run.entity';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import {
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import {
  type UnipileInstagramChat,
  type UnipileInstagramMessage,
  unipileInstagramMessageDirection,
} from 'src/modules/myah-unipile/types/unipile-v1.type';

const PAGE_SIZE = 250;
const MAX_PAGES = 10_000;
const OVERLAP_MILLISECONDS = 60 * 60 * 1000;

class SynchronizationFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class UnipileInstagramSyncService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
    private readonly client: UnipileV1ClientService,
    private readonly accountService: UnipileInstagramAccountService,
    private readonly projectionService: UnipileInstagramProjectionService,
  ) {}

  async synchronizeBinding(
    bindingId: string,
  ): Promise<'COMPLETED' | 'ALREADY_RUNNING'> {
    this.availabilityService.assertEnabled();

    const queryRunner = this.dataSource.createQueryRunner();
    const lockKey = `unipile-instagram-sync:${bindingId}`;
    let lockAcquired = false;

    try {
      await queryRunner.connect();
      const [{ pg_try_advisory_lock: acquired }] = await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1))',
        [lockKey],
      );
      lockAcquired = acquired === true;

      if (!lockAcquired) {
        return 'ALREADY_RUNNING';
      }

      return await this.synchronizeLocked(bindingId, queryRunner.manager);
    } finally {
      try {
        if (lockAcquired) {
          await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
            lockKey,
          ]);
        }
      } finally {
        await queryRunner.release();
      }
    }
  }

  private async synchronizeLocked(
    bindingId: string,
    manager: EntityManager,
  ): Promise<'COMPLETED'> {
    const bindingRepository = manager.getRepository(
      UnipileInstagramAccountBindingEntity,
    );
    const workspaceRepository = manager.getRepository(WorkspaceEntity);
    const runRepository = manager.getRepository(UnipileInstagramSyncRunEntity);
    const checkpointRepository = manager.getRepository(
      UnipileInstagramChatCheckpointEntity,
    );
    const binding = await bindingRepository.findOne({
      where: {
        id: bindingId,
        status: UnipileInstagramAccountBindingStatus.ACTIVE,
        deactivatedAt: IsNull(),
      },
    });

    if (!binding) {
      throw new SynchronizationFailure(
        'UNIPILE_BINDING_INACTIVE',
        'Instagram account binding is not active',
      );
    }

    const status =
      await this.accountService.reconcileBoundAccountStatus(bindingId);
    if (status !== UnipileInstagramAccountBindingStatus.ACTIVE) {
      throw new SynchronizationFailure(
        'UNIPILE_BINDING_INACTIVE',
        'Instagram account binding is not active',
      );
    }

    const workspace = await workspaceRepository.findOne({
      where: { id: binding.workspaceId },
    });

    if (!workspace) {
      throw new SynchronizationFailure(
        'UNIPILE_WORKSPACE_NOT_FOUND',
        'Instagram workspace is unavailable',
      );
    }

    let run = await runRepository.findOne({
      where: { bindingId, status: UnipileInstagramSyncRunStatus.RUNNING },
    });

    if (!run) {
      const previousRun = await runRepository.findOne({
        where: { bindingId, status: UnipileInstagramSyncRunStatus.COMPLETED },
        order: { completedAt: 'DESC' },
      });
      const overlapAfter = previousRun?.completedChatHighWaterAt
        ? new Date(
            previousRun.completedChatHighWaterAt.getTime() -
              OVERLAP_MILLISECONDS,
          )
        : null;

      run = runRepository.create({
        bindingId,
        status: UnipileInstagramSyncRunStatus.RUNNING,
        overlapAfter,
        chatCursor: null,
        currentChatId: null,
        currentChatAttendeeId: null,
        messageCursor: null,
        completedChatHighWaterAt: null,
        completedAt: null,
        failureCode: null,
        failureReason: null,
      });
      await runRepository.save(run);
    }

    try {
      const resumingChatId = run.currentChatId;
      const resumingChatAttendeeId = run.currentChatAttendeeId;

      if (resumingChatId) {
        if (!resumingChatAttendeeId) {
          throw new SynchronizationFailure(
            'UNIPILE_RESUME_CHAT_IDENTITY_MISSING',
            'Instagram synchronization cannot safely resume a chat',
          );
        }

        await this.synchronizeChat({
          workspace,
          binding,
          run,
          runRepository,
          checkpointRepository,
          chatId: resumingChatId,
          expectedAttendeeId: resumingChatAttendeeId,
        });
      }

      await this.synchronizeChatPages({
        workspace,
        binding,
        run,
        runRepository,
        checkpointRepository,
      });

      if (run.completedChatHighWaterAt) {
        await this.projectionService.markCompletedChatSync({
          workspace,
          binding,
          workspaceInstagramAccountRecordId:
            binding.workspaceInstagramAccountRecordId,
          completedChatSyncAt: run.completedChatHighWaterAt.toISOString(),
        });
      }

      run.status = UnipileInstagramSyncRunStatus.COMPLETED;
      run.chatCursor = null;
      run.currentChatId = null;
      run.currentChatAttendeeId = null;
      run.messageCursor = null;
      run.completedAt = new Date();
      run.failureCode = null;
      run.failureReason = null;
      await runRepository.save(run);

      return 'COMPLETED';
    } catch (error) {
      const failure =
        error instanceof SynchronizationFailure
          ? error
          : error instanceof UnipileReadError && !error.retryable
            ? new SynchronizationFailure(error.code, error.message)
            : null;

      if (failure) {
        run.status = UnipileInstagramSyncRunStatus.FAILED;
        run.completedAt = new Date();
        run.failureCode = failure.code;
        run.failureReason = failure.message;
        await runRepository.save(run);
      }

      throw error;
    }
  }

  private async synchronizeChatPages(input: {
    workspace: WorkspaceEntity;
    binding: UnipileInstagramAccountBindingEntity;
    run: UnipileInstagramSyncRunEntity;
    runRepository: Repository<UnipileInstagramSyncRunEntity>;
    checkpointRepository: Repository<UnipileInstagramChatCheckpointEntity>;
  }): Promise<void> {
    const seenCursors = new Set<string>();
    let cursor = input.run.chatCursor;
    let pages = 0;

    while (true) {
      if (++pages > MAX_PAGES) {
        throw new SynchronizationFailure(
          'UNIPILE_CHAT_PAGE_LIMIT_EXCEEDED',
          'Instagram chat pagination exceeded its page limit',
        );
      }

      const page = await this.client.listChats({
        accountId: input.binding.unipileAccountId,
        cursor,
        after: cursor ? null : (input.run.overlapAfter?.toISOString() ?? null),
        limit: PAGE_SIZE,
      });

      for (const listedChat of page.chats) {
        this.assertChatBelongsToBinding(
          listedChat,
          input.binding,
          listedChat.chatId,
          listedChat.attendeeProviderId,
        );
        await this.synchronizeChat({
          ...input,
          chatId: listedChat.chatId,
          expectedAttendeeId: listedChat.attendeeProviderId,
        });
      }

      if (!page.nextCursor) {
        return;
      }
      if (seenCursors.has(page.nextCursor)) {
        throw new SynchronizationFailure(
          'UNIPILE_CHAT_CURSOR_REPEATED',
          'Instagram chat pagination repeated a cursor',
        );
      }

      seenCursors.add(page.nextCursor);
      input.run.chatCursor = page.nextCursor;
      await input.runRepository.save(input.run);
      cursor = page.nextCursor;
    }
  }

  private async synchronizeChat(input: {
    workspace: WorkspaceEntity;
    binding: UnipileInstagramAccountBindingEntity;
    run: UnipileInstagramSyncRunEntity;
    runRepository: Repository<UnipileInstagramSyncRunEntity>;
    checkpointRepository: Repository<UnipileInstagramChatCheckpointEntity>;
    chatId: string;
    expectedAttendeeId: string;
  }): Promise<void> {
    const chat = await this.client.getChat({
      accountId: input.binding.unipileAccountId,
      chatId: input.chatId,
      expectedAttendeeId: input.expectedAttendeeId,
    });
    this.assertChatBelongsToBinding(
      chat,
      input.binding,
      input.chatId,
      input.expectedAttendeeId,
    );

    input.run.currentChatId = chat.chatId;
    input.run.currentChatAttendeeId = chat.attendeeProviderId;
    await input.runRepository.save(input.run);

    const { conversationRecordId } =
      await this.projectionService.upsertVerifiedChat({
        workspace: input.workspace,
        binding: input.binding,
        chat,
      });
    const checkpoint = await input.checkpointRepository.findOne({
      where: {
        bindingId: input.binding.id,
        unipileChatId: chat.chatId,
      },
    });
    const messageHighWaterAt = await this.synchronizeMessagePages({
      ...input,
      chat,
      conversationRecordId,
      after: checkpoint?.completedMessageHighWaterAt
        ? new Date(
            checkpoint.completedMessageHighWaterAt.getTime() -
              OVERLAP_MILLISECONDS,
          )
        : null,
    });

    const completedMessageHighWaterAt = this.latestDate(
      checkpoint?.completedMessageHighWaterAt ?? null,
      messageHighWaterAt,
    );
    const savedCheckpoint =
      checkpoint ??
      input.checkpointRepository.create({
        bindingId: input.binding.id,
        unipileChatId: chat.chatId,
        completedMessageHighWaterAt: null,
      });
    savedCheckpoint.completedMessageHighWaterAt = completedMessageHighWaterAt;
    await input.checkpointRepository.save(savedCheckpoint);

    if (completedMessageHighWaterAt) {
      await this.projectionService.markCompletedMessageSync({
        workspace: input.workspace,
        binding: input.binding,
        conversationRecordId,
        completedMessageSyncAt: completedMessageHighWaterAt.toISOString(),
      });
    }

    const chatHighWaterAt = this.asDate(chat.timestamp);
    input.run.completedChatHighWaterAt = this.latestDate(
      input.run.completedChatHighWaterAt,
      chatHighWaterAt,
    );
    input.run.currentChatId = null;
    input.run.currentChatAttendeeId = null;
    input.run.messageCursor = null;
    await input.runRepository.save(input.run);
  }

  private async synchronizeMessagePages(input: {
    workspace: WorkspaceEntity;
    binding: UnipileInstagramAccountBindingEntity;
    run: UnipileInstagramSyncRunEntity;
    runRepository: Repository<UnipileInstagramSyncRunEntity>;
    chat: UnipileInstagramChat;
    conversationRecordId: string;
    after: Date | null;
  }): Promise<Date | null> {
    const seenCursors = new Set<string>();
    let cursor = input.run.messageCursor;
    let highWaterAt: Date | null = null;
    let pages = 0;

    while (true) {
      if (++pages > MAX_PAGES) {
        throw new SynchronizationFailure(
          'UNIPILE_MESSAGE_PAGE_LIMIT_EXCEEDED',
          'Instagram message pagination exceeded its page limit',
        );
      }

      const page = await this.client.listMessages({
        accountId: input.binding.unipileAccountId,
        chatId: input.chat.chatId,
        cursor,
        after: cursor ? null : (input.after?.toISOString() ?? null),
        limit: PAGE_SIZE,
      });

      for (const listedMessage of page.messages) {
        if (
          listedMessage.deleted ||
          listedMessage.hidden ||
          listedMessage.isEvent
        ) {
          continue;
        }

        this.assertMessageBelongsToChat(
          listedMessage,
          input.binding,
          input.chat,
          listedMessage.messageId,
        );
        const message = await this.client.getMessage({
          accountId: input.binding.unipileAccountId,
          chatId: input.chat.chatId,
          messageId: listedMessage.messageId,
        });
        this.assertMessageBelongsToChat(
          message,
          input.binding,
          input.chat,
          listedMessage.messageId,
        );
        if (message.deleted || message.hidden || message.isEvent) {
          continue;
        }

        const deliveryState = this.deliveryState(
          message,
          input.binding,
          input.chat,
        );
        await this.projectionService.upsertVerifiedMessage({
          workspace: input.workspace,
          binding: input.binding,
          chat: input.chat,
          conversationRecordId: input.conversationRecordId,
          message,
          deliveryState,
          ...(deliveryState === 'READ' || deliveryState === 'DELIVERED'
            ? { deliveryStateUpdatedAt: message.timestamp }
            : {}),
        });
        highWaterAt = this.latestDate(
          highWaterAt,
          this.asDate(message.timestamp),
        );
      }

      if (!page.nextCursor) {
        return highWaterAt;
      }
      if (seenCursors.has(page.nextCursor)) {
        throw new SynchronizationFailure(
          'UNIPILE_MESSAGE_CURSOR_REPEATED',
          'Instagram message pagination repeated a cursor',
        );
      }

      seenCursors.add(page.nextCursor);
      input.run.messageCursor = page.nextCursor;
      await input.runRepository.save(input.run);
      cursor = page.nextCursor;
    }
  }

  private deliveryState(
    message: UnipileInstagramMessage,
    binding: UnipileInstagramAccountBindingEntity,
    chat: UnipileInstagramChat,
  ): 'UNKNOWN' | 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ' {
    if (
      unipileInstagramMessageDirection(
        message,
        binding.instagramUserId,
        chat.attendeeProviderId,
      ) === 'OUTBOUND'
    ) {
      if (message.seen) {
        return 'READ';
      }

      return message.delivered ? 'DELIVERED' : 'SENT';
    }

    return unipileInstagramMessageDirection(
      message,
      binding.instagramUserId,
      chat.attendeeProviderId,
    ) === 'INBOUND'
      ? 'RECEIVED'
      : 'UNKNOWN';
  }

  private assertChatBelongsToBinding(
    chat: UnipileInstagramChat,
    binding: UnipileInstagramAccountBindingEntity,
    expectedChatId: string,
    expectedAttendeeId: string,
  ): void {
    if (
      chat.accountId !== binding.unipileAccountId ||
      chat.chatId !== expectedChatId ||
      chat.attendeeProviderId !== expectedAttendeeId
    ) {
      throw new SynchronizationFailure(
        'UNIPILE_CHAT_BINDING_MISMATCH',
        'Instagram chat does not belong to the active binding',
      );
    }
  }

  private assertMessageBelongsToChat(
    message: UnipileInstagramMessage,
    binding: UnipileInstagramAccountBindingEntity,
    chat: UnipileInstagramChat,
    expectedMessageId: string,
  ): void {
    if (
      message.accountId !== binding.unipileAccountId ||
      message.chatId !== chat.chatId ||
      message.messageId !== expectedMessageId
    ) {
      throw new SynchronizationFailure(
        'UNIPILE_MESSAGE_BINDING_MISMATCH',
        'Instagram message does not belong to the active binding chat',
      );
    }
  }

  private asDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private latestDate(left: Date | null, right: Date | null): Date | null {
    if (!left) {
      return right;
    }

    if (!right || left >= right) {
      return left;
    }

    return right;
  }
}
