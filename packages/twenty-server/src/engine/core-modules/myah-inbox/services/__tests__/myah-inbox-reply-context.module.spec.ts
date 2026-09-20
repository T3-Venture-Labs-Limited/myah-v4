import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { MyahInboxReplyContextModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-reply-context.module';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyContextDraftService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import { MyahInboxReplyContextService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

@Module({
  providers: [{ provide: GlobalWorkspaceOrmManager, useValue: {} }],
  exports: [GlobalWorkspaceOrmManager],
})
class FakeWorkspaceModule {}

@Module({
  providers: [{ provide: MessageVisibilityPolicyService, useValue: {} }],
  exports: [MessageVisibilityPolicyService],
})
class FakeVisibilityModule {}

it('instantiates shared authority reads without importing approval, tools or providers', async () => {
  const module = await Test.createTestingModule({
    imports: [MyahInboxReplyContextModule],
  })
    .overrideModule(GlobalWorkspaceDataSourceModule)
    .useModule(FakeWorkspaceModule)
    .overrideModule(MessagingQueryHookModule)
    .useModule(FakeVisibilityModule)
    .useMocker((token) =>
      token === DataSource
        ? {
            getRepository: jest.fn(),
            entityMetadatas: [],
            options: { type: 'postgres' },
          }
        : undefined,
    )
    .compile();
  expect(module.get(MyahInboxQueryService)).toBeInstanceOf(
    MyahInboxQueryService,
  );
  expect(module.get(MyahInboxReplyContextService)).toBeInstanceOf(
    MyahInboxReplyContextService,
  );
  expect(module.get(MyahInboxReplyContextDraftService)).toBeInstanceOf(
    MyahInboxReplyContextDraftService,
  );
  await module.close();
});
