import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@RegisteredWorkspaceCommand('2.20.0', 1784266302000)
@Command({
  name: 'upgrade:2-20:normalize-legacy-myah-outreach-workflow-relation-metadata',
  description:
    'Normalize legacy Campaign Outreach relation metadata before source-controlled synchronization',
})
export class NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
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
  }
}
