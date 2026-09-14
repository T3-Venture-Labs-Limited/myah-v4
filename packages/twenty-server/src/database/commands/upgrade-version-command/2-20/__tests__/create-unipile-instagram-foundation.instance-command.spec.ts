import { type QueryRunner } from 'typeorm';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

type CreateUnipileInstagramFoundationFastInstanceCommand = {
  up: (queryRunner: QueryRunner) => Promise<void>;
  down: (queryRunner: QueryRunner) => Promise<void>;
};

type CreateUnipileInstagramFoundationFastInstanceCommandConstructor =
  new () => CreateUnipileInstagramFoundationFastInstanceCommand;

type CreateUnipileInstagramFoundationFastInstanceCommandModule = {
  CreateUnipileInstagramFoundationFastInstanceCommand: CreateUnipileInstagramFoundationFastInstanceCommandConstructor;
};

const TABLE_NAMES = [
  'unipileInstagramAccountBinding',
  'unipileHostedAuthAttempt',
] as const;

const loadCommandModule = ():
  | CreateUnipileInstagramFoundationFastInstanceCommandModule
  | undefined => {
  try {
    return require('src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619348-create-unipile-instagram-foundation') as CreateUnipileInstagramFoundationFastInstanceCommandModule;
  } catch {
    return undefined;
  }
};

const getTableNames = (statements: string[]): string[] =>
  statements.flatMap((statement) =>
    Array.from(
      statement.matchAll(
        /(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE|DROP TABLE(?: IF EXISTS)?) "core"\."([^"]+)"/g,
      ),
      ([, tableName]) => tableName,
    ),
  );

const getDroppedTableNames = (statements: string[]): string[] =>
  statements.flatMap((statement) =>
    Array.from(
      statement.matchAll(/DROP TABLE(?: IF EXISTS)? "core"\."([^"]+)"/g),
      ([, tableName]) => tableName,
    ),
  );

