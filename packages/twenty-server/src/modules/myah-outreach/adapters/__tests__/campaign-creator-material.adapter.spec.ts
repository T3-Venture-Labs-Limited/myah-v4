import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { CampaignCreatorMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-creator-material.adapter';
import { type CampaignMessageRenderCoordinates } from 'src/modules/myah-outreach/types/campaign-message-render.type';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({ getWorkspaceContext: jest.fn() }),
);
jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({ resolveRolePermissionConfig: jest.fn() }),
);

const workspaceId = '20202020-1111-4111-8111-111111111111';
const campaignId = '20202020-2222-4222-8222-222222222222';
const campaignCreatorId = '20202020-3333-4333-8333-333333333333';
const creatorId = '20202020-4444-4444-8444-444444444444';
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: '20202020-5555-4555-8555-555555555555',
  workspaceMemberId: '20202020-6666-4666-8666-666666666666',
  user: { id: '20202020-7777-4777-8777-777777777777' },
  workspaceMember: {},
} as never;
const coordinates: CampaignMessageRenderCoordinates = {
  workspaceId,
  campaignId,
  campaignCreatorId,
  workflowVersionId: '20202020-8888-4888-8888-888888888888',
  messageId: '20202020-9999-4999-8999-999999999999',
};
const permissionConfig = { objectRecordsPermissions: {} } as never;

const blockedCodes = (
  result: Awaited<ReturnType<CampaignCreatorMaterialAdapter['load']>>,
) => (result.kind === 'BLOCKED' ? result.blockers.map(({ code }) => code) : []);

describe('CampaignCreatorMaterialAdapter', () => {
  const campaignCreatorRepository = { findOne: jest.fn() };
  const creatorRepository = { findOne: jest.fn() };
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => Promise<unknown>) => callback(),
  );
  const getRepository = jest.fn(async (_workspaceId: string, name: string) =>
    name === 'campaignCreator' ? campaignCreatorRepository : creatorRepository,
  );
  const orm = {
    executeInWorkspaceContext,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager;
  const adapter = new CampaignCreatorMaterialAdapter(orm);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getWorkspaceContext).mockReturnValue({
      apiKeyRoleMap: {},
      userWorkspaceRoleMap: {},
    } as never);
    jest.mocked(resolveRolePermissionConfig).mockReturnValue(permissionConfig);
    campaignCreatorRepository.findOne.mockResolvedValue({
      id: campaignCreatorId,
      campaignId,
      creatorId,
      deletedAt: null,
    });
    creatorRepository.findOne.mockResolvedValue({
      id: creatorId,
      name: 'Ada Creator',
      email: '  ADA@EXAMPLE.COM ',
      deletedAt: null,
    });
  });

  it('loads the exact CampaignCreator and returns only frozen Creator variables', async () => {
    await expect(adapter.load({ authContext, coordinates })).resolves.toEqual({
      kind: 'READY',
      value: {
        creatorId,
        normalizedRecipient: 'ada@example.com',
        variables: {
          'creator.email': 'ada@example.com',
          'creator.name': 'Ada Creator',
        },
      },
    });

    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      authContext,
    );
    expect(getRepository).toHaveBeenNthCalledWith(
      1,
      workspaceId,
      'campaignCreator',
      permissionConfig,
    );
    expect(getRepository).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      'creator',
      permissionConfig,
    );
    expect(campaignCreatorRepository.findOne).toHaveBeenCalledWith({
      where: {
        campaignId,
        deletedAt: expect.anything(),
        id: campaignCreatorId,
      },
    });
    expect(creatorRepository.findOne).toHaveBeenCalledWith({
      where: { deletedAt: expect.anything(), id: creatorId },
    });
    expect(resolveRolePermissionConfig).toHaveBeenCalledWith({
      apiKeyRoleMap: {},
      authContext,
      userWorkspaceRoleMap: {},
    });
  });

  it('blocks a workspace mismatch before repository access', async () => {
    const result = await adapter.load({
      authContext,
      coordinates: { ...coordinates, workspaceId: 'other-workspace' },
    });

    expect(blockedCodes(result)).toEqual(['CREATOR_NOT_FOUND']);
    expect(executeInWorkspaceContext).not.toHaveBeenCalled();
    expect(getRepository).not.toHaveBeenCalled();
  });

  it.each([
    [
      'cross-Campaign CampaignCreator',
      { ...coordinates, campaignId: 'other-campaign' },
    ],
    ['missing CampaignCreator', coordinates],
  ])('blocks a %s', async (_label, inputCoordinates) => {
    campaignCreatorRepository.findOne.mockResolvedValue(null);

    expect(
      blockedCodes(
        await adapter.load({ authContext, coordinates: inputCoordinates }),
      ),
    ).toEqual(['CREATOR_NOT_FOUND']);
    expect(creatorRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['blank', '   '],
    ['malformed', 'not-a-uuid'],
  ])(
    'blocks a %s Creator relation before Creator repository access',
    async (_label, relationCreatorId) => {
      campaignCreatorRepository.findOne.mockResolvedValue({
        id: campaignCreatorId,
        campaignId,
        creatorId: relationCreatorId,
        deletedAt: null,
      });

      const result = await adapter.load({ authContext, coordinates });

      expect(result).toEqual({
        kind: 'BLOCKED',
        blockers: [
          {
            code: 'CREATOR_NOT_FOUND',
            message: 'Creator material is unavailable or inaccessible',
          },
        ],
      });
      expect(getRepository).toHaveBeenCalledTimes(1);
      expect(getRepository).toHaveBeenCalledWith(
        workspaceId,
        'campaignCreator',
        permissionConfig,
      );
      expect(creatorRepository.findOne).not.toHaveBeenCalled();
    },
  );

  it('blocks a missing Creator', async () => {
    creatorRepository.findOne.mockResolvedValue(null);

    expect(
      blockedCodes(await adapter.load({ authContext, coordinates })),
    ).toEqual(['CREATOR_NOT_FOUND']);
  });

  it.each([
    [
      'blank name',
      { name: ' ', email: 'creator@example.com' },
      'MISSING_VARIABLE',
    ],
    ['blank email', { name: 'Creator', email: ' ' }, 'MISSING_VARIABLE'],
    [
      'malformed email',
      { name: 'Creator', email: 'not-an-email' },
      'CREATOR_NOT_FOUND',
    ],
  ])('blocks %s without fallback', async (_label, creator, expectedCode) => {
    creatorRepository.findOne.mockResolvedValue({
      id: creatorId,
      ...creator,
      deletedAt: null,
    });

    expect(
      blockedCodes(await adapter.load({ authContext, coordinates })),
    ).toContain(expectedCode);
  });

  it('blocks when the current role cannot be resolved', async () => {
    jest.mocked(resolveRolePermissionConfig).mockReturnValue(null);

    expect(
      blockedCodes(await adapter.load({ authContext, coordinates })),
    ).toEqual(['CREATOR_NOT_FOUND']);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('fails closed with a safe blocker on repository errors', async () => {
    getRepository.mockRejectedValueOnce(new Error('secret SQL path'));

    const result = await adapter.load({ authContext, coordinates });

    expect(result).toEqual({
      kind: 'BLOCKED',
      blockers: [
        {
          code: 'CREATOR_NOT_FOUND',
          message: 'Creator material is unavailable or inaccessible',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('secret SQL path');
  });
});
