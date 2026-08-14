import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@RegisteredWorkspaceCommand('2.20.0', 1786688940000)
@Command({
  name: 'upgrade:2-20:normalize-legacy-myah-outreach-workflow-relation-metadata',
  description:
    'Normalize legacy Campaign Outreach relation metadata and re-synchronize source-controlled metadata',
})
export class NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    const { workspaceId, options } = args;
    if (options.dryRun) {
      return;
    }

    const where = {
      universalIdentifier:
        STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier,
      workspaceId,
    };
    const outreachCampaignField =
      await this.fieldMetadataRepository.findOne({
        select: { isUnique: true },
        where,
      });

    if (outreachCampaignField?.isUnique !== true) {
      return;
    }

    await this.fieldMetadataRepository.update(where, { isUnique: false });
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatFieldMetadataMaps',
      'ORMEntityMetadatas',
      'graphQLResolverNameMap',
    ]);
    await this.workspaceMetadataVersionService.incrementMetadataVersion(
      workspaceId,
    );
    await this.synchronizeMyahStandardMetadataCommand.synchronizeWorkspace(args);
  }
}
