import { CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand } from './2-20-instance-command-fast-1789645911003-create-myah-inbox-email-general-provenance';
import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from './2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { AddCampaignReplyAmbiguitySnapshotFastInstanceCommand } from './2-20-instance-command-fast-1790000000002-add-campaign-reply-ambiguity-snapshot';
import { CreateCampaignEmailBaselineFastInstanceCommand } from './2-20-instance-command-fast-1790000000004-create-campaign-email-baseline';
import { AddCampaignEmailAccountIncarnationFastInstanceCommand } from './2-20-instance-command-fast-1790000000005-add-campaign-email-account-incarnation';
import { AddCampaignEmailWorkIdentityFastInstanceCommand } from './2-20-instance-command-fast-1790000000006-add-campaign-email-work-identity';
import { CreateCampaignEmailWorkCollisionFastInstanceCommand } from './2-20-instance-command-fast-1790000000007-create-campaign-email-work-collision';
import { SynchronizeMyahPartnershipFactsCommand } from './2-20-workspace-command-1789730000001-synchronize-myah-partnership-facts.command';
import { SynchronizeCampaignReplyAuthorityCommand } from './2-20-workspace-command-1790000000003-synchronize-campaign-reply-authority.command';
import { CreateMyahCampaignReplyEvidenceFastInstanceCommand } from './2-20-instance-command-fast-1790141137300-create-myah-campaign-reply-evidence';
import { AddMyahInboxReplyDraftIncomingBaselineFastInstanceCommand } from './2-20-instance-command-fast-1790141137400-add-myah-inbox-reply-draft-incoming-baseline';
import { InstallMyahInboxEmailGeneralProvenanceCommand } from './2-20-workspace-command-1789645911004-install-myah-inbox-email-general-provenance.command';
import { RetireBrandBrainMetadataCommand } from './2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { RetireShopifyConnectionsCommand } from './2-20-workspace-command-1790000000411-retire-shopify-connections.command';
import { RetireCalendarSyncCommand } from './2-20-workspace-command-1790000000412-retire-calendar-sync.command';
import { RetireDashboardCommand } from './2-20-workspace-command-1790000000413-retire-dashboard.command';
import { SynchronizeInstagramSourceControlledMetadataCommand } from './2-20-workspace-command-1790491923604-synchronize-instagram-source-controlled-metadata.command';
import { Module } from '@nestjs/common';
import { SynchronizeInstagramComposerMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748005-synchronize-instagram-composer-metadata.command';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { SynchronizeCampaignLifecycleStatusMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971535-synchronize-campaign-lifecycle-status-metadata.command';
import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';
import { InitializeMyahInboxContactTriageWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748001-initialize-myah-inbox-contact-triage.command';
import { CatchUpMyahInboxContactTriageWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748002-catch-up-myah-inbox-contact-triage.command';
import { CatchUpCampaignActivityControlMetadataWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748003-catch-up-campaign-activity-control-metadata.command';
import { CreateMyahInboxReplyContextDraftsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911001-create-myah-inbox-reply-context-drafts';
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
import { RefreshMyahAssistantSkillsWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789645911006-refresh-myah-assistant-skills.command';
import { RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790161829172-refresh-myah-assistant-skills-for-exact-approvals.command';
import { SynchronizeMyahCampaignAccountMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788537600000-synchronize-myah-campaign-account-metadata.command';
import { SynchronizeCampaignSequenceMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789281428333-synchronize-campaign-sequence-metadata.command';
import { RepairOrphanedObjectNavigationCommandsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788766265947-repair-orphaned-object-navigation-commands.command';
import { SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789065794326-synchronize-myah-campaign-sequence-authorization-metadata.command';

import { RetireLegacyBrandBrainOwnerService } from 'src/database/commands/upgrade-version-command/2-20/services/retire-legacy-brand-brain-owner.service';
import { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { RemoveReplacedTwentyCrmMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302002-remove-replaced-twenty-crm-metadata.command';
import { SynchronizeInstagramMessagePermissionsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619366-synchronize-instagram-message-permissions.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { PageLayoutTabEntity } from 'src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity';
import { PageLayoutWidgetEntity } from 'src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { MyahInboxContactTriageModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-contact-triage.module';
import { WorkspaceMetadataVersionModule } from 'src/engine/metadata-modules/workspace-metadata-version/workspace-metadata-version.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { CoreEntityCacheModule } from 'src/engine/core-entity-cache/core-entity-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FieldMetadataEntity,
      ConnectedAccountEntity,
      CalendarChannelEntity,
      ObjectMetadataEntity,
      PageLayoutEntity,
      PageLayoutTabEntity,
      PageLayoutWidgetEntity,
    ]),
    ApplicationModule,
    MyahInboxContactTriageModule,
    WorkspaceCacheModule,
    WorkspaceCacheStorageModule,
    CoreEntityCacheModule,
    WorkspaceIteratorModule,
    WorkspaceMetadataVersionModule,
    WorkspaceMigrationModule,
    WorkspaceMigrationRunnerModule,
  ],
  providers: [
    SynchronizeInstagramComposerMetadataCommand,
    SynchronizeMyahStandardMetadataCommand,
    RetireLegacyBrandBrainOwnerService,
    PinnedWorkspaceMetadataSnapshotLoaderService,
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
    SynchronizeCampaignActivityControlMetadataCommand,
    InitializeMyahInboxContactTriageWorkspaceCommand,
    CatchUpMyahInboxContactTriageWorkspaceCommand,
    CatchUpCampaignActivityControlMetadataWorkspaceCommand,
    CreateMyahInboxReplyContextDraftsFastInstanceCommand,
    CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand,
    CreateCampaignPartnershipWorkItemFastInstanceCommand,
    AddCampaignReplyAmbiguitySnapshotFastInstanceCommand,
    CreateCampaignEmailBaselineFastInstanceCommand,
    AddCampaignEmailAccountIncarnationFastInstanceCommand,
    AddCampaignEmailWorkIdentityFastInstanceCommand,
    CreateCampaignEmailWorkCollisionFastInstanceCommand,
    CreateMyahCampaignReplyEvidenceFastInstanceCommand,
    AddMyahInboxReplyDraftIncomingBaselineFastInstanceCommand,
    InstallMyahInboxEmailGeneralProvenanceCommand,
    SynchronizeMyahPartnershipFactsCommand,
    SynchronizeCampaignReplyAuthorityCommand,
    RetireBrandBrainMetadataCommand,
    RetireShopifyConnectionsCommand,
    RetireCalendarSyncCommand,
    RetireDashboardCommand,
    SynchronizeInstagramSourceControlledMetadataCommand,
    RefreshMyahAssistantSkillsWorkspaceCommand,
    RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand,
  ],
  exports: [
    VerifyInstagramSecurityCutoverWorkspaceCommand,
    SynchronizeMyahStandardMetadataCommand,
    SynchronizeInstagramSourceControlledMetadataCommand,
    MigrateMyahCreatorSocialLinksService,
  ],
})
export class V2_20_UpgradeVersionCommandModule {}
