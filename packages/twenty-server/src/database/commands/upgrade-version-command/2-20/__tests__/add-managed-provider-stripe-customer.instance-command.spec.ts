import { type QueryRunner } from 'typeorm';

import { AddManagedProviderStripeCustomerFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1786000002000-add-managed-provider-stripe-customer';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('AddManagedProviderStripeCustomerFastInstanceCommand', () => {
  it('is registered as the 2.20 fast command at its reserved timestamp', () => {
    expect(INSTANCE_COMMANDS).toContain(
      AddManagedProviderStripeCustomerFastInstanceCommand,
    );
    expect(
      getRegisteredInstanceCommandMetadata(
        AddManagedProviderStripeCustomerFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1786000002000,
      type: 'fast',
      version: '2.20.0',
    });
  });

  it('adds a nullable Stripe Customer ID and a partial unique index', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddManagedProviderStripeCustomerFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');
    expect(sql).toContain(
      'ALTER TABLE "core"."myahWorkspaceInstallation" ADD "stripeCustomerId" varchar',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_STRIPE_CUSTOMER_ID_UNIQUE" ON "core"."myahWorkspaceInstallation" ("stripeCustomerId") WHERE "stripeCustomerId" IS NOT NULL',
    );
  });

  it('drops the unique index before dropping the nullable column', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddManagedProviderStripeCustomerFastInstanceCommand().down({
      query,
    } as unknown as QueryRunner);

    const statements = query.mock.calls.map(
      ([statement]) => statement as string,
    );
    expect(statements).toEqual([
      'DROP INDEX "core"."IDX_MYAH_WORKSPACE_INSTALLATION_STRIPE_CUSTOMER_ID_UNIQUE"',
      'ALTER TABLE "core"."myahWorkspaceInstallation" DROP COLUMN "stripeCustomerId"',
    ]);
  });
});
