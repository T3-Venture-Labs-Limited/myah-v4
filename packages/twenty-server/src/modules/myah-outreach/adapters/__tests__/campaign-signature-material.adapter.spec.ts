import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { CampaignSignatureMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-signature-material.adapter';

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
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: '20202020-3333-4333-8333-333333333333',
  workspaceMemberId: '20202020-4444-4444-8444-444444444444',
  user: { id: '20202020-5555-4555-8555-555555555555' },
  workspaceMember: {},
} as never;
const permissionConfig = { objectRecordsPermissions: {} } as never;

const blockers = (
  result: Awaited<ReturnType<CampaignSignatureMaterialAdapter['load']>>,
) => (result.kind === 'BLOCKED' ? result.blockers : []);

describe('CampaignSignatureMaterialAdapter', () => {
  const campaignRepository = { findOne: jest.fn() };
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => Promise<unknown>) => callback(),
  );
  const getRepository = jest.fn().mockResolvedValue(campaignRepository);
  const orm = {
    executeInWorkspaceContext,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager;
  const adapter = new CampaignSignatureMaterialAdapter(orm);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getWorkspaceContext).mockReturnValue({
      apiKeyRoleMap: {},
      userWorkspaceRoleMap: {},
    } as never);
    jest.mocked(resolveRolePermissionConfig).mockReturnValue(permissionConfig);
    campaignRepository.findOne.mockResolvedValue({
      id: campaignId,
      emailSignature: '<p>Exact signature</p>',
      deletedAt: null,
    });
  });

  it('loads the exact Campaign emailSignature without rewriting it', async () => {
    await expect(
      adapter.load({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual({
      kind: 'READY',
      value: { html: '<p>Exact signature</p>' },
    });

    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      authContext,
    );
    expect(getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaign',
      permissionConfig,
    );
    expect(campaignRepository.findOne).toHaveBeenCalledWith({
      where: { deletedAt: expect.anything(), id: campaignId },
    });
    expect(resolveRolePermissionConfig).toHaveBeenCalledWith({
      apiKeyRoleMap: {},
      authContext,
      userWorkspaceRoleMap: {},
    });
  });

  it.each([
    ['null', null],
    ['blank', ''],
  ])('preserves an accepted %s signature', async (_label, emailSignature) => {
    campaignRepository.findOne.mockResolvedValue({
      id: campaignId,
      emailSignature,
      deletedAt: null,
    });

    await expect(
      adapter.load({ authContext, campaignId, workspaceId }),
    ).resolves.toEqual({
      kind: 'READY',
      value: { html: emailSignature },
    });
  });

  it('blocks a workspace mismatch before repository access', async () => {
    const result = await adapter.load({
      authContext,
      campaignId,
      workspaceId: 'other-workspace',
    });

    expect(blockers(result).map(({ code }) => code)).toEqual([
      'MATERIAL_STALE',
    ]);
    expect(executeInWorkspaceContext).not.toHaveBeenCalled();
    expect(getRepository).not.toHaveBeenCalled();
  });

  it.each([
    ['missing Campaign', null],
    ['malformed signature', { id: campaignId, emailSignature: 42 }],
  ])('blocks a %s', async (_label, campaign) => {
    campaignRepository.findOne.mockResolvedValue(campaign);

    expect(
      blockers(
        await adapter.load({ authContext, campaignId, workspaceId }),
      ).map(({ code }) => code),
    ).toEqual(['MATERIAL_STALE']);
  });

  it('blocks when the current role cannot be resolved', async () => {
    jest.mocked(resolveRolePermissionConfig).mockReturnValue(null);

    expect(
      blockers(
        await adapter.load({ authContext, campaignId, workspaceId }),
      ).map(({ code }) => code),
    ).toEqual(['MATERIAL_STALE']);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('fails closed with a safe blocker on repository errors', async () => {
    campaignRepository.findOne.mockRejectedValue(new Error('secret SQL path'));

    const result = await adapter.load({
      authContext,
      campaignId,
      workspaceId,
    });

    expect(result).toEqual({
      kind: 'BLOCKED',
      blockers: [
        {
          code: 'MATERIAL_STALE',
          message: 'Campaign signature is unavailable',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('secret SQL path');
  });
});
