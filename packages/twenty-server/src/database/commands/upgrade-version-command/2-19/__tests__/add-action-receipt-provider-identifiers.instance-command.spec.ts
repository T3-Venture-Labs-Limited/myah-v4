import { type QueryRunner } from 'typeorm';

import { AddActionReceiptProviderIdentifiersFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1810000011000-add-action-receipt-provider-identifiers';

describe('AddActionReceiptProviderIdentifiersFastInstanceCommand', () => {
  let command: AddActionReceiptProviderIdentifiersFastInstanceCommand;

  beforeEach(() => {
    command = new AddActionReceiptProviderIdentifiersFastInstanceCommand();
  });

  it('adds nullable provider identifiers idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await command.up(queryRunner);
    await command.up(queryRunner);

    expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
      'ALTER TABLE "core"."actionExecutionReceipt" ADD COLUMN IF NOT EXISTS "providerExternalMessageId" text, ADD COLUMN IF NOT EXISTS "providerThreadExternalId" text',
      'ALTER TABLE "core"."actionExecutionReceipt" ADD COLUMN IF NOT EXISTS "providerExternalMessageId" text, ADD COLUMN IF NOT EXISTS "providerThreadExternalId" text',
    ]);
  });

  it('drops provider identifiers idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await command.down(queryRunner);
    await command.down(queryRunner);

    expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
      'ALTER TABLE "core"."actionExecutionReceipt" DROP COLUMN IF EXISTS "providerThreadExternalId", DROP COLUMN IF EXISTS "providerExternalMessageId"',
      'ALTER TABLE "core"."actionExecutionReceipt" DROP COLUMN IF EXISTS "providerThreadExternalId", DROP COLUMN IF EXISTS "providerExternalMessageId"',
    ]);
  });
});
