import { type QueryRunner } from 'typeorm';

import { AddManagedEmailLifecycleFieldsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1786000000000-add-managed-email-lifecycle-fields';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('AddManagedEmailLifecycleFieldsFastInstanceCommand', () => {
  it('is registered exactly once after the managed email evidence command', () => {
    expect(
      INSTANCE_COMMANDS.filter(
        (candidate) => candidate === AddManagedEmailLifecycleFieldsFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(AddManagedEmailLifecycleFieldsFastInstanceCommand),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1786000000000,
      type: 'fast',
      version: '2.20.0',
    });
  });

  it('adds all lifecycle persistence fields and partial due indexes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new AddManagedEmailLifecycleFieldsFastInstanceCommand().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement as string).join('\n');

    expect(sql).toContain('"nextSubscriptionReconciliationAt" timestamptz');
    expect(sql).toContain('"pendingRenewalProjection" jsonb');
    expect(sql).toContain('"pendingLifecycleAction" text');
    expect(sql).toContain('"pendingLifecycleKey" text');
    expect(sql).toContain('"infrastructureCancelAtPeriodEnd" boolean NOT NULL DEFAULT false');
    expect(sql.match(/WHERE "nextSubscriptionReconciliationAt" IS NOT NULL/g)).toHaveLength(1);
    expect(sql.match(/WHERE "nextPeriodBoundaryAt" IS NOT NULL/g)).toHaveLength(2);
  });

  it('drops lifecycle persistence fields in reverse dependency order', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new AddManagedEmailLifecycleFieldsFastInstanceCommand().down({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement as string).join('\n');

    expect(sql).toContain('DROP COLUMN "nextSubscriptionReconciliationAt"');
    expect(sql).toContain('DROP COLUMN "pendingRenewalProjection"');
    expect(sql).toContain('DROP COLUMN "infrastructureCancelAtPeriodEnd"');
    expect(sql).toContain('DROP INDEX "core"."IDX_MANAGED_EMAIL_MAILBOX_PERIOD_BOUNDARY_DUE"');
  });
});
