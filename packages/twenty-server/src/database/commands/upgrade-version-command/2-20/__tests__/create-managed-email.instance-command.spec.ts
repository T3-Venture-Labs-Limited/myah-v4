import { type QueryRunner } from 'typeorm';

import { CreateManagedEmailFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1785325829908-create-managed-email';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

const TABLE_NAMES = [
  'managedEmailAcquisitionOperation',
  'managedEmailDomain',
  'managedEmailMailbox',
];

const getCreatedTableNames = (statements: string[]): string[] =>
  statements.flatMap(
    (statement) =>
      statement.match(/^CREATE TABLE "core"\."([^"]+)"/)?.slice(1) ?? [],
  );

const getDroppedTableNames = (statements: string[]): string[] =>
  statements.flatMap(
    (statement) =>
      statement.match(/^DROP TABLE "core"\."([^"]+)"/)?.slice(1) ?? [],
  );

describe('CreateManagedEmailFastInstanceCommand', () => {
  let command: CreateManagedEmailFastInstanceCommand;

  beforeEach(() => {
    command = new CreateManagedEmailFastInstanceCommand();
  });

  it('is registered exactly once for the generated 2.20 command timestamp', () => {
    expect(
      INSTANCE_COMMANDS.filter(
        (instanceCommand) =>
          instanceCommand === CreateManagedEmailFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(
        CreateManagedEmailFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1785325829908,
      type: 'fast',
      version: '2.20.0',
    });
  });

  describe('up', () => {
    it('creates only the workspace-scoped managed email persistence boundary', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const queryRunner = { query } as unknown as QueryRunner;

      await command.up(queryRunner);

      const statements = query.mock.calls.map((call) => call[0] as string);
      const sql = statements.join('\n');

      expect(statements).toHaveLength(20);
      expect(getCreatedTableNames(statements)).toEqual(TABLE_NAMES);
      expect(sql).toContain(
        'CONSTRAINT "UQ_MANAGED_EMAIL_ACQUISITION_WORKSPACE_IDEMPOTENCY"',
      );
      expect(sql).toContain(
        'CONSTRAINT "UQ_MANAGED_EMAIL_DOMAIN_WORKSPACE_ID"',
      );
      expect(sql).toContain(
        'CONSTRAINT "UQ_MANAGED_EMAIL_MAILBOX_WORKSPACE_NORMALIZED"',
      );
      expect(sql).toContain(
        'CONSTRAINT "CHK_MANAGED_EMAIL_ACQUISITION_AMOUNT_ATTEMPTS"',
      );
      expect(sql).toContain('CONSTRAINT "CHK_MANAGED_EMAIL_MAILBOX_CAPACITIES"');
      expect(sql).toContain(
        'FOREIGN KEY ("workspaceId", "managedEmailDomainId") REFERENCES "core"."managedEmailDomain"("workspaceId","id") ON DELETE CASCADE',
      );
      expect(sql).toContain(
        'FOREIGN KEY ("connectedAccountId") REFERENCES "core"."connectedAccount"("id") ON DELETE SET NULL',
      );
      expect(sql).toContain(
        'FOREIGN KEY ("messageChannelId") REFERENCES "core"."messageChannel"("id") ON DELETE SET NULL',
      );
      expect(sql).not.toMatch(
        /actionApproval|actionExecution|instagram|managedProvider|customerAccount/i,
      );
      expect(sql).toContain(
        'CONSTRAINT "CHK_MANAGED_EMAIL_MAILBOX_IDENTITIES_NONEMPTY"',
      );
    });
  });

  describe('down', () => {
    it('drops only the managed email tables in reverse dependency order', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const queryRunner = { query } as unknown as QueryRunner;

      await command.down(queryRunner);

      const statements = query.mock.calls.map((call) => call[0] as string);
      const sql = statements.join('\n');

      expect(statements).toHaveLength(20);
      expect(getDroppedTableNames(statements)).toEqual([
        'managedEmailMailbox',
        'managedEmailDomain',
        'managedEmailAcquisitionOperation',
      ]);
      expect(sql).not.toMatch(
        /actionApproval|actionExecution|instagram|managedProvider|customerAccount/i,
      );
    });
  });
});
