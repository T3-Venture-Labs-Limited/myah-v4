import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { ResynchronizeMyahStandardApplicationCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785453080000-resynchronize-myah-standard-application.command';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';

describe('ResynchronizeMyahStandardApplicationCommand', () => {
  const workspaceId = '20202020-0000-4000-8000-000000000001';
  const synchronizeTwentyStandardApplicationOrThrow = jest
    .fn()
    .mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        [MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier]: {
          universalIdentifier:
            MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
        },
      },
    },
  });
  const command = new ResynchronizeMyahStandardApplicationCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeTwentyStandardApplicationOrThrow,
    } as unknown as TwentyStandardApplicationService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resynchronizes the canonical Myah profile for an existing workspace', async () => {
    await command.runOnWorkspace({
      workspaceId,
      options: {},
      index: 0,
      total: 1,
    });

    expect(synchronizeTwentyStandardApplicationOrThrow).toHaveBeenCalledWith({
      workspaceId,
      profile: 'myah',
    });
  });

  it('skips a workspace without canonical Myah metadata', async () => {
    getOrRecompute.mockResolvedValueOnce({
      flatObjectMetadataMaps: { byUniversalIdentifier: {} },
    });

    await command.runOnWorkspace({
      workspaceId,
      options: {},
      index: 0,
      total: 1,
    });

    expect(synchronizeTwentyStandardApplicationOrThrow).not.toHaveBeenCalled();
  });

  it('does not mutate a workspace during dry run', async () => {
    await command.runOnWorkspace({
      workspaceId,
      options: { dryRun: true },
      index: 0,
      total: 1,
    });

    expect(synchronizeTwentyStandardApplicationOrThrow).not.toHaveBeenCalled();
  });
});
