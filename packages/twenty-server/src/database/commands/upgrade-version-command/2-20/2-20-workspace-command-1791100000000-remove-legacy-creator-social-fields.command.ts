import { Command } from 'nest-commander';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

// Per-platform account fields that MYAH-409 replaced with Social profiles
// (handle, URL, link, followers) and Creator notes (bio and statistics).
export const LEGACY_CREATOR_SOCIAL_FIELD_NAME =
  /^(instagram|tiktok|youtube|twitter|twitch|patreon)[A-Z]/;

// Removes those fields from workspaces created before MYAH-409; fresh
// workspaces never had them. Relations (Instagram conversations and drafts)
// stay. Every legacy handle and URL was verified present in Social profiles
// on 2026-10-04 before this was released (MYAH-445).
@RegisteredWorkspaceCommand('2.20.0', 1791100000000)
@Command({
  name: 'upgrade:2-20:remove-legacy-creator-social-fields',
  description:
    'Remove per-platform Creator fields replaced by Social profiles and Notes',
})
export class RemoveLegacyCreatorSocialFieldsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource) return;

    // Read fresh metadata: a stale cache must not make this silently skip.
    const cacheKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'] = [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
    ];
    await this.workspaceCacheService.invalidateAndRecompute(
      args.workspaceId,
      cacheKeys,
    );
    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(
        args.workspaceId,
        cacheKeys,
      );
    const creator =
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ];
    if (!creator) return;

    const legacyFields = Object.values(
      flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(
      (field) =>
        field !== undefined &&
        field.objectMetadataId === creator.id &&
        field.type !== FieldMetadataType.RELATION &&
        field.type !== FieldMetadataType.MORPH_RELATION &&
        LEGACY_CREATOR_SOCIAL_FIELD_NAME.test(field.name),
    );
    if (legacyFields.length === 0) return;

    this.logger.log(
      `Removing ${legacyFields.length} legacy Creator social fields from workspace ${args.workspaceId}`,
    );
    await this.synchronizer.synchronizeWorkspace(
      args,
      {},
      {
        deletionSelection: {
          fieldMetadata: new Set(
            legacyFields.map((field) => field!.universalIdentifier),
          ),
        },
      },
    );
  }
}