describe('CreateUnipileInstagramFoundationFastInstanceCommand', () => {
  const getCommand = () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    return new commandModule!.CreateUnipileInstagramFoundationFastInstanceCommand();
  };

  it('is registered exactly once as the 2.20 fast command at its reserved timestamp', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      INSTANCE_COMMANDS.filter(
        (instanceCommand) =>
          instanceCommand ===
          commandModule!.CreateUnipileInstagramFoundationFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(
        commandModule!.CreateUnipileInstagramFoundationFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1789307619348,
      type: 'fast',
      version: '2.20.0',
    });
  });

  describe('up', () => {
    it('creates only the guarded core binding and Hosted Auth attempt schema', async () => {
      const query = jest.fn().mockResolvedValue(undefined);

      await getCommand().up({ query } as unknown as QueryRunner);

      const statements = query.mock.calls.map(
        ([statement]) => statement as string,
      );
      const sql = statements.join('\n');
      const bindingCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."unipileInstagramAccountBinding"',
        ),
      );
      const attemptCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."unipileHostedAuthAttempt"',
        ),
      );

      expect([...new Set(getTableNames(statements))].sort()).toEqual(
        [...TABLE_NAMES].sort(),
      );
      expect(bindingCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      expect(bindingCreate).toContain('"workspaceId" uuid NOT NULL');
      expect(bindingCreate).toContain(
        '"workspaceInstagramAccountRecordId" uuid NOT NULL',
      );
      expect(bindingCreate).toContain('"unipileAccountId" text NOT NULL');
      expect(bindingCreate).toContain('"instagramUserId" text NOT NULL');
      expect(bindingCreate).toContain('"connectedByUserWorkspaceId" uuid');
      expect(bindingCreate).not.toContain(
        '"connectedByUserWorkspaceId" uuid NOT NULL',
      );
      expect(bindingCreate).toContain('"status"');
      expect(bindingCreate).toContain('"deactivatedAt"');
      expect(bindingCreate).toContain('"createdAt"');
      expect(bindingCreate).toContain('"updatedAt"');
      expect(bindingCreate).toContain('btrim("unipileAccountId") <> \'\'');
      expect(bindingCreate).toContain('btrim("instagramUserId") <> \'\'');
      expect(sql).toContain('UNIQUE ("unipileAccountId")');
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+" ON "core"\."unipileInstagramAccountBinding" \("workspaceId"\) WHERE "deactivatedAt" IS NULL/,
      );
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+" ON "core"\."unipileInstagramAccountBinding" \("workspaceInstagramAccountRecordId"\) WHERE "deactivatedAt" IS NULL/,
      );
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_UNIPILE_IG_BINDING_ACTIVE_INSTAGRAM_OWNER" ON "core"."unipileInstagramAccountBinding" ("instagramUserId") WHERE "deactivatedAt" IS NULL',
      );

      expect(attemptCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      expect(attemptCreate).toContain('"workspaceId" uuid NOT NULL');
      expect(attemptCreate).toContain('"userWorkspaceId" uuid');
      expect(attemptCreate).not.toContain('"userWorkspaceId" uuid NOT NULL');
      expect(attemptCreate).toContain('"operation"');
      expect(attemptCreate).toContain('"expectedBindingId" uuid');
      expect(attemptCreate).not.toContain('"expectedBindingId" uuid NOT NULL');
      expect(attemptCreate).toContain('"callbackSecretHash"');
      expect(attemptCreate).toContain('"callbackDigest"');
      expect(attemptCreate).toContain('"callbackAccountId"');
      expect(attemptCreate).toContain('"callbackStatus"');
      expect(attemptCreate).not.toMatch(/"callbackDigest"[^,]*NOT NULL/);
      expect(attemptCreate).not.toMatch(/"callbackAccountId"[^,]*NOT NULL/);
      expect(attemptCreate).not.toMatch(/"callbackStatus"[^,]*NOT NULL/);
      expect(attemptCreate).toContain('"status"');
      expect(attemptCreate).toContain('"expiresAt"');
      expect(attemptCreate).toContain('"processedAt"');
      expect(attemptCreate).toContain('"failureCode"');
      expect(attemptCreate).toContain('"failureReason"');
      expect(attemptCreate).toContain('"createdAt"');
      expect(attemptCreate).toContain('"updatedAt"');
      expect(attemptCreate).toContain('UNIQUE ("callbackSecretHash")');
      expect(sql).toMatch(
        /CHECK \(\("operation" = 'CREATE' AND "expectedBindingId" IS NULL\) OR \("operation" = 'RECONNECT' AND "expectedBindingId" IS NOT NULL\)\)/,
      );

      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileHostedAuthAttempt_operation_enum" AS ENUM\('CREATE', 'RECONNECT'\)/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileHostedAuthAttempt_status_enum" AS ENUM\('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'\)/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileHostedAuthAttempt_operation_enum"[\s\S]*EXCEPTION[\s\S]*WHEN duplicate_object THEN NULL/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileHostedAuthAttempt_status_enum"[\s\S]*EXCEPTION[\s\S]*WHEN duplicate_object THEN NULL/,
      );
      expect(sql).toMatch(
        /FOREIGN KEY \("workspaceId"\) REFERENCES "core"\."workspace"\("id"\)/,
      );
      expect(sql).toMatch(
        /FOREIGN KEY \("connectedByUserWorkspaceId"\) REFERENCES "core"\."userWorkspace"\("id"\) ON DELETE SET NULL/,
      );
      expect(sql).toMatch(
        /FOREIGN KEY \("userWorkspaceId"\) REFERENCES "core"\."userWorkspace"\("id"\) ON DELETE SET NULL/,
      );
      expect(sql).toMatch(
        /FOREIGN KEY \("expectedBindingId"\) REFERENCES "core"\."unipileInstagramAccountBinding"\("id"\)/,
      );
    });
  });

  describe('down', () => {
    it('drops indexes before reversing the attempt then binding tables without touching other tables', async () => {
      const query = jest.fn().mockResolvedValue(undefined);

      await getCommand().down({ query } as unknown as QueryRunner);

      const statements = query.mock.calls.map(
        ([statement]) => statement as string,
      );
      const droppedTables = getDroppedTableNames(statements);
      const firstTableDrop = statements.findIndex((statement) =>
        statement.includes('DROP TABLE'),
      );

      expect([...new Set(getTableNames(statements))].sort()).toEqual(
        [...TABLE_NAMES].sort(),
      );
      expect(droppedTables).toEqual([
        'unipileHostedAuthAttempt',
        'unipileInstagramAccountBinding',
      ]);
      expect(statements.slice(0, firstTableDrop)).toEqual(
        expect.arrayContaining([
          'DROP INDEX IF EXISTS "core"."IDX_UNIPILE_IG_BINDING_ACTIVE_INSTAGRAM_OWNER"',
        ]),
      );
    });
  });
});
