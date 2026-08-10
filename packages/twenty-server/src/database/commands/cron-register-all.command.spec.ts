import { type InjectionToken } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { ManagedEmailReconciliationCronCommand } from 'src/engine/core-modules/managed-email/crons/commands/managed-email-reconciliation.cron.command';
import { ManagedEmailModule } from 'src/engine/core-modules/managed-email/managed-email.module';

import { CronRegisterAllCommand } from './cron-register-all.command';
import { DatabaseCommandModule } from './database-command.module';

jest.mock('twenty-client-sdk/generate', () => ({}), { virtual: true });

const silentLogger = {
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

const runAggregate = async (
  metronomeEnabled: boolean,
  managedEmailEnabled = false,
) => {
  const otherCronCommand = { run: jest.fn().mockResolvedValue(undefined) };
  const managedProviderBillingRecoveryCronCommand = {
    run: jest.fn().mockResolvedValue(undefined),
  };
  const managedEmailReconciliationCronCommand = {
    run: jest.fn().mockResolvedValue(undefined),
  };
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'METRONOME_ENABLED') return metronomeEnabled;
      if (key === 'MANAGED_EMAIL_ENABLED') return managedEmailEnabled;
      return undefined;
    }),
  };
  const dependencies = Reflect.getMetadata(
    'design:paramtypes',
    CronRegisterAllCommand,
  ) as InjectionToken[];
  const module = await Test.createTestingModule({
    providers: [
      CronRegisterAllCommand,
      ...dependencies.map((provide, index) => ({
        provide,
        useValue:
          index === dependencies.length - 3
            ? managedProviderBillingRecoveryCronCommand
            : index === dependencies.length - 2
              ? managedEmailReconciliationCronCommand
              : index === dependencies.length - 1
                ? twentyConfigService
                : otherCronCommand,
      })),
    ],
  }).compile();
  const aggregate = module.get(CronRegisterAllCommand);

  Object.assign(aggregate, { logger: silentLogger });
  await aggregate.run();
  await module.close();

  return {
    managedEmailReconciliationCronCommand,
    managedProviderBillingRecoveryCronCommand,
  };
};

describe('CronRegisterAllCommand', () => {
  it('registers managed-provider billing recovery when Metronome is enabled', async () => {
    const { managedProviderBillingRecoveryCronCommand } =
      await runAggregate(true);

    expect(managedProviderBillingRecoveryCronCommand.run).toHaveBeenCalledTimes(
      1,
    );
  });

  it('does not register managed-provider billing recovery when Metronome is disabled', async () => {
    const { managedProviderBillingRecoveryCronCommand } =
      await runAggregate(false);

    expect(
      managedProviderBillingRecoveryCronCommand.run,
    ).not.toHaveBeenCalled();
  });

  it('registers managed-email recovery when managed email is enabled', async () => {
    const { managedEmailReconciliationCronCommand } = await runAggregate(
      false,
      true,
    );

    expect(managedEmailReconciliationCronCommand.run).toHaveBeenCalledTimes(1);
  });

  it('registers managed-email recovery even when new admission is disabled', async () => {
    const { managedEmailReconciliationCronCommand } = await runAggregate(
      false,
      false,
    );

    expect(managedEmailReconciliationCronCommand.run).toHaveBeenCalledTimes(1);
  });

  it('wires managed-email recovery into the real database command module', () => {
    const databaseImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DatabaseCommandModule,
    ) as unknown[];
    const managedEmailExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedEmailModule,
    ) as unknown[];

    expect(databaseImports).toContain(ManagedEmailModule);
    expect(managedEmailExports).toContain(
      ManagedEmailReconciliationCronCommand,
    );
  });
});
