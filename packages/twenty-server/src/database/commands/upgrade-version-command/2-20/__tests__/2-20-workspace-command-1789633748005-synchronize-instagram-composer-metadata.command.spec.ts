import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ContextStorePageType,
  type CommandMenuContextApi,
} from 'twenty-shared/types';
import {
  evaluateConditionalAvailabilityExpression,
  isDefined,
} from 'twenty-shared/utils';

import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeInstagramComposerMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748005-synchronize-instagram-composer-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { CommandMenuItemAvailabilityType } from 'src/engine/metadata-modules/command-menu-item/enums/command-menu-item-availability-type.enum';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};
const desired = () =>
  computeTwentyStandardApplicationAllFlatEntityMaps({
    now: '2026-09-16T00:00:00.000Z',
    workspaceId: args.workspaceId,
    twentyStandardApplicationId: '20202020-0000-0000-0000-000000000002',
  }).allFlatEntityMaps;
const commandId =
  STANDARD_COMMAND_MENU_ITEMS.messageOnInstagram.universalIdentifier;
const usernameId =
  MYAH_STANDARD_OBJECTS.creator.fields.instagramUsername.universalIdentifier;
const Constructor =
  SynchronizeInstagramComposerMetadataCommand as unknown as new (
    ...params: unknown[]
  ) => SynchronizeInstagramComposerMetadataCommand;

const setup = (
  maps: Pick<
    ReturnType<typeof desired>,
    'flatCommandMenuItemMaps' | 'flatSearchFieldMetadataMaps'
  > = createEmptyAllFlatEntityMaps(),
  schemaExists = true,
) => {
  const migrate = jest
    .fn()
    .mockImplementation(
      async ({ allFlatEntityOperationByMetadataName: operations }) => {
        for (const name of [
          'commandMenuItem',
          'searchFieldMetadata',
        ] as const) {
          const map =
            name === 'commandMenuItem'
              ? maps.flatCommandMenuItemMaps
              : maps.flatSearchFieldMetadataMaps;
          for (const entity of operations[name].flatEntityToCreate)
            map.byUniversalIdentifier[entity.universalIdentifier] = entity;
        }
        return { status: 'success' };
      },
    );
  const command = new Constructor(
    {},
    {
      findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
        .fn()
        .mockResolvedValue({
          twentyStandardFlatApplication: {
            id: '20202020-0000-0000-0000-000000000002',
            universalIdentifier: '20202020-0000-0000-0000-000000000003',
          },
        }),
    },
    { validateBuildAndRunWorkspaceMigration: migrate },
    {
      getOrRecompute: jest.fn().mockImplementation(async () => maps),
    },
    { workspaceSchemaExists: jest.fn().mockResolvedValue(schemaExists) },
  );
  return { command, migrate, maps };
};

