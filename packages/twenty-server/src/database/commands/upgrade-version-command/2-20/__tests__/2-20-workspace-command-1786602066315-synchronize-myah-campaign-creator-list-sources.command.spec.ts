import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignCreatorListSourcesCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786602066315-synchronize-myah-campaign-creator-list-sources.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS,
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

const SOURCE_OBJECT_UNIVERSAL_IDENTIFIER =
  '7973bfbb-ff71-47c3-94a6-9e4435eca326';
const SOURCE_FIELD_UNIVERSAL_IDENTIFIERS = [
  '4712068c-2d39-4361-a408-4fc01511a65d',
  '07737c3b-8c94-4466-bf0d-706bc2525742',
  'da8ac377-d33f-4061-a093-e56cea8896b2',
  'bd58f15a-31c3-454b-849c-43679a06bf05',
  '297b8ce4-e729-4d6d-a1f7-cf49ffb0a683',
  '756b0892-95bf-4bdb-8884-4ab6f249126a',
  '3fa0973c-6e26-4330-b219-901b0f5a9f24',
  '26b9217a-80a4-4ba8-9b11-920d1e867598',
  '2fdb9140-873c-4984-8e00-a8656e268f4c',
  'e4706d30-af24-4437-a8a1-466e485e71db',
  '27519164-4421-49a2-a988-8bd4a6f18f89',
  'c0587a89-8b1e-4067-9d1c-6f050528c34b',
].sort();
const SOURCE_INDEX_UNIVERSAL_IDENTIFIER =
  '83039fc0-5444-42d6-9f8d-1e4bb4f92841';
const SOURCE_VIEW_FIELD_UNIVERSAL_IDENTIFIER =
  'bdd20323-9414-4425-8a5a-283d0222c3b6';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const buildDataSource = () => {
  const query = jest.fn(
    async (
      _sql: string,
      _parameters: unknown,
      _queryRunner: unknown,
      options?: { shouldBypassPermissionChecks?: boolean },
    ) => {
      if (!options?.shouldBypassPermissionChecks) {
        throw new Error('Workspace raw SQL requires an explicit bypass');
      }
    },
  );

  return { dataSource: { query }, query };
};

const normalizeSelection = (selection: Record<string, Set<string>>) =>
  Object.fromEntries(
    Object.entries(selection).map(([type, universalIdentifiers]) => [
      type,
      [...universalIdentifiers].sort(),
    ]),
  );

const createCommand = ({
  synchronizeWorkspace = jest.fn().mockResolvedValue(undefined),
  campaignExists = true,
}: {
  synchronizeWorkspace?: jest.Mock;
  campaignExists?: boolean;
} = {}) => {
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignExists
        ? { [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {} }
        : {},
    },
  });

  return {
    command: new SynchronizeMyahCampaignCreatorListSourcesCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as unknown as SynchronizeSourceControlledMyahMetadataService,
      { getOrRecompute } as unknown as WorkspaceCacheService,
    ),
    getOrRecompute,
    synchronizeWorkspace,
  };
};

describe('SynchronizeMyahCampaignCreatorListSourcesCommand', () => {
  it('registers the later source migration in the active version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignCreatorListSourcesCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1786602066315 });
  });

  it('synchronizes only retained source metadata, permissions, and its Influencers column', async () => {
    const { dataSource } = buildDataSource();
    const { command, synchronizeWorkspace } = createCommand();

    await command.runOnWorkspace({ ...args, dataSource: dataSource as never });

    expect(normalizeSelection(synchronizeWorkspace.mock.calls[0][1])).toEqual({
      objectMetadata: [SOURCE_OBJECT_UNIVERSAL_IDENTIFIER],
      fieldMetadata: SOURCE_FIELD_UNIVERSAL_IDENTIFIERS,
      index: [SOURCE_INDEX_UNIVERSAL_IDENTIFIER],
      viewField: [SOURCE_VIEW_FIELD_UNIVERSAL_IDENTIFIER],
      objectPermission: MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
        ({ objectMetadataUniversalIdentifier }) =>
          objectMetadataUniversalIdentifier === SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
      )
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
      fieldPermission: MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS.filter(
        ({ objectMetadataUniversalIdentifier }) =>
          objectMetadataUniversalIdentifier === SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
      )
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    });
    expect(synchronizeWorkspace.mock.calls[0][2]).toEqual({
      synchronizeExistingSelectedMetadata: true,
    });
  });

  it('inserts only currently provable active List source pairs after metadata synchronization', async () => {
    const { dataSource, query } = buildDataSource();
    const { command, synchronizeWorkspace } = createCommand();
    const schemaName = getWorkspaceSchemaName(args.workspaceId);

    await command.runOnWorkspace({ ...args, dataSource: dataSource as never });

    expect(synchronizeWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      query.mock.invocationCallOrder[0],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        `INSERT INTO "${schemaName}"."campaignCreatorListSource"`,
      ),
      undefined,
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    const [sql] = query.mock.calls[0];
    expect(sql).toContain(
      'SELECT "campaignCreator"."id", "campaignCreatorList"."creatorListId"',
    );
    expect(sql).toContain(
      `INNER JOIN "${schemaName}"."campaignCreatorList" AS "campaignCreatorList"`,
    );
    expect(sql).toContain(
      'ON "campaignCreatorList"."campaignId" = "campaignCreator"."campaignId"',
    );
    expect(sql).toContain('AND "campaignCreatorList"."deletedAt" IS NULL');
    expect(sql).toContain(
      `INNER JOIN "${schemaName}"."creatorListMember" AS "creatorListMember"`,
    );
    expect(sql).toContain(
      'ON "creatorListMember"."creatorListId" = "campaignCreatorList"."creatorListId"',
    );
    expect(sql).toContain(
      'AND "creatorListMember"."creatorId" = "campaignCreator"."creatorId"',
    );
    expect(sql).toContain('AND "creatorListMember"."deletedAt" IS NULL');
    expect(sql).toContain('WHERE "campaignCreator"."deletedAt" IS NULL');
    expect(sql).toMatch(
      /ON CONFLICT \("campaignCreatorId", "creatorListId"\)\s+WHERE "deletedAt" IS NULL DO NOTHING;/,
    );
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/i);
  });

  it('does not run the data backfill in dry-run mode', async () => {
    const { dataSource, query } = buildDataSource();
    const { command, synchronizeWorkspace } = createCommand();

    await command.runOnWorkspace({
      ...args,
      dataSource: dataSource as never,
      options: { dryRun: true },
    });

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not synchronize or query when Campaign metadata is absent', async () => {
    const { dataSource, query } = buildDataSource();
    const { command, getOrRecompute, synchronizeWorkspace } = createCommand({
      campaignExists: false,
    });

    await command.runOnWorkspace({ ...args, dataSource: dataSource as never });

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
