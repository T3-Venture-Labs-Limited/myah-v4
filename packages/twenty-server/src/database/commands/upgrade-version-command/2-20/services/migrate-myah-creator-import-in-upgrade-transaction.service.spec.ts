import { MigrateMyahCreatorImportInUpgradeTransactionService } from './migrate-myah-creator-import-in-upgrade-transaction.service';
import type { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import type { MigrateMyahCreatorSocialLinksService } from './migrate-myah-creator-social-links.service';
import type { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

const workspaceId = '20202020-0000-4000-8000-000000000001';

describe('dormant Creator upgrade orchestration', () => {
  const sync = jest.fn().mockResolvedValue(undefined);
  const social = jest.fn().mockResolvedValue({ canDeleteOldFields: true });
  const currentRunner = jest.fn();
  const service = new MigrateMyahCreatorImportInUpgradeTransactionService(
    {
      synchronizeCreatorImportInUpgradeTransaction: sync,
    } as unknown as SynchronizeMyahStandardMetadataCommand,
    {
      migrateInUpgradeTransaction: social,
    } as unknown as MigrateMyahCreatorSocialLinksService,
    { currentRunner } as unknown as UpgradeWriteLockService,
  );
  const args = { workspaceId, options: { dryRun: false }, index: 0, total: 1 };
  const makeTx = () => {
    const manager = { queryRunner: null as unknown };
    const queryRunner = {
      isTransactionActive: true,
      isReleased: false,
      manager,
    };
    manager.queryRunner = queryRunner;
    return {
      queryRunner,
      afterCommit: jest.fn(),
    } as unknown as UpgradeWorkspaceTransaction;
  };

  beforeEach(() => {
    sync.mockReset().mockResolvedValue(undefined);
    social.mockReset().mockResolvedValue({ canDeleteOldFields: true });
    currentRunner.mockReset();
  });

  it.each([
    'dryRun',
    'workspace',
    'callback',
    'inactive',
    'released',
    'manager',
    'lock',
  ])('refuses %s before the first body', async (kind) => {
    const tx = makeTx();
    currentRunner.mockReturnValue(kind === 'lock' ? {} : tx.queryRunner);
    if (kind === 'callback')
      (tx as { afterCommit?: unknown }).afterCommit = undefined;
    const mutableRunner = tx.queryRunner as unknown as {
      isTransactionActive: boolean;
      isReleased: boolean;
    };
    if (kind === 'inactive') mutableRunner.isTransactionActive = false;
    if (kind === 'released') mutableRunner.isReleased = true;
    if (kind === 'manager')
      (tx.queryRunner.manager as { queryRunner?: unknown }).queryRunner = {};
    await expect(
      service.runInUpgradeTransaction(
        {
          ...args,
          options: { dryRun: kind === 'dryRun' },
          workspaceId: kind === 'workspace' ? 'invalid' : workspaceId,
        },
        tx,
      ),
    ).rejects.toThrow();
    expect(sync).not.toHaveBeenCalled();
    expect(social).not.toHaveBeenCalled();
  });

  it('uses one exact transaction and schema for two fresh synchronizations around social verification', async () => {
    const tx = makeTx();
    currentRunner.mockReturnValue(tx.queryRunner);
    const order: string[] = [];
    sync.mockImplementation(async () => {
      order.push('sync');
    });
    social.mockImplementation(async () => {
      order.push('social');
      return { canDeleteOldFields: true };
    });
    await service.runInUpgradeTransaction(args, tx);
    expect(order).toEqual(['sync', 'social', 'sync']);
    expect(sync.mock.calls[0][2]).toBe(tx);
    expect(sync.mock.calls[1][2]).toBe(tx);
    expect(
      sync.mock.calls[0][1].explicitObsoleteUniversalIdentifiersByMetadataName,
    ).toBeUndefined();
    expect([
      ...sync.mock.calls[1][1]
        .explicitObsoleteUniversalIdentifiersByMetadataName.viewField,
    ]).toHaveLength(4);
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        upgradeTransaction: tx,
        schemaName: expect.stringMatching(/^workspace_/),
      }),
    );
  });

  it('does not run the second synchronization after failed verification', async () => {
    const tx = makeTx();
    currentRunner.mockReturnValue(tx.queryRunner);
    social.mockResolvedValue({ canDeleteOldFields: false });
    await expect(service.runInUpgradeTransaction(args, tx)).rejects.toThrow(
      'verification failed',
    );
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
