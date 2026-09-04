import { type QueryRunner } from 'typeorm';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

type AddUnipileInstagramSyncStateFastInstanceCommand = {
  up: (queryRunner: QueryRunner) => Promise<void>;
  down: (queryRunner: QueryRunner) => Promise<void>;
};

type AddUnipileInstagramSyncStateFastInstanceCommandConstructor = new () =>
  AddUnipileInstagramSyncStateFastInstanceCommand;

type AddUnipileInstagramSyncStateFastInstanceCommandModule = {
  AddUnipileInstagramSyncStateFastInstanceCommand: AddUnipileInstagramSyncStateFastInstanceCommandConstructor;
};

const TABLE_NAMES = [
  'unipileInstagramSyncRun',
  'unipileInstagramChatCheckpoint',
  'unipileInstagramWebhookEvent',
  'unipileInstagramAccountBinding',
] as const;
const TYPE_NAMES = [
  'unipileInstagramSyncRun_status_enum',
  'unipileInstagramWebhookEvent_eventType_enum',
  'unipileInstagramWebhookEvent_status_enum',
] as const;

const loadCommandModule = ():
  | AddUnipileInstagramSyncStateFastInstanceCommandModule
  | undefined => {
  try {
    return require(
      'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1799201001000-add-unipile-instagram-sync-state',
    ) as AddUnipileInstagramSyncStateFastInstanceCommandModule;
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
      statement.matchAll(
        /DROP TABLE(?: IF EXISTS)? "core"\."([^"]+)"/g,
      ),
      ([, tableName]) => tableName,
    ),
  );

const getTypeNames = (statements: string[]): string[] =>
  statements.flatMap((statement) =>
    Array.from(
      statement.matchAll(
        /(?:CREATE TYPE|DROP TYPE IF EXISTS) "core"\."([^"]+)"/g,
      ),
      ([, typeName]) => typeName,
    ),
  );

