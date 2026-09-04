import { type InjectionToken } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { ManagedProviderBillingRecoveryCronCommand } from 'src/engine/core-modules/managed-provider-billing/crons/commands/managed-provider-billing-recovery.cron.command';
import { ManagedEmailReconciliationCronCommand } from 'src/engine/core-modules/managed-email/crons/commands/managed-email-reconciliation.cron.command';
import { ManagedEmailModule } from 'src/engine/core-modules/managed-email/managed-email.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MyahUnipileModule } from 'src/modules/myah-unipile/myah-unipile.module';
import { UnipileInstagramAccountRecoveryCronCommand } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.cron-command';

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
  unipileInstagramEnabled = false,
) => {
  const otherCronCommand = { run: jest.fn().mockResolvedValue(undefined) };
  const managedProviderBillingRecoveryCronCommand = {
    run: jest.fn().mockResolvedValue(undefined),
  };
  const managedEmailReconciliationCronCommand = {
    run: jest.fn().mockResolvedValue(undefined),
  };
  const unipileInstagramAccountRecoveryCronCommand = {
    run: jest.fn().mockResolvedValue(undefined),
  };
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'METRONOME_ENABLED') return metronomeEnabled;
      if (key === 'MANAGED_EMAIL_ENABLED') return managedEmailEnabled;
      if (key === 'UNIPILE_INSTAGRAM_ENABLED') return unipileInstagramEnabled;
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
      ...dependencies.map((provide) => ({
        provide,
        useValue:
          provide === ManagedProviderBillingRecoveryCronCommand
            ? managedProviderBillingRecoveryCronCommand
            : provide === ManagedEmailReconciliationCronCommand
              ? managedEmailReconciliationCronCommand
              : provide === UnipileInstagramAccountRecoveryCronCommand
                ? unipileInstagramAccountRecoveryCronCommand
                : provide === TwentyConfigService
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
    unipileInstagramAccountRecoveryCronCommand,
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

  it('registers Unipile Instagram recovery when Unipile Instagram is enabled', async () => {
    const { unipileInstagramAccountRecoveryCronCommand } = await runAggregate(
      false,
      false,
      true,
    );

    expect(
      unipileInstagramAccountRecoveryCronCommand.run,
    ).toHaveBeenCalledTimes(1);
  });

  it('does not register Unipile Instagram recovery when Unipile Instagram is disabled', async () => {
    const { unipileInstagramAccountRecoveryCronCommand } = await runAggregate(
      false,
      false,
      false,
    );

    expect(
      unipileInstagramAccountRecoveryCronCommand.run,
    ).not.toHaveBeenCalled();
  });

  it('wires managed-email and Unipile recovery into the real database command module', () => {
    const databaseImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DatabaseCommandModule,
    ) as unknown[];
    const managedEmailExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedEmailModule,
    ) as unknown[];
    const unipileExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahUnipileModule,
    ) as unknown[];

    expect(databaseImports).toContain(ManagedEmailModule);
    expect(managedEmailExports).toContain(
      ManagedEmailReconciliationCronCommand,
    );
    expect(databaseImports).toContain(MyahUnipileModule);
    expect(unipileExports).toContain(
      UnipileInstagramAccountRecoveryCronCommand,
    );
  });
});
