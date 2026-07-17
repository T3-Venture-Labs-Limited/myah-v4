import { type DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { ManagedProviderBillingRecoveryCronCommand } from '../crons/commands/managed-provider-billing-recovery.cron.command';

class ManagedProviderBillingTestDependenciesModule {}

const repository = {};
const dataSource = {
  entityMetadatas: [],
  getRepository: jest.fn(() => repository),
  options: { type: 'postgres' },
};
const messageQueueService = {
  add: jest.fn(),
  addCron: jest.fn(),
};
const dependencyProviders = [
  { provide: getDataSourceToken(), useValue: dataSource },
  {
    provide: TwentyConfigService,
    useValue: { get: jest.fn() },
  },
  {
    provide: getQueueToken(MessageQueue.cronQueue),
    useValue: messageQueueService,
  },
  {
    provide: getQueueToken(MessageQueue.workspaceQueue),
    useValue: messageQueueService,
  },
];
const testDependenciesModule: DynamicModule = {
  exports: dependencyProviders,
  global: true,
  module: ManagedProviderBillingTestDependenciesModule,
  providers: dependencyProviders,
};

describe('managed-provider billing production dependency injection', () => {
  it('resolves the recovery cron command through the production Myah module graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testDependenciesModule, MyahModule],
    }).compile();

    expect(
      moduleRef.get(ManagedProviderBillingRecoveryCronCommand),
    ).toBeInstanceOf(ManagedProviderBillingRecoveryCronCommand);

    await moduleRef.close();
  });
});