describe('AddUnipileInstagramSyncStateFastInstanceCommand', () => {
  const getCommand = () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    return new commandModule!.AddUnipileInstagramSyncStateFastInstanceCommand();
  };

  it('is registered exactly once as the 2.20 fast command at its reserved timestamp', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      INSTANCE_COMMANDS.filter(
        (instanceCommand) =>
          instanceCommand ===
          commandModule!.AddUnipileInstagramSyncStateFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(
        commandModule!.AddUnipileInstagramSyncStateFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1799201001000,
      type: 'fast',
      version: '2.20.0',
    });
  });

  describe('up', () => {
    it('creates guarded sync-state and webhook-intake objects and idempotently adds binding scheduling state', async () => {
      const query = jest.fn().mockResolvedValue(undefined);

      await getCommand().up({ query } as unknown as QueryRunner);

      const statements = query.mock.calls.map(([statement]) => statement as string);
      const sql = statements.join('\n');
      const syncRunCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."unipileInstagramSyncRun"',
        ),
      );
      const checkpointCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."unipileInstagramChatCheckpoint"',
        ),
      );
      const webhookEventCreate = statements.find((statement) =>
        statement.includes(
          'CREATE TABLE IF NOT EXISTS "core"."unipileInstagramWebhookEvent"',
        ),
      );

      expect([...new Set(getTableNames(statements))].sort()).toEqual(
        [...TABLE_NAMES].sort(),
      );
      expect([...new Set(getTypeNames(statements))].sort()).toEqual(
        [...TYPE_NAMES].sort(),
      );
      expect(
        statements.filter((statement) =>
          /^CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+"/.test(statement),
        ),
      ).toHaveLength(1);
      expect(
        statements.filter((statement) =>
          /^CREATE INDEX IF NOT EXISTS "[^"]+"/.test(statement),
        ),
      ).toHaveLength(1);
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileInstagramSyncRun_status_enum" AS ENUM\('RUNNING', 'COMPLETED', 'FAILED'\)/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileInstagramSyncRun_status_enum"[\s\S]*EXCEPTION[\s\S]*WHEN duplicate_object THEN NULL/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileInstagramWebhookEvent_eventType_enum" AS ENUM\('MESSAGE_RECEIVED', 'MESSAGE_READ', 'MESSAGE_DELIVERED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_REACTION', 'ACCOUNT_STATUS'\)/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileInstagramWebhookEvent_eventType_enum"[\s\S]*EXCEPTION[\s\S]*WHEN duplicate_object THEN NULL/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileInstagramWebhookEvent_status_enum" AS ENUM\('RECEIVED', 'ENQUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'\)/,
      );
      expect(sql).toMatch(
        /CREATE TYPE "core"\."unipileInstagramWebhookEvent_status_enum"[\s\S]*EXCEPTION[\s\S]*WHEN duplicate_object THEN NULL/,
      );

      expect(syncRunCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      expect(syncRunCreate).toContain('"bindingId" uuid NOT NULL');
      expect(syncRunCreate).toContain(
        '"status" "core"."unipileInstagramSyncRun_status_enum" NOT NULL DEFAULT \'RUNNING\'',
      );
      expect(syncRunCreate).toContain('"overlapAfter" TIMESTAMP WITH TIME ZONE');
      expect(syncRunCreate).toContain('"chatCursor" text');
      expect(syncRunCreate).toContain('"currentChatId" text');
      expect(syncRunCreate).toContain('"currentChatAttendeeId" text');
      expect(syncRunCreate).toContain('"messageCursor" text');
      expect(syncRunCreate).toContain(
        '"completedChatHighWaterAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(syncRunCreate).toContain('"completedAt" TIMESTAMP WITH TIME ZONE');
      expect(syncRunCreate).toContain('"failureCode" text');
      expect(syncRunCreate).toContain('"failureReason" text');
      expect(syncRunCreate).toContain('"createdAt" TIMESTAMP WITH TIME ZONE');
      expect(syncRunCreate).toContain('"updatedAt" TIMESTAMP WITH TIME ZONE');
      expect(syncRunCreate).toMatch(
        /CHECK \("status" IN \('RUNNING', 'COMPLETED', 'FAILED'\)\)/,
      );
      expect(syncRunCreate).toMatch(
        /CHECK \("currentChatId" IS NOT NULL OR "messageCursor" IS NULL\)/,
      );
      expect(syncRunCreate).toMatch(
        /CHECK \(\("currentChatId" IS NULL AND "currentChatAttendeeId" IS NULL\) OR \("currentChatId" IS NOT NULL AND btrim\("currentChatAttendeeId"\) <> ''\)\)/,
      );
      expect(syncRunCreate).toMatch(
        /CHECK \(\("status" = 'RUNNING' AND "completedAt" IS NULL\) OR \("status" IN \('COMPLETED', 'FAILED'\) AND "completedAt" IS NOT NULL\)\)/,
      );
      expect(syncRunCreate).toMatch(
        /FOREIGN KEY \("bindingId"\) REFERENCES "core"\."unipileInstagramAccountBinding"\("id"\) ON DELETE CASCADE/,
      );
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+" ON "core"\."unipileInstagramSyncRun" \("bindingId"\) WHERE "status" = 'RUNNING'/,
      );

      expect(checkpointCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      expect(checkpointCreate).toContain('"bindingId" uuid NOT NULL');
      expect(checkpointCreate).toContain('"unipileChatId" text NOT NULL');
      expect(checkpointCreate).toContain(
        '"completedMessageHighWaterAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(checkpointCreate).toContain(
        'UNIQUE ("bindingId", "unipileChatId")',
      );
      expect(checkpointCreate).toContain(
        'btrim("unipileChatId") <> \'\'',
      );
      expect(checkpointCreate).toContain(
        '"createdAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(checkpointCreate).toContain(
        '"updatedAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(checkpointCreate).toMatch(
        /FOREIGN KEY \("bindingId"\) REFERENCES "core"\."unipileInstagramAccountBinding"\("id"\) ON DELETE CASCADE/,
      );
      expect(webhookEventCreate).toContain(
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4()',
      );
      expect(webhookEventCreate).toContain('"bindingId" uuid NOT NULL');
      expect(webhookEventCreate).toContain('"eventFingerprint" text NOT NULL');
      expect(webhookEventCreate).toContain(
        '"eventType" "core"."unipileInstagramWebhookEvent_eventType_enum" NOT NULL',
      );
      expect(webhookEventCreate).toContain('"unipileChatId" text');
      expect(webhookEventCreate).toContain('"unipileMessageId" text');
      expect(webhookEventCreate).toContain('"attendeeProviderId" text');
      expect(webhookEventCreate).toContain('"accountStatus" text');
      expect(webhookEventCreate).toContain('"deliveryState" text');
      expect(webhookEventCreate).toContain(
        '"deliveryStateUpdatedAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(webhookEventCreate).toContain(
        '"status" "core"."unipileInstagramWebhookEvent_status_enum" NOT NULL DEFAULT \'RECEIVED\'',
      );
      expect(webhookEventCreate).toContain(
        '"attemptCount" integer NOT NULL DEFAULT 0',
      );
      expect(webhookEventCreate).toContain(
        '"nextAttemptAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(webhookEventCreate).toContain('"failureCode" text');
      expect(webhookEventCreate).toContain('"failureReason" text');
      expect(webhookEventCreate).toContain(
        '"createdAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(webhookEventCreate).toContain(
        '"updatedAt" TIMESTAMP WITH TIME ZONE',
      );
      expect(webhookEventCreate).not.toMatch(
        /"(?:[A-Za-z]*payload[A-Za-z]*|[A-Za-z]*body[A-Za-z]*|[A-Za-z]*secret[A-Za-z]*)"/i,
      );
      expect(webhookEventCreate).toContain('UNIQUE ("eventFingerprint")');
      expect(webhookEventCreate).toContain(
        `btrim("eventFingerprint") <> '' AND "eventFingerprint" ~ '^[0-9a-f]{64}$'`,
      );
      for (const identityColumn of [
        'unipileChatId',
        'unipileMessageId',
        'attendeeProviderId',
        'accountStatus',
        'deliveryState',
      ]) {
        expect(webhookEventCreate).toContain(
          `btrim("${identityColumn}") <> ''`,
        );
      }
      expect(webhookEventCreate).toMatch(
        /CHECK \("eventType" NOT IN \('MESSAGE_RECEIVED', 'MESSAGE_READ', 'MESSAGE_DELIVERED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_REACTION'\) OR \("unipileChatId" IS NOT NULL AND "unipileMessageId" IS NOT NULL AND "attendeeProviderId" IS NOT NULL\)\)/,
      );
      expect(webhookEventCreate).toMatch(
        /CHECK \("eventType" <> 'ACCOUNT_STATUS' OR "unipileMessageId" IS NULL\)/,
      );
      expect(webhookEventCreate).toMatch(
        /FOREIGN KEY \("bindingId"\) REFERENCES "core"\."unipileInstagramAccountBinding"\("id"\) ON DELETE CASCADE/,
      );
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS "[^"]+" ON "core"\."unipileInstagramWebhookEvent" \("status", "nextAttemptAt", "updatedAt"\)/,
      );
      expect(statements).toContain(
        'ALTER TABLE "core"."unipileInstagramAccountBinding" ADD COLUMN IF NOT EXISTS "lastSyncScheduledAt" TIMESTAMP WITH TIME ZONE',
      );
    });
  });

  describe('down', () => {
    it('drops webhook indexes, table, and types before reversing checkpoints and runs', async () => {
      const query = jest.fn().mockResolvedValue(undefined);

      await getCommand().down({ query } as unknown as QueryRunner);

      const statements = query.mock.calls.map(([statement]) => statement as string);
      const droppedTables = getDroppedTableNames(statements);
      const webhookEventDrop = statements.indexOf(
        'DROP TABLE IF EXISTS "core"."unipileInstagramWebhookEvent"',
      );
      const checkpointDrop = statements.indexOf(
        'DROP TABLE IF EXISTS "core"."unipileInstagramChatCheckpoint"',
      );
      const syncRunDrop = statements.indexOf(
        'DROP TABLE IF EXISTS "core"."unipileInstagramSyncRun"',
      );
      const webhookEventTypeDrop = statements.indexOf(
        'DROP TYPE IF EXISTS "core"."unipileInstagramWebhookEvent_eventType_enum"',
      );
      const webhookStatusTypeDrop = statements.indexOf(
        'DROP TYPE IF EXISTS "core"."unipileInstagramWebhookEvent_status_enum"',
      );

      expect([...new Set(getTableNames(statements))].sort()).toEqual(
        [...TABLE_NAMES].sort(),
      );
      expect([...new Set(getTypeNames(statements))].sort()).toEqual(
        [...TYPE_NAMES].sort(),
      );
      expect(
        statements.filter((statement) =>
          /^DROP INDEX IF EXISTS "core"\."[^"]+"$/.test(statement),
        ),
      ).toHaveLength(2);
      expect(droppedTables).toEqual([
        'unipileInstagramWebhookEvent',
        'unipileInstagramChatCheckpoint',
        'unipileInstagramSyncRun',
      ]);
      expect(webhookEventDrop).toBeGreaterThan(1);
      expect(webhookEventDrop).toBeLessThan(checkpointDrop);
      expect(webhookStatusTypeDrop).toBeGreaterThan(webhookEventDrop);
      expect(webhookEventTypeDrop).toBeGreaterThan(webhookEventDrop);
      expect(webhookStatusTypeDrop).toBeLessThan(checkpointDrop);
      expect(webhookEventTypeDrop).toBeLessThan(checkpointDrop);
      expect(checkpointDrop).toBeLessThan(syncRunDrop);
      expect(statements[statements.length - 1]).toBe(
        'DROP TYPE IF EXISTS "core"."unipileInstagramSyncRun_status_enum"',
      );
    });
  });
});
