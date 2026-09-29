import { MODULE_METADATA } from '@nestjs/common/constants';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { PrioritizeOutreachComposeWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790553600427-prioritize-outreach-compose.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const workspaceId = '20202020-0000-4000-8000-000000000427';
const appId = '20202020-0000-4000-8000-000000000428';
const args: RunOnWorkspaceArgs = {
  workspaceId,
  options: { dryRun: false },
  index: 0,
  total: 1,
};
const commands = [
  STANDARD_COMMAND_MENU_ITEMS.composeEmail,
  STANDARD_COMMAND_MENU_ITEMS.messageOnInstagram,
  STANDARD_COMMAND_MENU_ITEMS.composeCampaign,
];
const oldPositions = [46, 68, 66];
const legacyInstagramExpression =
  'permissionFlags.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL or permissionFlags.SEND_INSTAGRAM_REPLY_TOOL';

const setup = () => {
  const maps = computeTwentyStandardApplicationAllFlatEntityMaps({
    now: '2026-09-28T00:00:00.000Z',
    workspaceId,
    twentyStandardApplicationId: appId,
  }).allFlatEntityMaps.flatCommandMenuItemMaps;
  const migrate = jest.fn(async ({ allFlatEntityOperationByMetadataName: operations }: { allFlatEntityOperationByMetadataName: { commandMenuItem: { flatEntityToCreate: FlatCommandMenuItem[]; flatEntityToUpdate: FlatCommandMenuItem[]; flatEntityToDelete: FlatCommandMenuItem[] } } }) => {
    for (const updated of operations.commandMenuItem.flatEntityToUpdate)
      maps.byUniversalIdentifier[updated.universalIdentifier] = updated;
    return { status: 'success' };
  });
  const app = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest.fn(async () => ({
      twentyStandardFlatApplication: { id: appId, universalIdentifier: '20202020-0000-4000-8000-000000000429' },
    })),
  };
  const cache = { getOrRecompute: jest.fn(async () => ({ flatCommandMenuItemMaps: maps })) };
  const command = new PrioritizeOutreachComposeWorkspaceCommand(
    {} as never,
    app as never,
    cache as never,
    { validateBuildAndRunWorkspaceMigration: migrate } as never,
  );
  return { maps, migrate, command };
};

describe('PrioritizeOutreachComposeWorkspaceCommand', () => {
  it('registers a new command after the applied Instagram source-controlled upgrade', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, V2_20_UpgradeVersionCommandModule)).toContain(
      PrioritizeOutreachComposeWorkspaceCommand,
    );
    expect(getRegisteredWorkspaceCommandMetadata(PrioritizeOutreachComposeWorkspaceCommand)).toMatchObject({
      version: '2.20.0',
      timestamp: 1790553600427,
    });
  });

  it('updates old installed defaults by stable ID once, without changing identifiers or unrelated commands', async () => {
    const h = setup();
    const search = STANDARD_COMMAND_MENU_ITEMS.searchRecords;
    const oldSearch = h.maps.byUniversalIdentifier[search.universalIdentifier];
    commands.forEach((definition, index) => {
      const row = h.maps.byUniversalIdentifier[definition.universalIdentifier]!;
      h.maps.byUniversalIdentifier[definition.universalIdentifier] = {
        ...row,
        position: oldPositions[index],
        conditionalAvailabilityExpression:
          index === 1 ? legacyInstagramExpression : row.conditionalAvailabilityExpression,
      };
    });
    await h.command.runOnWorkspace(args);
    await h.command.runOnWorkspace(args);
    expect(h.migrate).toHaveBeenCalledTimes(1);
    const operations = h.migrate.mock.calls[0][0].allFlatEntityOperationByMetadataName;
    expect(Object.keys(operations)).toEqual(['commandMenuItem']);
    expect(operations.commandMenuItem.flatEntityToCreate).toEqual([]);
    expect(operations.commandMenuItem.flatEntityToDelete).toEqual([]);
    expect(operations.commandMenuItem.flatEntityToUpdate.map((row) => [
      row.universalIdentifier, row.position, row.conditionalAvailabilityExpression,
    ])).toEqual(commands.map((definition) => [
      definition.universalIdentifier,
      definition.position,
      definition.conditionalAvailabilityExpression,
    ]));
    expect(h.maps.byUniversalIdentifier[search.universalIdentifier]).toBe(oldSearch);
  });

  it('preserves a user-reordered override and an unrelated custom default while updating the uncustomized defaults', async () => {
    const h = setup();
    const email = commands[0].universalIdentifier;
    const instagram = commands[1].universalIdentifier;
    const campaign = commands[2].universalIdentifier;
    h.maps.byUniversalIdentifier[email] = {
      ...h.maps.byUniversalIdentifier[email]!,
      position: 46,
      overrides: { position: 90 },
    };
    h.maps.byUniversalIdentifier[instagram] = {
      ...h.maps.byUniversalIdentifier[instagram]!,
      position: 68,
      conditionalAvailabilityExpression: legacyInstagramExpression,
    };
    h.maps.byUniversalIdentifier[campaign] = {
      ...h.maps.byUniversalIdentifier[campaign]!,
      position: 97,
      overrides: { position: 97 },
    };
    await h.command.runOnWorkspace(args);
    expect(h.maps.byUniversalIdentifier[email]?.overrides).toEqual({ position: 90 });
    expect(h.maps.byUniversalIdentifier[email]?.position).toBe(commands[0].position);
    expect(h.maps.byUniversalIdentifier[campaign]?.position).toBe(97);
    expect(h.maps.byUniversalIdentifier[campaign]?.overrides).toEqual({ position: 97 });
    expect(h.maps.byUniversalIdentifier[instagram]?.conditionalAvailabilityExpression).toBeNull();
  });

  it('fails if metadata migration cannot apply the new default', async () => {
    const h = setup();
    h.maps.byUniversalIdentifier[commands[1].universalIdentifier]!.position = 68;
    h.migrate.mockResolvedValueOnce({ status: 'fail' });
    await expect(h.command.runOnWorkspace(args)).rejects.toThrow(
      'Failed to prioritize outreach compose',
    );
  });

  it('does nothing for fresh metadata, missing items or dry-run', async () => {
    const fresh = setup();
    await fresh.command.runOnWorkspace(args);
    expect(fresh.migrate).not.toHaveBeenCalled();
    const missing = setup();
    delete missing.maps.byUniversalIdentifier[commands[1].universalIdentifier];
    await missing.command.runOnWorkspace(args);
    expect(missing.migrate).not.toHaveBeenCalled();
    const old = setup();
    old.maps.byUniversalIdentifier[commands[1].universalIdentifier]!.position = 68;
    await old.command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(old.migrate).not.toHaveBeenCalled();
    expect(old.maps.byUniversalIdentifier[commands[1].universalIdentifier]?.position).toBe(68);
  });
});
