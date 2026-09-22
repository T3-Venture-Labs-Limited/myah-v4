import { MODULE_METADATA } from '@nestjs/common/constants';
import { type QueryRunner } from 'typeorm';

import { CreateCreatorDataOperationReceiptsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911010-create-creator-data-operation-receipts';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('CreateCreatorDataOperationReceiptsFastInstanceCommand', () => {
  it('registers one workspace-scoped receipt table for migration and import replay', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const command = new CreateCreatorDataOperationReceiptsFastInstanceCommand();

    await command.up({ query } as unknown as QueryRunner);

    expect(
      getRegisteredInstanceCommandMetadata(
        CreateCreatorDataOperationReceiptsFastInstanceCommand,
      ),
    ).toEqual({
      version: '2.20.0',
      timestamp: 1789645911010,
      type: 'fast',
      runAfterWorkspace: false,
    });
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).toContain(CreateCreatorDataOperationReceiptsFastInstanceCommand);

    const ddl = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(ddl).toContain('core."creatorDataOperationReceipt"');
    expect(ddl).toContain(
      'UNIQUE ("workspaceId", "kind", "attemptKey", "operationKey")',
    );
    expect(ddl).toContain(
      "CHECK (\"kind\" IN ('LEGACY_MIGRATION', 'SPREADSHEET_IMPORT'))",
    );
    expect(ddl).toContain('"sourceDigest" ~ \'^[0-9a-f]{64}$\'');
    expect(ddl).toContain('"socialProfileIds" uuid[]');
    expect(ddl).toContain('"noteTargetId" uuid');
  });

  it('drops only its own receipt table on rollback', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const command = new CreateCreatorDataOperationReceiptsFastInstanceCommand();

    await command.down({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP TABLE core."creatorDataOperationReceipt"',
    );
  });
});
