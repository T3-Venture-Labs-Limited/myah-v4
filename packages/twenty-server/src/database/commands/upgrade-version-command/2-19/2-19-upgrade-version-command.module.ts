import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { BackfillWorkspaceCustomApplicationRegistrationCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1782853718000-backfill-workspace-custom-application-registration.command';
import { BackfillSystemUniqueIndexUniversalIdentifierCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1783093620000-backfill-system-unique-index-universal-identifier.command';
import { ResynchronizeMyahStandardApplicationCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785453080000-resynchronize-myah-standard-application.command';
import { MigrateOpenRouterModelIdentitiesCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1784485121000-migrate-openrouter-model-identities.command';
import { SynchronizeMyahCreatorCrmSearchMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785240016000-synchronize-myah-creator-crm-search-metadata.command';
import { SynchronizeMyahInboxMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785470249826-synchronize-myah-inbox-metadata.command';
import { SynchronizeMyahCreatorPageLayoutMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785470249827-synchronize-myah-creator-page-layout-metadata.command';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { MigrateMyahCreatorImportMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785283200000-migrate-myah-creator-import-metadata.command';
import { SynchronizeMyahCampaignInstructionsMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785497244000-synchronize-myah-campaign-instructions-metadata.command';
import { SynchronizeMyahCampaignPageLayoutCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785839371449-synchronize-myah-campaign-page-layout.command';
import { SynchronizeMyahCampaignAudienceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786140350665-synchronize-myah-campaign-audience.command';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { WorkspaceMetadataVersionModule } from 'src/engine/metadata-modules/workspace-metadata-version/workspace-metadata-version.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { TwentyStandardApplicationModule } from 'src/engine/workspace-manager/twenty-standard-application/twenty-standard-application.module';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

@Module({
  imports: [
    ApplicationModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      ApplicationEntity,
      FieldMetadataEntity,
      IndexMetadataEntity,
    ]),
    WorkspaceIteratorModule,
    WorkspaceCacheModule,
    WorkspaceMetadataVersionModule,
    WorkspaceMigrationModule,
    TwentyStandardApplicationModule,
    WorkspaceMigrationRunnerModule,
    V2_20_UpgradeVersionCommandModule,
  ],
  providers: [
    BackfillWorkspaceCustomApplicationRegistrationCommand,
    BackfillSystemUniqueIndexUniversalIdentifierCommand,
    ResynchronizeMyahStandardApplicationCommand,
    MigrateOpenRouterModelIdentitiesCommand,
    SynchronizeMyahCreatorCrmSearchMetadataCommand,
    SynchronizeMyahInboxMetadataCommand,
    SynchronizeMyahCreatorPageLayoutMetadataCommand,
    SynchronizeSourceControlledMyahMetadataService,
    MigrateMyahCreatorImportMetadataCommand,
    SynchronizeMyahCampaignInstructionsMetadataCommand,
    SynchronizeMyahCampaignAudienceCommand,
    SynchronizeMyahCampaignPageLayoutCommand,
  ],
})
export class V2_19_UpgradeVersionCommandModule {}
