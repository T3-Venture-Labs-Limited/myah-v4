import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { validate as isUuid } from 'uuid';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { CAMPAIGN_EMAIL_REPLY_PENDING_JOB_NAME } from 'src/modules/campaign-partnership/constants/campaign-email-reply-jobs.constant';

export type CampaignEmailReplyPendingJobData = {
  workspaceId: string;
  workItemId: string;
  expectedContextGeneration: number;
};

/** Queue publication is deliberately outside the import/review transaction.
 * PENDING is durable and re-discoverable after a failed add or worker crash;
 * the review-only job never invokes AI or any transport. */
@Injectable()
export class CampaignEmailReplyPendingRecoveryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly queue: MessageQueueService,
  ) {}

  async publishPending(): Promise<number> {
    const shape: Array<{ exists: string | null }> = await this.dataSource.query(
      `SELECT to_regclass('core."UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM"')::text AS "exists"`,
    );
    if (!shape[0]?.exists) return 0;
    const pending: Array<{
      id: string;
      workspaceId: string;
      contextGeneration: number;
    }> = await this.dataSource.query(
      `SELECT "id", "workspaceId", "contextGeneration" FROM core."campaignPartnershipWorkItem"
       WHERE "purpose" = 'REPLY_AMBIGUITY' AND "state" = 'PENDING'
         AND "providerMessageId" IS NOT NULL AND "nextDueAt" <= now()
       ORDER BY "nextDueAt", "id" LIMIT 100`,
    );
    for (const work of pending) {
      if (
        !isUuid(work.id) ||
        !isUuid(work.workspaceId) ||
        !Number.isSafeInteger(work.contextGeneration) ||
        work.contextGeneration < 1
      )
        continue;
      await this.queue.add<CampaignEmailReplyPendingJobData>(
        CAMPAIGN_EMAIL_REPLY_PENDING_JOB_NAME,
        {
          workspaceId: work.workspaceId,
          workItemId: work.id,
          expectedContextGeneration: work.contextGeneration,
        },
        { id: `campaign-email-review-${work.id}-${work.contextGeneration}` },
      );
    }
    return pending.length;
  }

  async isStillPending(
    data: CampaignEmailReplyPendingJobData,
  ): Promise<boolean> {
    if (
      !isUuid(data.workspaceId) ||
      !isUuid(data.workItemId) ||
      !Number.isSafeInteger(data.expectedContextGeneration)
    )
      return false;
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT "id" FROM core."campaignPartnershipWorkItem"
       WHERE "id" = $1 AND "workspaceId" = $2 AND "state" = 'PENDING'
         AND "contextGeneration" = $3 AND "purpose" = 'REPLY_AMBIGUITY'
         AND "providerMessageId" IS NOT NULL`,
      [data.workItemId, data.workspaceId, data.expectedContextGeneration],
    );
    return rows.length === 1;
  }
}
