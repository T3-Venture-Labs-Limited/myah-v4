import { Scope } from '@nestjs/common';
import { DataSource, IsNull, LessThan, LessThanOrEqual, Not } from 'typeorm';

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
} from 'src/modules/myah-unipile/entities/unipile-instagram-webhook-event.entity';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { UnipileInstagramSyncQueue } from 'src/modules/myah-unipile/services/unipile-instagram-sync.queue';
import { UnipileInstagramWebhookQueue } from 'src/modules/myah-unipile/services/unipile-instagram-webhook.queue';

const PROCESSING_GRACE_MS = 60_000;

@Processor({
  queueName: MessageQueue.cronQueue,
  scope: Scope.REQUEST,
})
export class UnipileInstagramWebhookReconciliationJob {
  constructor(
    private readonly dataSource: DataSource,
    private readonly webhookQueue: UnipileInstagramWebhookQueue,
    private readonly syncQueue: UnipileInstagramSyncQueue,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
  ) {}

  @Process(UnipileInstagramWebhookReconciliationJob.name)
  async handle(): Promise<void> {
    this.availabilityService.assertEnabled();

    const eventRepository = this.dataSource.getRepository(
      UnipileInstagramWebhookEventEntity,
    );
    const bindingRepository = this.dataSource.getRepository(
      UnipileInstagramAccountBindingEntity,
    );
    const now = new Date();
    const processingBefore = new Date(now.getTime() - PROCESSING_GRACE_MS);
    const staleProcessingEvents = await eventRepository.find({
      where: {
        status: UnipileInstagramWebhookEventStatus.PROCESSING,
        updatedAt: LessThan(processingBefore),
      },
      order: { updatedAt: 'ASC' },
      take: 50,
    });

    await Promise.all(
      staleProcessingEvents.map(async (event) => {
        try {
          await this.reclaimStaleProcessingEvent(event.id, processingBefore);
        } catch {
          // A later reconciliation pass retries this event independently.
        }
      }),
    );

    const [events, unscheduledBindings] = await Promise.all([
      eventRepository.find({
        where: [
          {
            status: UnipileInstagramWebhookEventStatus.RECEIVED,
            nextAttemptAt: IsNull(),
          },
          {
            status: UnipileInstagramWebhookEventStatus.RECEIVED,
            nextAttemptAt: LessThanOrEqual(now),
          },
          {
            status: UnipileInstagramWebhookEventStatus.ENQUEUED,
            nextAttemptAt: IsNull(),
          },
          {
            status: UnipileInstagramWebhookEventStatus.ENQUEUED,
            nextAttemptAt: LessThanOrEqual(now),
          },
        ],
        order: { nextAttemptAt: 'ASC', updatedAt: 'ASC' },
        take: 50,
      }),
      bindingRepository.find({
        where: {
          status: UnipileInstagramAccountBindingStatus.ACTIVE,
          deactivatedAt: IsNull(),
          lastSyncScheduledAt: IsNull(),
        },
        take: 50,
      }),
    ]);
    const remainingCapacity = 50 - unscheduledBindings.length;
    const scheduledBindings =
      remainingCapacity > 0
        ? await bindingRepository.find({
            where: {
              status: UnipileInstagramAccountBindingStatus.ACTIVE,
              deactivatedAt: IsNull(),
              lastSyncScheduledAt: Not(IsNull()),
            },
            order: { lastSyncScheduledAt: 'ASC' },
            take: remainingCapacity,
          })
        : [];

    await Promise.all(
      events.map(async (event) => {
        try {
          await this.webhookQueue.enqueue(event.id);
        } catch {
          // A later reconciliation pass retries this event independently.
        }
      }),
    );

    for (const binding of [...unscheduledBindings, ...scheduledBindings]) {
      try {
        const result = await bindingRepository.update(
          {
            id: binding.id,
            status: UnipileInstagramAccountBindingStatus.ACTIVE,
            deactivatedAt: IsNull(),
          },
          { lastSyncScheduledAt: new Date() },
        );
        if (result.affected === 1) {
          await this.syncQueue.enqueue(binding.id);
        }
      } catch {
        // A later reconciliation pass retries this binding independently.
      }
    }
  }

  private async reclaimStaleProcessingEvent(
    eventId: string,
    processingBefore: Date,
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
        event.status !== UnipileInstagramWebhookEventStatus.PROCESSING ||
        event.updatedAt >= processingBefore
      ) {
        return;
      }

      await eventRepository.save({
        ...event,
        nextAttemptAt: null,
        status: UnipileInstagramWebhookEventStatus.ENQUEUED,
      });
    });
  }
}
