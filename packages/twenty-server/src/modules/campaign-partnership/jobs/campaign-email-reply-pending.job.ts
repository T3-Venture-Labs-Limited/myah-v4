import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { validate as isUuid } from 'uuid';
import { CAMPAIGN_EMAIL_REPLY_PENDING_JOB_NAME } from 'src/modules/campaign-partnership/constants/campaign-email-reply-jobs.constant';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  CampaignEmailReplyPendingRecoveryService,
  type CampaignEmailReplyPendingJobData,
} from 'src/modules/campaign-partnership/services/campaign-email-reply-pending-recovery.service';

@Processor(MessageQueue.messagingQueue)
export class CampaignEmailReplyPendingJob {
  constructor(
    private readonly recovery: CampaignEmailReplyPendingRecoveryService,
    private readonly orm: GlobalWorkspaceOrmManager,
  ) {}

  @Process(CAMPAIGN_EMAIL_REPLY_PENDING_JOB_NAME)
  async handle(data: CampaignEmailReplyPendingJobData): Promise<void> {
    if (!isUuid(data.workspaceId) || !isUuid(data.workItemId)) return;
    // Inert Review-only receipt acknowledgement. Future proposal generation
    // must recheck the exact source and current operator grant; no queue payload
    // supplies an actor or approval, and this job cannot change work state.
    await this.orm.executeInWorkspaceContext(
      () => this.recovery.isStillPending(data),
      buildSystemAuthContext(data.workspaceId),
    );
  }
}
