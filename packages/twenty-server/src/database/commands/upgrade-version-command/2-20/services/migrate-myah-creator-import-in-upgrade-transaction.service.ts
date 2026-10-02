import { isValidUuid } from 'twenty-shared/utils';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import {
  MigrateMyahCreatorSocialLinksService,
  OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

// Dormant: no provider registration, command decorator, ordered hook or receipt.
// Admission still requires physical SQL, recovery and event-policy evidence.
export class MigrateMyahCreatorImportInUpgradeTransactionService {
  constructor(
    private readonly synchronizer: SynchronizeMyahStandardMetadataCommand,
    private readonly social: MigrateMyahCreatorSocialLinksService,
    private readonly writeLock: UpgradeWriteLockService,
  ) {}

  async runInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    tx: UpgradeWorkspaceTransaction,
  ): Promise<void> {
    const runner = tx?.queryRunner;
    if (
      args?.options?.dryRun === true ||
      typeof args?.workspaceId !== 'string' ||
      !isValidUuid(args.workspaceId) ||
      !runner ||
      runner.isReleased ||
      !runner.isTransactionActive ||
      runner.manager?.queryRunner !== runner ||
      typeof tx.afterCommit !== 'function' ||
      this.writeLock.currentRunner() !== runner
    )
      throw new Error(
        'Creator import requires the lock-owned active upgrade transaction',
      );

    const syncOptions = {
      targetObjectUniversalIdentifiers: new Set([
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      ]),
      migrateLegacyMyahApplication: false,
      preserveCreatorImportPermissions: true as const,
    };
    await this.synchronizer.synchronizeCreatorImportInUpgradeTransaction(
      args,
      syncOptions,
      tx,
    );
    const { canDeleteOldFields } =
      await this.social.migrateInUpgradeTransaction({
        workspaceId: args.workspaceId,
        schemaName: getWorkspaceSchemaName(args.workspaceId),
        upgradeTransaction: tx,
      });
    if (!canDeleteOldFields)
      throw new Error('Creator social migration verification failed');
    await this.synchronizer.synchronizeCreatorImportInUpgradeTransaction(
      args,
      {
        ...syncOptions,
        explicitObsoleteUniversalIdentifiersByMetadataName: {
          viewField:
            OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
        },
      },
      tx,
    );
  }
}
