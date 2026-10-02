import { InjectDataSource } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

const offerVersion = MYAH_STANDARD_OBJECTS.partnershipOfferVersion;
const obligation = MYAH_STANDARD_OBJECTS.partnershipObligation;
const objectIds = new Set<string>([
  offerVersion.universalIdentifier,
  obligation.universalIdentifier,
]);

@RegisteredWorkspaceCommand('2.20.0', 1789730000001)
@Command({
  name: 'upgrade:2-20:synchronize-myah-partnership-facts',
  description:
    'Install participation-scoped partnership fact metadata without adopting legacy stages',
})
export class SynchronizeMyahPartnershipFactsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    @InjectDataSource() private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource) {
      throw new Error('Partnership facts require a workspace datasource');
    }
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);
    if (
      !flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier
      ]
    ) {
      throw new Error('CampaignCreator metadata prerequisite is absent');
    }
    // Existing 2.20 workspaces resume their workspace cursor and do not replay a
    // late-added fast instance command. Install its same DDL before metadata sync,
    // without fabricating an instance receipt or advancing another workspace.
    if (!args.options.dryRun) await this.ensureCoreWorkTable();

    await this.synchronizer.synchronizeWorkspace(args, {
      objectMetadata: objectIds,
      index: new Set([
        ...Object.values(offerVersion.indexes).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
        ...Object.values(obligation.indexes).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
      ]),
      fieldMetadata: new Set([
        ...Object.values(offerVersion.fields).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
        ...Object.values(obligation.fields).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
          .universalIdentifier,
        STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
      ]),
      objectPermission: new Set(
        MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
          ({ objectMetadataUniversalIdentifier }) =>
            objectIds.has(objectMetadataUniversalIdentifier),
        ).map(({ universalIdentifier }) => universalIdentifier),
      ),
    });
  }

  private async ensureCoreWorkTable(): Promise<void> {
    const runner = this.coreDataSource.createQueryRunner();

    try {
      await runner.connect();
      await runner.startTransaction();
      await new CreateCampaignPartnershipWorkItemFastInstanceCommand().up(
        runner,
      );
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
