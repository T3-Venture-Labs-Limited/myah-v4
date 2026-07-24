import { Module } from '@nestjs/common';

import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';

@Module({
  imports: [MessagingQueryHookModule],
  providers: [
    MyahInboxMutationService,
    MyahInboxQueryService,
    MyahInboxResolver,
  ],
  exports: [MyahInboxMutationService, MyahInboxQueryService],
})
export class MyahInboxModule {}
