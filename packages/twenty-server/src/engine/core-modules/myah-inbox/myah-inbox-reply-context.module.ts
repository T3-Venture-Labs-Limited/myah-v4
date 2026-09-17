import { Module } from '@nestjs/common';
import { MyahInboxReplyContextOptionsService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-options.service';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MyahInboxReplyContextDraftEntity } from 'src/engine/core-modules/myah-inbox/entities/myah-inbox-reply-context-draft.entity';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyContextDraftService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';
import {
  MYAH_INBOX_REPLY_CONTEXT_EVIDENCE_RESOLVER,
  MyahInboxReplyContextQueryEvidenceResolver,
  MyahInboxReplyContextService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';

// Shared local authority reads must not import the Inbox tool/provider graph.
@Module({
  imports: [
    GlobalWorkspaceDataSourceModule,
    MessagingQueryHookModule,
    TypeOrmModule.forFeature([MyahInboxReplyContextDraftEntity]),
  ],
  providers: [
    MyahInboxQueryService,
    MyahInboxReplyContextQueryEvidenceResolver,
    {
      provide: MYAH_INBOX_REPLY_CONTEXT_EVIDENCE_RESOLVER,
      useExisting: MyahInboxReplyContextQueryEvidenceResolver,
    },
    MyahInboxReplyContextService,
    MyahInboxReplyContextOptionsService,
    MyahInboxReplyContextDraftService,
    EmailReplyContextActivationService,
  ],
  exports: [
    MyahInboxQueryService,
    MyahInboxReplyContextService,
    MyahInboxReplyContextOptionsService,
    MyahInboxReplyContextDraftService,
    EmailReplyContextActivationService,
  ],
})
export class MyahInboxReplyContextModule {}
