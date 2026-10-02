import { type DataSource, type QueryRunner } from 'typeorm';

import { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { type UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import { type WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

describe('InstanceCommandRunnerService pinned commit boundary', () => {
  it('does not emit a false failure receipt when success COMMIT outcome is uncertain', async () => {
    const commitTransaction = jest
      .fn()
      .mockRejectedValue(new Error('connection lost during COMMIT'));
    const queryRunner = {
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction,
      rollbackTransaction: jest.fn(),
      isTransactionActive: false,
    } as unknown as QueryRunner;
    const recordUpgradeMigration = jest.fn().mockResolvedValue(undefined);
    const service = new InstanceCommandRunnerService(
      {} as DataSource,
      {
        get: jest.fn().mockReturnValue('2.20.0'),
      } as unknown as TwentyConfigService,
      {
        isLastAttemptCompleted: jest.fn().mockResolvedValue(false),
        recordUpgradeMigration,
      } as unknown as UpgradeMigrationService,
      {
        getActiveOrSuspendedWorkspaceIds: jest.fn().mockResolvedValue([]),
      } as unknown as WorkspaceVersionService,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
      } as unknown as UpgradeStatusService,
      {
        withLock: (operation: () => Promise<unknown>) => operation(),
        currentRunner: () => queryRunner,
      } as unknown as UpgradeWriteLockService,
    );

    await expect(
      service.runFastInstanceCommand({
        name: 'native',
        command: { up: jest.fn(), down: jest.fn() },
      }),
    ).rejects.toThrow('connection lost during COMMIT');
    expect(recordUpgradeMigration).toHaveBeenCalledTimes(1);
    expect(recordUpgradeMigration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', queryRunner }),
    );
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
