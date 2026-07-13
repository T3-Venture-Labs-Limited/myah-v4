import { type QueryRunner } from 'typeorm';

import { CreateCustomerAccountControlPlaneFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1783922687955-create-customer-account-control-plane';

describe('CreateCustomerAccountControlPlaneFastInstanceCommand', () => {
  let command: CreateCustomerAccountControlPlaneFastInstanceCommand;

  beforeEach(() => {
    command = new CreateCustomerAccountControlPlaneFastInstanceCommand();
  });

  describe('up', () => {
    it('creates the customer-account tables with ownership and cleanup constraints', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const queryRunner = { query } as unknown as QueryRunner;

      await command.up(queryRunner);

      const statements = query.mock.calls.map((call) => call[0] as string);

      expect(statements).toHaveLength(4);
      expect(statements[0]).toContain(
        'CREATE TABLE "core"."customerAccount"',
      );
      expect(statements[1]).toContain(
        'CREATE TABLE "core"."myahWorkspaceInstallation"',
      );
      expect(statements[1]).toContain(
        'CONSTRAINT "FK_ffc7c3969dace403842f00c38ab" FOREIGN KEY ("customerAccountId") REFERENCES "core"."customerAccount"("id") ON DELETE NO ACTION',
      );
      expect(statements[1]).toContain(
        'CONSTRAINT "FK_ba6cef6db9843fee885ae523b20" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE',
      );
      expect(statements[2]).toBe(
        'CREATE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID" ON "core"."myahWorkspaceInstallation" ("customerAccountId") ',
      );
      expect(statements[3]).toBe(
        'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE" ON "core"."myahWorkspaceInstallation" ("workspaceId") ',
      );
    });
  });

  describe('down', () => {
    it('drops installations before accounts', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const queryRunner = { query } as unknown as QueryRunner;

      await command.down(queryRunner);

      expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
        'DROP TABLE "core"."myahWorkspaceInstallation"',
        'DROP TABLE "core"."customerAccount"',
      ]);
    });
  });
});
