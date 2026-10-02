import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { NavigationMenuItemType } from 'src/engine/metadata-modules/navigation-menu-item/enums/navigation-menu-item-type.enum';
import { NavigationMenuItemService } from 'src/engine/metadata-modules/navigation-menu-item/navigation-menu-item.service';

const retiredObjectUid =
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier;
const oldMenuUid = '43f7a291-b0a4-481d-a5e4-b557e1a8f65d';
const oldLayoutUid = 'c8e159f8-1815-4138-9203-c29f59703386';
const row = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  universalIdentifier: id,
  type: NavigationMenuItemType.OBJECT,
  position: 0,
  userWorkspaceId: null,
  targetObjectMetadataId: null,
  viewId: null,
  pageLayoutId: null,
  folderId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workspaceId: 'workspace',
  ...fields,
});

const retired = row('retired', { targetObjectMetadataId: 'brain-object' });
const stale = row('stale', { universalIdentifier: oldMenuUid });
const view = row('view', {
  type: NavigationMenuItemType.VIEW,
  viewId: 'brain-view',
});
const layout = row('layout', {
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutId: 'brain-layout',
});
const oldLayout = row('old-layout', {
  type: NavigationMenuItemType.PAGE_LAYOUT,
  pageLayoutId: 'legacy-layout',
});
const record = row('record', {
  type: NavigationMenuItemType.RECORD,
  targetRecordId: 'some-record',
  targetObjectMetadataId: 'brain-object',
  userWorkspaceId: 'user',
});
const folder = row('folder', {
  type: NavigationMenuItemType.FOLDER,
  position: 1,
});
const creator = row('creator', {
  type: NavigationMenuItemType.VIEW,
  viewId: 'creator-view',
  folderId: 'folder',
  position: 2,
});

const items = [
  retired,
  stale,
  view,
  layout,
  oldLayout,
  record,
  folder,
  creator,
];
const maps = {
  flatNavigationMenuItemMaps: {
    byUniversalIdentifier: Object.fromEntries(
      items.map((item) => [item.universalIdentifier, item]),
    ),
    universalIdentifierById: Object.fromEntries(
      items.map((item) => [item.id, item.universalIdentifier]),
    ),
    byUserWorkspaceIdAndFolderId: {},
  },
  flatObjectMetadataMaps: {
    byUniversalIdentifier: {
      [retiredObjectUid]: {
        id: 'brain-object',
        universalIdentifier: retiredObjectUid,
      },
    },
    universalIdentifierById: { 'brain-object': retiredObjectUid },
  },
  flatViewMaps: {
    byUniversalIdentifier: {
      'brain-view-uid': { id: 'brain-view', objectMetadataId: 'brain-object' },
      'creator-view-uid': {
        id: 'creator-view',
        objectMetadataId: 'creator-object',
      },
    },
    universalIdentifierById: {
      'brain-view': 'brain-view-uid',
      'creator-view': 'creator-view-uid',
    },
  },
  flatPageLayoutMaps: {
    byUniversalIdentifier: {
      'brain-layout-uid': {
        id: 'brain-layout',
        objectMetadataId: 'brain-object',
      },
      [oldLayoutUid]: {
        id: 'legacy-layout',
        objectMetadataId: 'creator-object',
        universalIdentifier: oldLayoutUid,
      },
    },
    universalIdentifierById: {
      'brain-layout': 'brain-layout-uid',
      'legacy-layout': oldLayoutUid,
    },
  },
};

const setup = (entityMaps = maps) => {
  const cache = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest
      .fn()
      .mockResolvedValue(entityMaps),
  };
  const migration = {
    validateBuildAndRunWorkspaceMigration: jest
      .fn()
      .mockResolvedValue({ status: 'success' }),
  };
  const access = {
    canUserCreateNavigationMenuItem: jest.fn().mockResolvedValue(undefined),
    canUserUpdateNavigationMenuItem: jest.fn().mockResolvedValue(undefined),
    canUserDeleteNavigationMenuItem: jest.fn().mockResolvedValue(undefined),
  };
  const application = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({
        workspaceCustomFlatApplication: {
          id: 'custom-app',
          universalIdentifier: 'custom-app-uid',
        },
      }),
  };
  const recordIdentifier = {
    resolveRecordIdentifier: jest.fn().mockResolvedValue({ id: 'some-record' }),
  };
  const service = new NavigationMenuItemService(
    migration as never,
    cache as never,
    application as never,
    access as never,
    recordIdentifier as never,
  );
  return { service, migration, access, recordIdentifier };
};

