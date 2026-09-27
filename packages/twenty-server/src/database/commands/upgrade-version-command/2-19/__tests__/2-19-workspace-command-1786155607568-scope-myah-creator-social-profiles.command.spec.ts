import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ResynchronizeMyahStandardApplicationCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785453080000-resynchronize-myah-standard-application.command';
import { ScopeMyahCreatorSocialProfilesCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786155607568-scope-myah-creator-social-profiles.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const socialProfile = MYAH_STANDARD_OBJECTS.socialProfile;
const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: {} as never,
};

const buildCommand = ({
  object = true,
  view = true,
  field = true,
}: {
  object?: boolean;
  view?: boolean;
  field?: boolean;
} = {}) => {
  const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: object
        ? { [socialProfile.universalIdentifier]: {} }
        : {},
    },
    flatViewMaps: {
      byUniversalIdentifier: view
        ? { [socialProfile.views.socialProfiles.universalIdentifier]: {} }
        : {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: field
        ? { [socialProfile.fields.creator.universalIdentifier]: {} }
        : {},
    },
  });
  const command = new ScopeMyahCreatorSocialProfilesCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );

  return { command, synchronizeWorkspace, getOrRecompute };
};

describe('ScopeMyahCreatorSocialProfilesCommand', () => {
  it('uses a new ordered migration identity without rewriting the applied resynchronization', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        ResynchronizeMyahStandardApplicationCommand,
      ),
    ).toMatchObject({ version: '2.19.0', timestamp: 1785453080000 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        ScopeMyahCreatorSocialProfilesCommand,
      ),
    ).toMatchObject({ version: '2.19.0', timestamp: 1786155607568 });
  });

  it('selects only the canonical filter, preserving other saved view filters and fields', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(synchronizeWorkspace).toHaveBeenCalledWith(
      args,
      {
        viewFilter: new Set([
          socialProfile.views.socialProfiles.viewFilters.creatorCurrentRecord
            .universalIdentifier,
        ]),
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  });

  it('leaves non-Myah workspaces untouched', async () => {
    const { command, synchronizeWorkspace } = buildCommand({ object: false });

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it.each([{ view: false }, { field: false }])(
    'fails closed when the relation or embedded view is missing: %o',
    async (missing) => {
      const { command, synchronizeWorkspace } = buildCommand(missing);

      await expect(command.runOnWorkspace(args)).rejects.toThrow(
        'SocialProfile widget view or Creator relation is missing',
      );
      expect(synchronizeWorkspace).not.toHaveBeenCalled();
    },
  );

  it('does not synchronize without a workspace data source', async () => {
    const { command, synchronizeWorkspace, getOrRecompute } = buildCommand();

    await command.runOnWorkspace({ ...args, dataSource: undefined });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
