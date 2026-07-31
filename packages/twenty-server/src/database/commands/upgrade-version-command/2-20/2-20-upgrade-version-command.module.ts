import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { SynchronizeMyahCreatorCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302003-synchronize-myah-creator-crm-metadata.command';
import { SynchronizeMyahCreatorCrmSearchMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302004-synchronize-myah-creator-crm-search-metadata.command';
import { MigrateMyahCreatorImportMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302006-migrate-myah-creator-import-metadata.command';
import { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';

import { RemoveReplacedTwentyCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302002-remove-replaced-twenty-crm-metadata.command';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { WorkspaceMetadataVersionModule } from 'src/engine/metadata-modules/workspace-metadata-version/workspace-metadata-version.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

@Module({
  imports: [
    ApplicationModule,
    WorkspaceCacheModule,
    WorkspaceIteratorModule,
    WorkspaceMetadataVersionModule,
    WorkspaceMigrationModule,
    WorkspaceMigrationRunnerModule,
  ],
  providers: [
    SynchronizeMyahStandardMetadataCommand,
    SynchronizeMyahCreatorCrmMetadataCommand,
    SynchronizeMyahCreatorCrmSearchMetadataCommand,
    MigrateMyahCreatorImportMetadataCommand,
    MigrateMyahCreatorSocialLinksService,

    RemoveReplacedTwentyCrmMetadataCommand,
  ],
  exports: [
    SynchronizeMyahStandardMetadataCommand,
    MigrateMyahCreatorSocialLinksService,
  ],
})
export class V2_20_UpgradeVersionCommandModule {}