describe('retained Brand Brain navigation rows', () => {
  it('does not resolve a retired target record through navigation lookup', async () => {
    const { service, recordIdentifier } = setup();
    await expect(
      service.findTargetRecord({
        targetRecordId: 'some-record',
        targetObjectMetadataId: 'brain-object',
        workspaceId: 'workspace',
        authContext: {} as never,
      }),
    ).resolves.toBeNull();
    expect(recordIdentifier.resolveRecordIdentifier).not.toHaveBeenCalled();
    await expect(
      service.findTargetRecord({
        targetRecordId: 'creator-record',
        targetObjectMetadataId: 'creator-object',
        workspaceId: 'workspace',
        authContext: {} as never,
      }),
    ).resolves.toEqual({ id: 'some-record' });
  });
  it('filters before limit while preserving mixed folders and unrelated children, including user-scoped stale links', async () => {
    const { service } = setup();
    await expect(
      service.findAll({
        workspaceId: 'workspace',
        userWorkspaceId: 'user',
        limit: 1,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 'folder' })]);
    await expect(
      service.findAll({ workspaceId: 'workspace', userWorkspaceId: 'user' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'folder' }),
      expect.objectContaining({ id: 'creator' }),
    ]);
    for (const item of items.slice(0, 6)) {
      await expect(
        service.findById({ id: item.id, workspaceId: 'workspace' }),
      ).resolves.toBeNull();
      await expect(
        service.findByIdOrThrow({ id: item.id, workspaceId: 'workspace' }),
      ).rejects.toThrow('not found');
    }
  });

  it('rejects retired creates by old UID and by resolved object, view, layout and record targets, without migrating any batch', async () => {
    const { service, migration } = setup();
    for (const input of [
      { id: oldMenuUid, type: NavigationMenuItemType.FOLDER },
      {
        type: NavigationMenuItemType.OBJECT,
        targetObjectMetadataId: 'brain-object',
      },
      { type: NavigationMenuItemType.VIEW, viewId: 'brain-view' },
      {
        type: NavigationMenuItemType.PAGE_LAYOUT,
        pageLayoutId: 'brain-layout',
      },
      {
        type: NavigationMenuItemType.PAGE_LAYOUT,
        pageLayoutId: 'legacy-layout',
      },
      {
        type: NavigationMenuItemType.RECORD,
        targetRecordId: 'some-record',
        targetObjectMetadataId: 'brain-object',
      },
    ]) {
      await expect(
        service.createMany({
          inputs: [
            input,
            { type: NavigationMenuItemType.FOLDER, name: 'Safe' },
          ],
          workspaceId: 'workspace',
        }),
      ).rejects.toThrow('Retired Brand Brain');
    }
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });

  it('rejects updates to original retired rows, target changes to retired layouts and batch deletion of retired children', async () => {
    const { service, migration } = setup();
    for (const item of items.slice(0, 6)) {
      await expect(
        service.updateMany({
          inputs: [{ id: item.id, update: { name: 'Revive' } }],
          workspaceId: 'workspace',
        }),
      ).rejects.toThrow('Retired Brand Brain');
      await expect(
        service.deleteMany({ ids: [item.id], workspaceId: 'workspace' }),
      ).rejects.toThrow('Retired Brand Brain');
    }
    await expect(
      service.updateMany({
        inputs: [{ id: 'creator', update: { pageLayoutId: 'legacy-layout' } }],
        workspaceId: 'workspace',
      }),
    ).rejects.toThrow('Retired Brand Brain');
    await expect(
      service.updateMany({
        inputs: [
          { id: 'creator', update: { name: 'Safe' } },
          { id: 'retired', update: { name: 'Revive' } },
        ],
        workspaceId: 'workspace',
      }),
    ).rejects.toThrow('Retired Brand Brain');
    await expect(
      service.deleteMany({
        ids: ['creator', 'retired'],
        workspaceId: 'workspace',
      }),
    ).rejects.toThrow('Retired Brand Brain');
    await expect(
      service.deleteMany({ ids: ['folder'], workspaceId: 'workspace' }),
    ).resolves.toHaveLength(1);
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).toHaveBeenCalledTimes(1);
  });

  it('protects retired children from folder cascade deletion without hiding that mixed folder', async () => {
    const entityMaps = structuredClone(maps);
    entityMaps.flatNavigationMenuItemMaps.byUserWorkspaceIdAndFolderId = {
      null: { folder: [creator, { ...retired, folderId: 'folder' }] },
    };
    const { service, migration } = setup(entityMaps);
    await expect(
      service.findAll({ workspaceId: 'workspace' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'folder' }),
      expect.objectContaining({ id: 'creator' }),
    ]);
    await expect(
      service.deleteMany({ ids: ['folder'], workspaceId: 'workspace' }),
    ).rejects.toThrow('Retired Brand Brain');
    expect(
      migration.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
  });
});
