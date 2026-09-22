import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CreatorImportService } from 'src/modules/myah-creator-social-profile/services/creator-import.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({ getWorkspaceContext: jest.fn() }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => ({
      intersectionOf: ['role-1'],
    })),
  }),
);

const objectIds = {
  creator: 'creator-object',
  socialProfile: 'profile-object',
  note: 'note-object',
  noteTarget: 'target-object',
};
const fields = [
  ['creator-name', objectIds.creator, 'name'],
  ['creator-email', objectIds.creator, 'email'],
  ['profile-name', objectIds.socialProfile, 'name'],
  ['profile-creator', objectIds.socialProfile, 'creator'],
  ['profile-platform', objectIds.socialProfile, 'platform'],
  ['profile-locator', objectIds.socialProfile, 'normalizedLocator'],
  ['profile-handle', objectIds.socialProfile, 'handle'],
  ['profile-url', objectIds.socialProfile, 'profileUrl'],
  ['profile-account', objectIds.socialProfile, 'platformAccountId'],
  ['profile-followers', objectIds.socialProfile, 'followerCount'],
  ['profile-observed', objectIds.socialProfile, 'followerCountObservedAt'],
  ['profile-source', objectIds.socialProfile, 'followerCountSource'],
  ['note-title', objectIds.note, 'title'],
  ['note-body', objectIds.note, 'bodyV2'],
  ['target-note', objectIds.noteTarget, 'note'],
  ['target-creator', objectIds.noteTarget, 'targetCreator'],
].map(([id, objectMetadataId, name]) => ({
  id,
  objectMetadataId,
  name,
  isActive: true,
}));
const authContext = {
  type: 'user',
  workspace: { id: '11111111-1111-4111-8111-111111111111' },
  workspaceMemberId: '22222222-2222-4222-8222-222222222222',
} as never;
const input = {
  attemptKey: '33333333-3333-4333-8333-333333333333',
  operationKey: 'row-1',
  creator: { name: 'Ada', email: 'ada@example.com' },
  profiles: [
    {
      platform: 'INSTAGRAM',
      handle: 'ada',
      followerCount: 100,
      followerCountSource: 'Spreadsheet import',
    },
  ],
  note: { title: 'Context', markdown: '- source: imported' },
};

const createService = () => {
  const writer = {
    createCreator: jest.fn().mockResolvedValue('creator-1'),
    preserveSocialProfile: jest.fn().mockResolvedValue('profile-1'),
    createSupplementaryNote: jest.fn().mockResolvedValue({
      noteId: 'note-1',
      noteTargetId: 'target-1',
    }),
  };
  const operationService = {
    execute: jest.fn(async ({ write }) => ({
      receiptId: 'receipt-1',
      ...(await write({} as never, 'workspace_schema')),
      replayed: false,
    })),
  };
  const ormManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
  };

  return {
    service: new CreatorImportService(
      ormManager as never,
      operationService as never,
      writer as never,
    ),
    operationService,
    writer,
  };
};

const setPermissions = (
  canUpdateObjectRecords: boolean,
  restrictedFieldIds: string[] = [],
) => {
  (getWorkspaceContext as jest.Mock).mockReturnValue({
    objectIdByNameSingular: objectIds,
    flatFieldMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        fields.map((field) => [field.id, field]),
      ),
    },
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: {},
    permissionsPerRoleId: {
      'role-1': Object.fromEntries(
        Object.values(objectIds).map((objectId) => [
          objectId,
          {
            canUpdateObjectRecords,
            restrictedFields: Object.fromEntries(
              restrictedFieldIds.map((fieldId) => [
                fieldId,
                { canUpdate: false },
              ]),
            ),
          },
        ]),
      ),
    },
  });
};

describe('CreatorImportService', () => {
  it('commits one Creator, its profiles, and Note through the durable operation', async () => {
    setPermissions(true);
    const { service, operationService, writer } = createService();

    await expect(service.commit(input, authContext)).resolves.toEqual({
      receiptId: 'receipt-1',
      creatorId: 'creator-1',
      socialProfileIds: ['profile-1'],
      noteId: 'note-1',
      noteTargetId: 'target-1',
      replayed: false,
    });

    expect(operationService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        kind: 'SPREADSHEET_IMPORT',
        attemptKey: input.attemptKey,
        operationKey: input.operationKey,
        sourceDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    );
    expect(writer.createCreator).toHaveBeenCalledTimes(1);
    expect(writer.preserveSocialProfile).toHaveBeenCalledTimes(1);
    expect(writer.createSupplementaryNote).toHaveBeenCalledTimes(1);
  });

  it('fails before the raw writer when any required object is not writable', async () => {
    setPermissions(false);
    const { service, operationService } = createService();

    await expect(service.commit(input, authContext)).rejects.toThrow(
      'Creator import write permission is required',
    );
    expect(operationService.execute).not.toHaveBeenCalled();
  });

  it('does not require optional profile fields that were not supplied', async () => {
    setPermissions(true, ['profile-followers']);
    const { service, operationService } = createService();

    await expect(
      service.commit(
        {
          ...input,
          profiles: [{ platform: 'INSTAGRAM', handle: 'ada' }],
          note: undefined,
        },
        authContext,
      ),
    ).resolves.toEqual(expect.objectContaining({ creatorId: 'creator-1' }));
    expect(operationService.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate social identities inside one row', async () => {
    setPermissions(true);
    const { service, operationService } = createService();

    await expect(
      service.commit(
        { ...input, profiles: [input.profiles[0], input.profiles[0]] },
        authContext,
      ),
    ).rejects.toThrow('An imported row contains duplicate social profiles');
    expect(operationService.execute).not.toHaveBeenCalled();
  });
});
