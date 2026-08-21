import { MODULE_METADATA } from '@nestjs/common/constants';

import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { SynchronizeMyahCampaignCreatorListSourcesCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786602066315-synchronize-myah-campaign-creator-list-sources.command';
import { RepairMyahCampaignInfluencersWidgetCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787304745000-repair-myah-campaign-influencers-widget.command';
import { SynchronizeMyahCampaignAutomationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786526100000-synchronize-myah-campaign-automation-metadata.command';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

describe('V2_20_UpgradeVersionCommandModule', () => {
  it('directly imports the workspace migration runner for social-link cache invalidation', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(imports).toContain(WorkspaceMigrationRunnerModule);
  });

  it('provides the retained Campaign Creator List source migration', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeMyahCampaignCreatorListSourcesCommand,
    );
  });

  it('provides the Campaign Influencers widget repair migration', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      RepairMyahCampaignInfluencersWidgetCommand,
    );
  });

  it('retains the existing Campaign automation metadata migration', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeMyahCampaignAutomationMetadataCommand,
    );
  });
});
