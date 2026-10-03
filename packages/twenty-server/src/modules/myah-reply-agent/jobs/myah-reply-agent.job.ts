import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { CampaignInstagramReplyService } from 'src/modules/campaign-execution/services/campaign-instagram-reply.service';
import {
  MYAH_CREATOR_MESSAGE_JOB_NAME,
  MYAH_REPLY_AGENT_JOB_NAME,
  type MyahCreatorMessageJobData,
  MyahCreatorMessageTriggerService,
} from 'src/modules/myah-reply-agent/services/myah-creator-message-trigger.service';
import { MyahReplyAgentService } from 'src/modules/myah-reply-agent/services/myah-reply-agent.service';

@Injectable()
@Processor(MessageQueue.messagingQueue)
export class MyahReplyAgentJob {
  constructor(
    private readonly instagramReplies: CampaignInstagramReplyService,
    private readonly trigger: MyahCreatorMessageTriggerService,
    private readonly agent: MyahReplyAgentService,
  ) {}

  // Campaign effects first (link the chat, stop the sequence), then the
  // debounced agent run.
  @Process(MYAH_CREATOR_MESSAGE_JOB_NAME)
  async handleCreatorMessage(data: MyahCreatorMessageJobData): Promise<void> {
    if (data.channel === 'INSTAGRAM')
      await this.instagramReplies.handleInboundMessage(data);
    await this.trigger.scheduleAgent(data);
  }

  @Process(MYAH_REPLY_AGENT_JOB_NAME)
  async handleAgentRun(
    data: MyahCreatorMessageJobData & { regenerate?: boolean },
  ): Promise<void> {
    await this.agent.run({
      workspaceId: data.workspaceId,
      channel: data.channel,
      conversationRecordId: data.conversationRecordId,
      regenerate: data.regenerate,
    });
  }
}
