import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302000-normalize-legacy-myah-outreach-workflow-relation-metadata.command';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import type { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type { Repository } from 'typeorm';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const where = {
  universalIdentifier:
    STANDARD_OBJECTS.workflow.fields.outreachCampaign.universalIdentifier,
  workspaceId: args.workspaceId,
};

describe('NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand', () => {
  it('runs before source-controlled synchronization', () => {
    const commandMetadata = getRegisteredWorkspaceCommandMetadata(
      NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand,
    );
    const synchronizerMetadata = getRegisteredWorkspaceCommandMetadata(
      SynchronizeMyahStandardMetadataCommand,
    );

    if (
      commandMetadata === undefined ||
      synchronizerMetadata === undefined
    ) {
      throw new Error('Workspace command registration is required');
    }

    expect(commandMetadata).toMatchObject({
      version: '2.20.0',
      timestamp: 1784266302000,
    });
    expect(commandMetadata.timestamp).toBeLessThan(
      synchronizerMetadata.timestamp,
    );
  });

  it('repairs a legacy unique relation and evicts memoized metadata before synchronization', async () => {
    const findOne = jest.fn().mockResolvedValue({ isUnique: true });
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const invalidateAndRecompute = jest.fn().mockResolvedValue(undefined);
    const incrementMetadataVersion = jest.fn().mockResolvedValue(undefined);
    const command = new NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand(
      {} as WorkspaceIteratorService,
      { findOne, update } as unknown as Repository<FieldMetadataEntity>,
      { invalidateAndRecompute } as unknown as WorkspaceCacheService,
      {
        incrementMetadataVersion,
      } as unknown as WorkspaceMetadataVersionService,
    );

    await command.runOnWorkspace(args);

    expect(findOne).toHaveBeenCalledWith({
      select: { isUnique: true },
      where,
    });
    expect(update).toHaveBeenCalledWith(where, { isUnique: false });
    expect(invalidateAndRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatFieldMetadataMaps',
      'ORMEntityMetadatas',
      'graphQLResolverNameMap',
    ]);
    expect(incrementMetadataVersion).toHaveBeenCalledWith(args.workspaceId);
  });

  it('does not update current or absent metadata', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ isUnique: false })
      .mockResolvedValueOnce(null);
    const update = jest.fn();
    const invalidateAndRecompute = jest.fn();
    const incrementMetadataVersion = jest.fn();
    const command = new NormalizeLegacyMyahOutreachWorkflowRelationMetadataCommand(
      {} as WorkspaceIteratorService,
      { findOne, update } as unknown as Repository<FieldMetadataEntity>,
      { invalidateAndRecompute } as unknown as WorkspaceCacheService,
      {
        incrementMetadataVersion,
      } as unknown as WorkspaceMetadataVersionService,
    );

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    expect(update).not.toHaveBeenCalled();
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
  });
});
