import { type QueryRunner } from 'typeorm';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

type Command = {
  down: (queryRunner: QueryRunner) => Promise<void>;
  up: (queryRunner: QueryRunner) => Promise<void>;
};

type CommandConstructor = new () => Command;

type CommandModule = {
  AddInstagramDirectActionContextFastInstanceCommand: CommandConstructor;
};

const loadCommandModule = (): CommandModule | undefined => {
  try {
    return require(
      'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1799201003000-add-instagram-direct-action-context'
    ) as CommandModule;
  } catch {
    return undefined;
  }
};

describe('AddInstagramDirectActionContextFastInstanceCommand', () => {
  const getCommand = () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    return new commandModule!.AddInstagramDirectActionContextFastInstanceCommand();
  };

  it('is registered exactly once at the reserved 2.20 fast timestamp', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      INSTANCE_COMMANDS.filter(
        (command) =>
          command ===
          commandModule!.AddInstagramDirectActionContextFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(
        commandModule!.AddInstagramDirectActionContextFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1799201003000,
      type: 'fast',
      version: '2.20.0',
    });
  });

  it('makes thread nullable only for exact direct Inbox Instagram v2 context', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await getCommand().up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');

    expect(sql).toContain(
      'ALTER COLUMN "threadId" DROP NOT NULL',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "interactionContextType" varchar',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "interactionContextId" uuid',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "actionKind" varchar',
    );
    expect(sql).toContain(
      '"interactionContextType" = \'MYAH_INBOX_INSTAGRAM_DRAFT\'',
    );
    expect(sql).toContain('"actionName" = \'send_instagram_message\'');
    expect(sql).toContain('"actionVersion" = 2');
    expect(sql).toContain(
      '"actionKind" IN (\'START_CHAT\', \'REPLY\')',
    );
    expect(sql).toMatch(
      /"actionName" <> 'send_instagram_message'[\s\S]*"actionKind" IS NULL/,
    );
    expect(sql).toMatch(
      /"threadId" IS NULL[\s\S]*"interactionContextId" = "draftId"/,
    );
    expect(sql).toMatch(/"threadId" IS NOT NULL[\s\S]*"interactionContextType" IS NULL[\s\S]*"interactionContextId" IS NULL/);
  });

  it('creates immutable receipt-linked Instagram send outcome resolutions', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await getCommand().up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "core"."instagramSendOutcomeResolution"',
    );
    expect(sql).toContain(
      'UNIQUE ("actionExecutionReceiptId")',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("actionExecutionReceiptId") REFERENCES "core"."actionExecutionReceipt"("id") ON DELETE RESTRICT',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("resolvedByUserWorkspaceId") REFERENCES "core"."userWorkspace"("id") ON DELETE RESTRICT',
    );
    expect(sql).toContain(
      'CHECK ("outcome" IN (\'CONFIRMED_SENT\', \'CLEARED_NOT_SENT\'))',
    );
    expect(sql).toContain('"evidenceTypes" text[] NOT NULL');
    expect(sql).toContain('"evidenceDigests" varchar(64)[] NOT NULL');
  });

  it('refuses rollback when direct contexts exist before restoring legacy nullability', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ count: 1 }]);

    await expect(
      getCommand().down({ query } as unknown as QueryRunner),
    ).rejects.toThrow('Cannot roll back populated Instagram direct action contexts');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('removes the check and context columns before restoring thread NOT NULL', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValue(undefined);

    await getCommand().down({ query } as unknown as QueryRunner);

    const statements = query.mock.calls.map(([statement]) => statement as string);
    const sql = statements.join('\n');
    const setNotNullIndex = statements.findIndex((statement) =>
      statement.includes('ALTER COLUMN "threadId" SET NOT NULL'),
    );

    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"',
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS "interactionContextType"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "interactionContextId"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "actionKind"');
    expect(sql).toContain(
      'DROP TABLE IF EXISTS "core"."instagramSendOutcomeResolution"',
    );
    expect(setNotNullIndex).toBeGreaterThan(0);
  });
});
