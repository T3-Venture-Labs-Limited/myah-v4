import { type QueryRunner } from 'typeorm';

import { AddActionApprovalContextFingerprintFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785453079000-add-action-approval-context-fingerprint';

describe('AddActionApprovalContextFingerprintFastInstanceCommand', () => {
  let command: AddActionApprovalContextFingerprintFastInstanceCommand;

  beforeEach(() => {
    command = new AddActionApprovalContextFingerprintFastInstanceCommand();
  });

  it('adds the nullable context fingerprint idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await command.up(queryRunner);
    await command.up(queryRunner);

    expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
      'ALTER TABLE "core"."actionApprovalBinding" ADD COLUMN IF NOT EXISTS "actionContextFingerprint" character varying(64)',
      'ALTER TABLE "core"."actionApprovalBinding" ADD COLUMN IF NOT EXISTS "actionContextFingerprint" character varying(64)',
    ]);
  });

  it('drops the context fingerprint idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await command.down(queryRunner);
    await command.down(queryRunner);

    expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
      'ALTER TABLE "core"."actionApprovalBinding" DROP COLUMN IF EXISTS "actionContextFingerprint"',
      'ALTER TABLE "core"."actionApprovalBinding" DROP COLUMN IF EXISTS "actionContextFingerprint"',
    ]);
  });
});
