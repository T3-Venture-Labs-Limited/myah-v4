import { type QueryRunner } from 'typeorm';

import { INSTANCE_COMMANDS } from '../../instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from '../../../../../engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

type AddUnipileInstagramTriageModeFastInstanceCommand = {
  up: (queryRunner: QueryRunner) => Promise<void>;
  down: (queryRunner: QueryRunner) => Promise<void>;
};

type AddUnipileInstagramTriageModeFastInstanceCommandModule = {
  AddUnipileInstagramTriageModeFastInstanceCommand: new () => AddUnipileInstagramTriageModeFastInstanceCommand;
};

const loadCommandModule = (): AddUnipileInstagramTriageModeFastInstanceCommandModule | undefined => {
  try {
    return require('../2-20-instance-command-fast-1789633748003-add-unipile-instagram-triage-mode') as AddUnipileInstagramTriageModeFastInstanceCommandModule;
  } catch {
    return undefined;
  }
};

describe('AddUnipileInstagramTriageModeFastInstanceCommand', () => {
  it('adds and backfills the persisted LIVE/BACKFILL run mode and is registered', async () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    const command = new commandModule!.AddUnipileInstagramTriageModeFastInstanceCommand();
    const query = jest.fn().mockResolvedValue(undefined);

    await command.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');

    expect(sql).toContain(
      `ALTER TABLE "core"."unipileInstagramSyncRun" ADD COLUMN "triageMode" text NOT NULL DEFAULT 'BACKFILL'`,
    );
    expect(sql).toContain(`CHECK ("triageMode" IN ('LIVE', 'BACKFILL'))`);
    expect(sql).toContain('UPDATE "core"."unipileInstagramSyncRun" AS run');
    expect(sql).toContain('earlier_run."bindingId" = run."bindingId"');
    expect(sql).toContain(`earlier_run."status" = 'COMPLETED'`);
    expect(sql).toContain(`SET "triageMode" = 'LIVE'`);
    expect(INSTANCE_COMMANDS).toContain(
      commandModule!.AddUnipileInstagramTriageModeFastInstanceCommand,
    );
    expect(
      getRegisteredInstanceCommandMetadata(
        commandModule!.AddUnipileInstagramTriageModeFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1789633748003,
      type: 'fast',
      version: '2.20.0',
    });
  });
});