describe('SynchronizeInstagramComposerMetadataCommand', () => {
  it('fresh standard installation contains exactly one stable global command and username search field', () => {
    for (const maps of [desired(), desired()]) {
      const commands = Object.values(
        maps.flatCommandMenuItemMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          (item) =>
            item.engineComponentKey === EngineComponentKey.MESSAGE_ON_INSTAGRAM,
        );
      expect(commands).toHaveLength(1);
      expect(commands[0]).toMatchObject({
        universalIdentifier: commandId,
        label: 'Message on Instagram',
        availabilityType: CommandMenuItemAvailabilityType.GLOBAL,
        availabilityObjectMetadataId: null,
      });
      const fields = Object.values(
        maps.flatSearchFieldMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .filter(
          (field) => field.fieldMetadataUniversalIdentifier === usernameId,
        );
      expect(fields).toHaveLength(1);
    }
  });
  it('upgrades a pre-feature workspace twice without duplicate command/search pairs and touches no app draft metadata', async () => {
    const maps = desired();
    delete maps.flatCommandMenuItemMaps.byUniversalIdentifier[commandId];
    for (const [key, field] of Object.entries(
      maps.flatSearchFieldMetadataMaps.byUniversalIdentifier,
    ))
      if (field?.fieldMetadataUniversalIdentifier === usernameId)
        delete maps.flatSearchFieldMetadataMaps.byUniversalIdentifier[key];
    const { command, migrate } = setup(maps);
    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);
    expect(migrate).toHaveBeenCalledTimes(1);
    const operations =
      migrate.mock.calls[0][0].allFlatEntityOperationByMetadataName;
    expect(Object.keys(operations).sort()).toEqual([
      'commandMenuItem',
      'searchFieldMetadata',
    ]);
    expect(operations.commandMenuItem.flatEntityToCreate).toHaveLength(1);
    expect(operations.searchFieldMetadata.flatEntityToCreate).toHaveLength(1);
    expect(
      operations.searchFieldMetadata.flatEntityToCreate[0]
        .fieldMetadataUniversalIdentifier,
    ).toBe(usernameId);
    for (const operation of Object.values(operations) as {
      flatEntityToUpdate: unknown[];
      flatEntityToDelete: unknown[];
    }[]) {
      expect(operation.flatEntityToUpdate).toEqual([]);
      expect(operation.flatEntityToDelete).toEqual([]);
    }
  });
  it('is a no-op after fresh installation and recognizes existing search field pairs with different row identifiers', async () => {
    const maps = desired();
    maps.flatSearchFieldMetadataMaps.byUniversalIdentifier = Object.fromEntries(
      Object.values(maps.flatSearchFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map((field, index) => [`existing-${index}`, field]),
    );
    const { command, migrate } = setup(maps);
    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);
    expect(migrate).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'does not migrate on dry-run or absent physical schema (%s)',
    async (dryRun) => {
      const { command, migrate } = setup(
        createEmptyAllFlatEntityMaps(),
        dryRun,
      );
      await command.runOnWorkspace({ ...args, options: { dryRun } });
      expect(migrate).not.toHaveBeenCalled();
    },
  );
  it('surfaces migration failure', async () => {
    const { command, migrate } = setup();
    migrate.mockResolvedValueOnce({ status: 'fail' });
    await expect(command.runOnWorkspace(args)).rejects.toThrow(
      'Failed to synchronize Instagram composer metadata',
    );
  });
  it('registers version 1789633748005 without changing the Compose Email contract', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeInstagramComposerMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789633748005 });
    expect(STANDARD_COMMAND_MENU_ITEMS.composeEmail).toEqual({
      universalIdentifier: '96457c5a-b028-4d48-94e3-27f4c41296b8',
      label: 'Compose Email',
      icon: 'IconMail',
      isPinned: false,
      position: 46,
      shortLabel: 'Compose',
      availabilityType: CommandMenuItemAvailabilityType.GLOBAL,
      conditionalAvailabilityExpression: 'permissionFlags.SEND_EMAIL_TOOL',
      availabilityObjectMetadataUniversalIdentifier: null,
      frontComponentUniversalIdentifier: null,
      engineComponentKey: EngineComponentKey.COMPOSE_EMAIL,
      hotKeys: null,
    });
  });
  it.each(
    Object.values(ContextStorePageType).flatMap((pageType) =>
      [false, true].map((isInSidePanel) => ({ pageType, isInSidePanel })),
    ),
  )(
    'is visible with either route permission in every menu context: %j',
    ({ pageType, isInSidePanel }) => {
      for (const [first, reply] of [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ]) {
        const context: CommandMenuContextApi = {
          pageType,
          isInSidePanel,
          isDashboardPageLayoutInEditMode: false,
          isLayoutCustomizationModeEnabled: false,
          favoriteRecordIds: [],
          isSelectAll: false,
          hasAnySoftDeleteFilterOnView: false,
          numberOfSelectedRecords: 0,
          objectPermissions: {
            objectMetadataId: '',
            canReadObjectRecords: false,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
          selectedRecords: [],
          featureFlags: {},
          permissionFlags: {
            SEND_INSTAGRAM_FIRST_MESSAGE_TOOL: first,
            SEND_INSTAGRAM_REPLY_TOOL: reply,
            CONNECTED_ACCOUNTS: false,
          },
          targetObjectReadPermissions: {},
          targetObjectWritePermissions: {},
          canImpersonate: false,
          canAccessFullAdminPanel: false,
          objectMetadataItem: {},
          objectMetadataLabel: '',
        };
        expect(
          evaluateConditionalAvailabilityExpression(
            STANDARD_COMMAND_MENU_ITEMS.messageOnInstagram
              .conditionalAvailabilityExpression,
            context,
          ),
        ).toBe(first || reply);
      }
    },
  );
});
