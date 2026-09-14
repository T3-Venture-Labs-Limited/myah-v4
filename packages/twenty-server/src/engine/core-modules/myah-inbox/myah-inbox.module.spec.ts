import { Test } from '@nestjs/testing';

import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { MyahInboxReplyAuthorityContextService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-authority-context.service';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { ManagedEmailCampaignEligibilityService } from 'src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyApprovedExecutionService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-approved-execution.service';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-reply-execution-service.token';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { AgentActorContextService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
describe('MyahInboxModule', () => {
  it('compiles the actual Inbox provider metadata seam and resolves its real executor, mutation service, action definition, and token without an Action Approval cycle', async () => {
    const moduleProviders = Reflect.getMetadata(
      'providers',
      MyahInboxModule,
    ) as unknown[];
    const executionTokenProvider = moduleProviders.find(
      (provider: unknown) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN,
    );

    expect(executionTokenProvider).toMatchObject({
      provide: MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN,
      useExisting: MyahInboxReplyApprovedExecutionService,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        MyahInboxReplyApprovedExecutionService,
        MyahInboxMutationService,
        MyahInboxReplyActionDefinition,
        executionTokenProvider as never,
        { provide: ActionApprovalService, useValue: {} },
        { provide: ActionReceiptProjectorService, useValue: {} },
        { provide: MessagingMessageOutboundService, useValue: {} },
        { provide: AgentActorContextService, useValue: {} },
        { provide: GlobalWorkspaceOrmManager, useValue: {} },
        { provide: MyahInboxQueryService, useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: MyahInboxReplyAuthorityContextService, useValue: {} },
        { provide: ManagedEmailCampaignEligibilityService, useValue: {} },
        { provide: getRepositoryToken(ConnectedAccountEntity), useValue: {} },
        { provide: getRepositoryToken(MessageChannelEntity), useValue: {} },
      ],
    }).compile();

    expect(
      moduleRef.get(MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN),
    ).toBeInstanceOf(MyahInboxReplyApprovedExecutionService);
    expect(moduleRef.get(MyahInboxMutationService)).toBeInstanceOf(
      MyahInboxMutationService,
    );
    expect(moduleRef.get(MyahInboxReplyActionDefinition)).toBeInstanceOf(
      MyahInboxReplyActionDefinition,
    );
    expect(Reflect.getMetadata('imports', ActionApprovalModule)).not.toContain(
      MyahInboxModule,
    );

    await moduleRef.close();
  });
});
