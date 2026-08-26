import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { SynchronizeMyahCampaignCreatorListSourcesCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786602066315-synchronize-myah-campaign-creator-list-sources.command';
import { RemoveMyahCampaignCreatorListsWidgetCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787298665000-remove-myah-campaign-creator-lists-widget.command';
import { SynchronizeMyahCampaignEmailSignatureMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787721600000-synchronize-myah-campaign-email-signature-metadata.command';
import { SynchronizeManagedEmailCampaignAssignmentMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786000001000-synchronize-managed-email-campaign-assignment-metadata.command';
import { SynchronizeMyahCampaignAutomationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786526100000-synchronize-myah-campaign-automation-metadata.command';
import { SynchronizeMyahCreatorCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302003-synchronize-myah-creator-crm-metadata.command';
import { SynchronizeMyahCreatorCrmSearchMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302004-synchronize-myah-creator-crm-search-metadata.command';
import { MigrateMyahCreatorImportMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302006-migrate-myah-creator-import-metadata.command';
import { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { RemoveReplacedTwentyCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302002-remove-replaced-twenty-crm-metadata.command';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { WorkspaceMetadataVersionModule } from 'src/engine/metadata-modules/workspace-metadata-version/workspace-metadata-version.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FieldMetadataEntity]),
    ApplicationModule,
    WorkspaceCacheModule,
    WorkspaceIteratorModule,
    WorkspaceMetadataVersionModule,
    WorkspaceMigrationModule,
    WorkspaceMigrationRunnerModule,
  ],
  providers: [
    SynchronizeMyahStandardMetadataCommand,
    SynchronizeManagedEmailCampaignAssignmentMetadataCommand,
    SynchronizeSourceControlledMyahMetadataService,
    SynchronizeMyahCreatorCrmMetadataCommand,
    SynchronizeMyahCampaignAutomationMetadataCommand,
    SynchronizeMyahCampaignCreatorListSourcesCommand,
    RemoveMyahCampaignCreatorListsWidgetCommand,
    SynchronizeMyahCampaignEmailSignatureMetadataCommand,
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
