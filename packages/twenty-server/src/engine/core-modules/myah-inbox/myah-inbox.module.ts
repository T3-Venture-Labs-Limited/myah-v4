import { Module } from '@nestjs/common';

import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';

@Module({
  providers: [MyahInboxResolver, MyahInboxQueryService],
})
export class MyahInboxModule {}
