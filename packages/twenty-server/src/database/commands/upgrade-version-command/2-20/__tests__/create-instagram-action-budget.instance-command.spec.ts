import { type QueryRunner } from 'typeorm';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

type CreateInstagramActionBudgetFastInstanceCommand = {
  down: (queryRunner: QueryRunner) => Promise<void>;
  up: (queryRunner: QueryRunner) => Promise<void>;
};

type CreateInstagramActionBudgetFastInstanceCommandConstructor =
  new () => CreateInstagramActionBudgetFastInstanceCommand;

type CreateInstagramActionBudgetFastInstanceCommandModule = {
  CreateInstagramActionBudgetFastInstanceCommand: CreateInstagramActionBudgetFastInstanceCommandConstructor;
};

const TABLE_NAMES = [
  'instagramActionReservation',
  'instagramActionLimitBlock',
] as const;

const loadCommandModule = ():
  | CreateInstagramActionBudgetFastInstanceCommandModule
  | undefined => {
  try {
    return require('src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619356-create-instagram-action-budget') as CreateInstagramActionBudgetFastInstanceCommandModule;
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

describe('CreateInstagramActionBudgetFastInstanceCommand', () => {
  const getCommand = () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    return new commandModule!.CreateInstagramActionBudgetFastInstanceCommand();
  };

  it('is registered exactly once as the 2.20 fast command at its reserved timestamp', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      INSTANCE_COMMANDS.filter(
        (instanceCommand) =>
          instanceCommand ===
          commandModule!.CreateInstagramActionBudgetFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(
        commandModule!.CreateInstagramActionBudgetFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1789307619356,
      type: 'fast',
      version: '2.20.0',
    });
  });

  describe('up', () => {
    it('creates only guarded receipt-backed reservation and limit-block tables', async () => {
      const query = jest.fn().mockResolvedValue(undefined);

      await getCommand().up({ query } as unknown as QueryRunner);

      const statements = query.mock.calls.map(
        ([statement]) => statement as string,
      );
      const sql = statements.join('\n');
      const reservationCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."instagramActionReservation"',
        ),
      );
      const blockCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."instagramActionLimitBlock"',
        ),
      );

      expect([...new Set(getTableNames(statements))].sort()).toEqual(
        [...TABLE_NAMES].sort(),
      );
      expect(reservationCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      for (const column of [
        '"workspaceId" uuid NOT NULL',
        '"instagramAccountRecordId" uuid NOT NULL',
        '"actionExecutionReceiptId" uuid NOT NULL',
        '"targetFingerprint" varchar(64) NOT NULL',
        '"reservedAt" timestamptz NOT NULL DEFAULT now()',
      ]) {
        expect(reservationCreate).toContain(column);
      }
      expect(reservationCreate).toContain('"actionKind"');
      for (const column of [
        '"providerAttemptedAt" timestamptz',
        '"releasedAt" timestamptz',
        '"releaseReason" text',
        '"targetLockReleasedAt" timestamptz',
        '"createdAt" timestamptz NOT NULL DEFAULT now()',
        '"updatedAt" timestamptz NOT NULL DEFAULT now()',
      ]) {
        expect(reservationCreate).toContain(column);
      }
      expect(reservationCreate).not.toMatch(
        /"providerAttemptedAt"[^,]*NOT NULL/,
      );
      expect(reservationCreate).not.toMatch(/"releasedAt"[^,]*NOT NULL/);
      expect(reservationCreate).not.toMatch(/"releaseReason"[^,]*NOT NULL/);
      expect(reservationCreate).not.toMatch(
        /"targetLockReleasedAt"[^,]*NOT NULL/,
      );
      expect(reservationCreate).toContain(
        'UNIQUE ("actionExecutionReceiptId")',
      );
      expect(reservationCreate).toMatch(
        /CHECK \("targetFingerprint" ~ '\^\[0-9a-f\]\{64\}\$'\)/,
      );

      expect(blockCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      for (const column of [
        '"workspaceId" uuid NOT NULL',
        '"instagramAccountRecordId" uuid NOT NULL',
        '"actionExecutionReceiptId" uuid NOT NULL',
        '"errorCode" varchar NOT NULL DEFAULT \'INSTAGRAM_ACTION_LIMIT_REACHED\'',
        '"hourlyUsed" integer NOT NULL',
        '"hourlyLimit" integer NOT NULL',
        '"hourlyRemaining" integer NOT NULL',
        '"dailyUsed" integer NOT NULL',
        '"dailyLimit" integer NOT NULL',
        '"dailyRemaining" integer NOT NULL',
        '"blockedWindows" text[] NOT NULL',
        '"nextEligibleAt" timestamptz NOT NULL',
        '"createdAt" timestamptz NOT NULL DEFAULT now()',
        '"updatedAt" timestamptz NOT NULL DEFAULT now()',
      ]) {
        expect(blockCreate).toContain(column);
      }
      expect(blockCreate).toContain('UNIQUE ("actionExecutionReceiptId")');
      expect(blockCreate).toContain(
        'CHECK ("errorCode" = \'INSTAGRAM_ACTION_LIMIT_REACHED\')',
      );
      expect(blockCreate).toMatch(
        /CHECK \("hourlyUsed" >= 0 AND "hourlyLimit" >= 0 AND "hourlyRemaining" >= 0 AND "dailyUsed" >= 0 AND "dailyLimit" >= 0 AND "dailyRemaining" >= 0\)/,
      );
      expect(blockCreate).toMatch(
        /CHECK \("hourlyLimit" = 10 AND "dailyLimit" = 100\)/,
      );
      expect(blockCreate).toMatch(
        /CHECK \("hourlyRemaining" = GREATEST\("hourlyLimit" - "hourlyUsed", 0\) AND "dailyRemaining" = GREATEST\("dailyLimit" - "dailyUsed", 0\)\)/,
      );
      expect(blockCreate).toMatch(
        /CHECK \(cardinality\("blockedWindows"\) > 0 AND "blockedWindows" <@ ARRAY\['HOURLY', 'DAILY'\]::text\[\]\)/,
      );

      expect(sql).toMatch(
        /CREATE TYPE "core"\."instagramActionReservation_actionKind_enum" AS ENUM\('START_CHAT', 'REPLY'\)/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."instagramActionReservation_actionKind_enum"[\s\S]*EXCEPTION[\s\S]*WHEN duplicate_object THEN NULL/,
      );
      expect(sql).toContain(
        'CREATE INDEX IF NOT EXISTS "IDX_INSTAGRAM_ACTION_RESERVATION_ACTIVE_WINDOW" ON "core"."instagramActionReservation" ("workspaceId", "instagramAccountRecordId", "reservedAt") WHERE "releasedAt" IS NULL',
      );
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_INSTAGRAM_ACTION_RESERVATION_START_CHAT_TARGET" ON "core"."instagramActionReservation" ("workspaceId", "instagramAccountRecordId", "targetFingerprint") WHERE "actionKind" = \'START_CHAT\' AND "targetLockReleasedAt" IS NULL',
      );
      for (const tableCreate of [reservationCreate, blockCreate]) {
        expect(tableCreate).toContain(
          'FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE',
        );
        expect(tableCreate).toContain(
          'FOREIGN KEY ("actionExecutionReceiptId") REFERENCES "core"."actionExecutionReceipt"("id") ON DELETE RESTRICT',
        );
      }
    });
  });

  describe('down', () => {
    it('drops new indexes before reversing only the limit-block then reservation tables and enum', async () => {
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
        'instagramActionLimitBlock',
        'instagramActionReservation',
      ]);
      expect(statements).toEqual(
        expect.arrayContaining([
          'DROP TABLE IF EXISTS "core"."instagramActionLimitBlock"',
          'DROP TABLE IF EXISTS "core"."instagramActionReservation"',
        ]),
      );
      expect(statements.slice(0, firstTableDrop)).toEqual(
        expect.arrayContaining([
          'DROP INDEX IF EXISTS "core"."IDX_INSTAGRAM_ACTION_RESERVATION_ACTIVE_WINDOW"',
          'DROP INDEX IF EXISTS "core"."IDX_INSTAGRAM_ACTION_RESERVATION_START_CHAT_TARGET"',
        ]),
      );
      expect(statements).toContain(
        'DROP TYPE IF EXISTS "core"."instagramActionReservation_actionKind_enum"',
      );
    });
  });
});
