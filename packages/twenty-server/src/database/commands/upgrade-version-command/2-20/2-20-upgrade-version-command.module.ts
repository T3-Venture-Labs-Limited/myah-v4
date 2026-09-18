import { Module } from '@nestjs/common';
import { SynchronizeInstagramComposerMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748005-synchronize-instagram-composer-metadata.command';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { SynchronizeCampaignLifecycleStatusMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971535-synchronize-campaign-lifecycle-status-metadata.command';
import { InitializeMyahInboxContactTriageWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748001-initialize-myah-inbox-contact-triage.command';
import { CatchUpMyahInboxContactTriageWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748002-catch-up-myah-inbox-contact-triage.command';
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
import { SynchronizeMyahAssistantSkillsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { SynchronizeMyahCampaignAccountMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788537600000-synchronize-myah-campaign-account-metadata.command';
import { SynchronizeCampaignSequenceMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789281428333-synchronize-campaign-sequence-metadata.command';
import { RepairOrphanedObjectNavigationCommandsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788766265947-repair-orphaned-object-navigation-commands.command';
import { SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789065794326-synchronize-myah-campaign-sequence-authorization-metadata.command';

import { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { RemoveReplacedTwentyCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302002-remove-replaced-twenty-crm-metadata.command';
import { SynchronizeInstagramMessagePermissionsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619366-synchronize-instagram-message-permissions.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { MyahInboxContactTriageModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-contact-triage.module';
import { WorkspaceMetadataVersionModule } from 'src/engine/metadata-modules/workspace-metadata-version/workspace-metadata-version.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FieldMetadataEntity]),
    ApplicationModule,
    MyahInboxContactTriageModule,
    WorkspaceCacheModule,
    WorkspaceIteratorModule,
    WorkspaceMetadataVersionModule,
    WorkspaceMigrationModule,
    WorkspaceMigrationRunnerModule,
  ],
  providers: [
    SynchronizeInstagramComposerMetadataCommand,
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
    SynchronizeMyahAssistantSkillsCommand,
    SynchronizeMyahCampaignAccountMetadataCommand,
    SynchronizeCampaignSequenceMetadataCommand,
    MigrateMyahCreatorSocialLinksService,
    RemoveReplacedTwentyCrmMetadataCommand,
    SynchronizeInstagramMessagePermissionsCommand,
    InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
    BackfillComposioInstagramHistoryWorkspaceCommand,
    VerifyInstagramSecurityCutoverWorkspaceCommand,
    RepairOrphanedObjectNavigationCommandsCommand,
    SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand,
    SynchronizeCampaignLifecycleStatusMetadataCommand,
    InitializeMyahInboxContactTriageWorkspaceCommand,
    CatchUpMyahInboxContactTriageWorkspaceCommand,
  ],
  exports: [
    VerifyInstagramSecurityCutoverWorkspaceCommand,
    SynchronizeMyahStandardMetadataCommand,
    MigrateMyahCreatorSocialLinksService,
  ],
})
export class V2_20_UpgradeVersionCommandModule {}
