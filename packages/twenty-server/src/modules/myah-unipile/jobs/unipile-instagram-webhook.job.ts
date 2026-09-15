import { Scope } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import {
  UnipileInstagramWebhookEventEntity,
  UnipileInstagramWebhookEventStatus,
  UnipileInstagramWebhookEventType,
} from 'src/modules/myah-unipile/entities/unipile-instagram-webhook-event.entity';
import {
  isUnipileInstagramWebhookAccountStatus,
  UnipileInstagramAccountService,
} from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import { UnipileInstagramSyncQueue } from 'src/modules/myah-unipile/services/unipile-instagram-sync.queue';
import {
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';

const RETRY_BASE_DELAY_MS = 60_000;
const RETRY_MAX_DELAY_MS = 60 * 60 * 1000;

class UnipileInstagramWebhookFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type UnipileInstagramWebhookJobData = {
  eventId: string;
};

type ClaimedWebhookEvent = {
  binding: UnipileInstagramAccountBindingEntity | null;
  event: UnipileInstagramWebhookEventEntity;
};

@Processor({
  queueName: MessageQueue.messagingQueue,
  scope: Scope.REQUEST,
})
export class UnipileInstagramWebhookJob {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly client: UnipileV1ClientService,
    private readonly projectionService: UnipileInstagramProjectionService,
    private readonly accountService: UnipileInstagramAccountService,
    private readonly syncQueue: UnipileInstagramSyncQueue,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
  ) {}

  @Process(UnipileInstagramWebhookJob.name)
  async handle(data: UnipileInstagramWebhookJobData): Promise<void> {
    this.availabilityService.assertEnabled();

    const claimed = await this.claim(data.eventId);
    if (!claimed) {
      return;
    }

    if (!this.isStructurallyValid(claimed)) {
      await this.markFailed(claimed.event.id, {
        code: 'UNIPILE_WEBHOOK_EVENT_INVALID',
        message: 'Unipile Instagram webhook event is invalid',
      });
      return;
    }

    try {
      if (
        claimed.event.eventType ===
        UnipileInstagramWebhookEventType.ACCOUNT_STATUS
      ) {
        const accountStatus = claimed.event.accountStatus;

        if (!accountStatus) {
          throw new UnipileInstagramWebhookFailure(
            'UNIPILE_WEBHOOK_EVENT_INVALID',
            'Unipile Instagram webhook event is invalid',
          );
        }

        const status = await this.accountService.reconcileWebhookAccountStatus({
          bindingId: claimed.binding.id,
          status: accountStatus,
        });
        if (status === UnipileInstagramAccountBindingStatus.ACTIVE) {
          await this.syncQueue.enqueue(claimed.binding.id);
        }
      } else {
        const { unipileChatId, unipileMessageId, attendeeProviderId } =
          claimed.event;

        if (!unipileChatId || !unipileMessageId || !attendeeProviderId) {
          throw new UnipileInstagramWebhookFailure(
            'UNIPILE_WEBHOOK_EVENT_INVALID',
            'Unipile Instagram webhook event is invalid',
          );
        }

        const account = await this.client.getAccount(
          claimed.binding.unipileAccountId,
        );
        if (account.accountId !== claimed.binding.unipileAccountId) {
          throw new UnipileInstagramWebhookFailure(
            'UNIPILE_WEBHOOK_ACCOUNT_IDENTITY_MISMATCH',
            'Unable to verify Unipile Instagram account identity',
          );
        }
        if (account.instagramUserId !== claimed.binding.instagramUserId) {
          throw new UnipileInstagramWebhookFailure(
            'UNIPILE_WEBHOOK_INSTAGRAM_OWNER_MISMATCH',
            'Unable to verify Unipile Instagram account owner',
          );
        }
        if (account.sourceStatus !== 'OK') {
          throw new UnipileInstagramWebhookFailure(
            'UNIPILE_WEBHOOK_ACCOUNT_NOT_READY',
            'Unipile Instagram account is not ready',
          );
        }

        const chat = await this.client.getChat({
          accountId: claimed.binding.unipileAccountId,
          chatId: unipileChatId,
          expectedAttendeeId: attendeeProviderId,
        });
        const message = await this.client.getMessage({
          accountId: claimed.binding.unipileAccountId,
          chatId: unipileChatId,
          messageId: unipileMessageId,
        });
        const { conversationRecordId } =
          await this.projectionService.upsertVerifiedChat({
            binding: claimed.binding,
            chat,
            workspace: { id: claimed.binding.workspaceId },
          });

        await this.projectionService.upsertVerifiedMessage({
          binding: claimed.binding,
          chat,
          conversationRecordId,
          message,
          workspace: { id: claimed.binding.workspaceId },
          ...(claimed.event.deliveryState
            ? {
                deliveryState: claimed.event.deliveryState as
                  | 'DELIVERED'
                  | 'READ',
                deliveryStateUpdatedAt:
                  claimed.event.deliveryStateUpdatedAt?.toISOString() ?? null,
              }
            : {}),
        });
      }
    } catch (error) {
      if (this.isTerminalFailure(error)) {
        await this.markFailed(claimed.event.id, this.failure(error));
      } else {
        await this.markReceived(claimed.event.id);
      }
      throw error;
    }

    await this.markCompleted(claimed.event.id);
  }

  private async claim(eventId: string): Promise<ClaimedWebhookEvent | null> {
    return this.dataSource.transaction(async (manager) => {
      const eventRepository = manager.getRepository(
        UnipileInstagramWebhookEventEntity,
      );
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        eventId,
      ]);

      const event = await eventRepository.findOne({ where: { id: eventId } });
      if (
        !event ||
        event.status === UnipileInstagramWebhookEventStatus.COMPLETED ||
        event.status === UnipileInstagramWebhookEventStatus.FAILED ||
        event.status === UnipileInstagramWebhookEventStatus.PROCESSING
      ) {
        return null;
      }

      const processingEvent = {
        ...event,
        attemptCount: event.attemptCount + 1,
        nextAttemptAt: null,
        status: UnipileInstagramWebhookEventStatus.PROCESSING,
      };
      await eventRepository.save(processingEvent);

      const binding = await manager
        .getRepository(UnipileInstagramAccountBindingEntity)
        .findOne({
          where: { id: event.bindingId, deactivatedAt: IsNull() },
        });

      return { binding, event: processingEvent };
    });
  }

  private isStructurallyValid(
    claimed: ClaimedWebhookEvent,
  ): claimed is ClaimedWebhookEvent & {
    binding: UnipileInstagramAccountBindingEntity;
  } {
    const { binding, event } = claimed;
    if (!binding) {
      return false;
    }

    if (event.eventType === UnipileInstagramWebhookEventType.ACCOUNT_STATUS) {
      return (
        !!event.accountStatus &&
        isUnipileInstagramWebhookAccountStatus(event.accountStatus) &&
        event.unipileChatId === null &&
        event.unipileMessageId === null &&
        event.attendeeProviderId === null &&
        event.deliveryState === null &&
        event.deliveryStateUpdatedAt === null
      );
    }

    if (
      event.eventType !== UnipileInstagramWebhookEventType.MESSAGE_RECEIVED &&
      event.eventType !== UnipileInstagramWebhookEventType.MESSAGE_READ &&
      event.eventType !== UnipileInstagramWebhookEventType.MESSAGE_DELIVERED &&
      event.eventType !== UnipileInstagramWebhookEventType.MESSAGE_EDITED
    ) {
      return false;
    }

    if (
      binding.status !== UnipileInstagramAccountBindingStatus.ACTIVE ||
      !event.unipileChatId ||
      !event.unipileMessageId ||
      !event.attendeeProviderId
    ) {
      return false;
    }

    if (event.eventType === UnipileInstagramWebhookEventType.MESSAGE_READ) {
      return (
        event.deliveryState === 'READ' &&
        event.deliveryStateUpdatedAt instanceof Date
      );
    }
    if (
      event.eventType === UnipileInstagramWebhookEventType.MESSAGE_DELIVERED
    ) {
      return (
        event.deliveryState === 'DELIVERED' &&
        event.deliveryStateUpdatedAt instanceof Date
      );
    }

    return (
      event.deliveryState === null && event.deliveryStateUpdatedAt === null
    );
  }

  private isTerminalFailure(error: unknown): boolean {
    return (
      error instanceof UnipileInstagramWebhookFailure ||
      (error instanceof UnipileReadError && !error.retryable)
    );
  }

  private failure(error: unknown): { code: string; message: string } {
    if (
      error instanceof UnipileInstagramWebhookFailure ||
      error instanceof UnipileReadError
    ) {
      return { code: error.code, message: error.message };
    }

    return {
      code: 'UNIPILE_WEBHOOK_REREAD_FAILED',
      message: 'Unable to reread Unipile Instagram webhook event',
    };
  }

  private async markFailed(
    eventId: string,
    failure: { code: string; message: string },
  ): Promise<void> {
    await this.transition(eventId, {
      failureCode: failure.code,
      failureReason: failure.message,
      nextAttemptAt: null,
      status: UnipileInstagramWebhookEventStatus.FAILED,
    });
  }

  private async markReceived(eventId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const eventRepository = manager.getRepository(
        UnipileInstagramWebhookEventEntity,
      );
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        eventId,
      ]);

      const event = await eventRepository.findOne({ where: { id: eventId } });
      if (
        !event ||
        event.status !== UnipileInstagramWebhookEventStatus.PROCESSING
      ) {
        return;
      }

      await eventRepository.save({
        ...event,
        failureCode: 'UNIPILE_WEBHOOK_REREAD_FAILED',
        failureReason: 'Unable to reread Unipile Instagram webhook event',
        nextAttemptAt: new Date(
          Date.now() + this.retryDelay(event.attemptCount),
        ),
        status: UnipileInstagramWebhookEventStatus.RECEIVED,
      });
    });
  }

  private retryDelay(attemptCount: number): number {
    return Math.min(
      RETRY_MAX_DELAY_MS,
      RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
    );
  }

  private async markCompleted(eventId: string): Promise<void> {
    await this.transition(eventId, {
      failureCode: null,
      failureReason: null,
      nextAttemptAt: null,
      status: UnipileInstagramWebhookEventStatus.COMPLETED,
    });
  }

  private async transition(
    eventId: string,
    transition: {
      failureCode: string | null;
      failureReason: string | null;
      nextAttemptAt: Date | null;
      status:
        | UnipileInstagramWebhookEventStatus.COMPLETED
        | UnipileInstagramWebhookEventStatus.FAILED;
    },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const eventRepository = manager.getRepository(
        UnipileInstagramWebhookEventEntity,
      );
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        eventId,
      ]);

      const event = await eventRepository.findOne({ where: { id: eventId } });
      if (
        !event ||
        event.status !== UnipileInstagramWebhookEventStatus.PROCESSING
      ) {
        return;
      }

      await eventRepository.save({
        ...event,
        ...transition,
      });
    });
  }
}
