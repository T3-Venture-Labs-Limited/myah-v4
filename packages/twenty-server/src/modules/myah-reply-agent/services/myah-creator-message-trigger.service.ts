import { Injectable, Logger } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

export const MYAH_CREATOR_MESSAGE_JOB_NAME = 'MyahCreatorMessageJob';
export const MYAH_REPLY_AGENT_JOB_NAME = 'MyahReplyAgentJob';
// Wait for the creator to finish a burst of messages before drafting.
export const MYAH_REPLY_AGENT_DEBOUNCE_MS = 60_000;

export type MyahCreatorMessageJobData = {
  workspaceId: string;
  channel: 'EMAIL' | 'INSTAGRAM';
  conversationRecordId: string;
  messageRecordId: string;
};

// Post-commit entry point for live creator messages (MYAH-445). Callers look it
// up lazily, so Instagram and email ingestion keep working without this module.
@Injectable()
export class MyahCreatorMessageTriggerService {
  private readonly logger = new Logger(MyahCreatorMessageTriggerService.name);

  constructor(
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly queue: MessageQueueService,
  ) {}

  async notifyInbound(data: MyahCreatorMessageJobData): Promise<void> {
    try {
      await this.queue.add<MyahCreatorMessageJobData>(
        MYAH_CREATOR_MESSAGE_JOB_NAME,
        data,
        { id: `creator-message-${data.messageRecordId}` },
      );
    } catch (error) {
      // Ingestion already committed; a missed trigger only skips a draft.
      this.logger.warn(
        `Could not enqueue creator message ${data.messageRecordId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async scheduleAgent(
    data: Omit<MyahCreatorMessageJobData, 'messageRecordId'> & {
      messageRecordId: string;
      regenerate?: boolean;
      delayMs?: number;
    },
  ): Promise<void> {
    const { delayMs, ...payload } = data;
    await this.queue.add(MYAH_REPLY_AGENT_JOB_NAME, payload, {
      id: data.regenerate ? undefined : `reply-agent-${data.messageRecordId}`,
      delay: delayMs ?? MYAH_REPLY_AGENT_DEBOUNCE_MS,
    });
  }
}
