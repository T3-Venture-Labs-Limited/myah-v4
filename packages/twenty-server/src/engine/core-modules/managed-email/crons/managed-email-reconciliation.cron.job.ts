import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, type Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/managed-email/constants/managed-email-reconciliation-cron-pattern.constant';
import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import {
  ReconcileManagedEmailAcquisitionJob,
  type ReconcileManagedEmailAcquisitionJobData,
} from 'src/engine/core-modules/managed-email/jobs/reconcile-managed-email-acquisition.job';
import { MANAGED_EMAIL_ACQUISITION_CLOCK } from 'src/engine/core-modules/managed-email/services/managed-email-acquisition.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

const RECOVERY_BATCH_SIZE = 100;
const RECOVERY_RETRY_DELAY_MS = 60_000;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ManagedEmailReconciliationCronJob {
  constructor(
    // Recovery is a control-plane scan across workspaces. Each worker resumes
    // through a workspace-scoped service using the row's explicit workspaceId.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly operationRepository: Repository<ManagedEmailAcquisitionOperationEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    @Inject(MANAGED_EMAIL_ACQUISITION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Process(ManagedEmailReconciliationCronJob.name)
  @SentryCronMonitor(
    ManagedEmailReconciliationCronJob.name,
    MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const now = this.now();
    const recoverableStates = [
      'CREATING_SUBSCRIPTIONS',
      'PAYMENT_PENDING',
      'PAYMENT_PAID',
      'PROVIDER_INTENT_RECORDED',
      'RECONCILIATION_REQUIRED',
    ];
    const operations = await this.operationRepository.find({
      order: { nextReconciliationAt: 'ASC', id: 'ASC' },
      take: RECOVERY_BATCH_SIZE,
      where: [
        {
          nextReconciliationAt: IsNull(),
          state: In(recoverableStates),
        },
        {
          nextReconciliationAt: LessThanOrEqual(now),
          state: In(recoverableStates),
        },
      ],
    });
    const retryAt = new Date(now.getTime() + RECOVERY_RETRY_DELAY_MS);

    for (const operation of operations) {
      const priorDueAt = operation.nextReconciliationAt;
      const claim = await this.operationRepository.update(
        {
          id: operation.id,
          nextReconciliationAt: priorDueAt ?? IsNull(),
          state: operation.state,
          workspaceId: operation.workspaceId,
        },
        { nextReconciliationAt: retryAt },
      );

      if (claim.affected !== 1) {
        continue;
      }
      try {
        await this.messageQueueService.add<ReconcileManagedEmailAcquisitionJobData>(
          ReconcileManagedEmailAcquisitionJob.name,
          {
            operationId: operation.id,
            workspaceId: operation.workspaceId,
          },
          {
            id: `managed-email-reconciliation:${operation.id}`,
            retryLimit: 3,
          },
        );
      } catch (error) {
        await this.operationRepository.update(
          {
            id: operation.id,
            nextReconciliationAt: retryAt,
            state: operation.state,
            workspaceId: operation.workspaceId,
          },
          { nextReconciliationAt: priorDueAt },
        );
        throw error;
      }
    }
  }
}
