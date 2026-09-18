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
    ['null', null, null],
    ['blank', '', ''],
    ['legacy string', '<p>Legacy signature</p>', '<p>Legacy signature</p>'],
    [
      'rich text',
      {
        markdown: 'Kind regards,\nDaryll',
        blocknote: '[{"type":"paragraph","content":"Kind regards"}]',
      },
      'Kind regards,\nDaryll',
    ],
  ])(
    'loads an accepted %s signature as deterministic markdown material',
    async (_label, emailSignature, expectedHtml) => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        emailSignature,
        deletedAt: null,
      });

      await expect(
        adapter.load({ authContext, campaignId, workspaceId }),
      ).resolves.toEqual({
        kind: 'READY',
        value: { html: expectedHtml },
      });
    },
  );

  it.each([
    [
      'rich text',
      {
        emailSignatureMarkdown: 'Kind regards,\nDaryll',
        emailSignatureBlocknote:
          '[{"type":"paragraph","content":"Kind regards"}]',
      },
      'Kind regards,\nDaryll',
    ],
    [
      'null',
      {
        emailSignatureMarkdown: null,
        emailSignatureBlocknote: null,
      },
      null,
    ],
  ])(
    'loads %s signature material through the locked transaction path',
    async (_label, signatureRow, expectedHtml) => {
      const query = jest.fn().mockResolvedValue([signatureRow]);
      const transactionManager = { queryRunner: undefined as unknown };

      transactionManager.queryRunner = {
        isTransactionActive: true,
        isReleased: false,
        manager: transactionManager,
        query,
      };

      await expect(
        adapter.load({
          authContext,
          campaignId,
          workspaceId,
          transactionManager: transactionManager as never,
        }),
      ).resolves.toEqual({
        kind: 'READY',
        value: { html: expectedHtml },
      });

      const sql = query.mock.calls[0][0] as string;

      expect(sql).toContain(
        'SELECT "emailSignatureMarkdown", "emailSignatureBlocknote"',
      );
      expect(sql).not.toMatch(/SELECT "emailSignature"(?:\s|,)/);
      expect(sql).toContain('FOR KEY SHARE');
      expect(query).toHaveBeenCalledWith(expect.any(String), [campaignId]);
    },
  );

  it.each([
    [
      'null markdown with string blocknote',
      {
        emailSignatureMarkdown: null,
        emailSignatureBlocknote: '[]',
      },
    ],
    [
      'string markdown with null blocknote',
      {
        emailSignatureMarkdown: 'Kind regards',
        emailSignatureBlocknote: null,
      },
    ],
    [
      'non-string markdown',
      {
        emailSignatureMarkdown: 42,
        emailSignatureBlocknote: '[]',
      },
    ],
    [
      'non-string blocknote',
      {
        emailSignatureMarkdown: 'Kind regards',
        emailSignatureBlocknote: {},
      },
    ],
    ['missing physical columns', {}],
  ])(
    'blocks %s in the locked transaction path',
    async (_label, signatureRow) => {
      const query = jest.fn().mockResolvedValue([signatureRow]);
      const transactionManager = { queryRunner: undefined as unknown };

      transactionManager.queryRunner = {
        isTransactionActive: true,
        isReleased: false,
        manager: transactionManager,
        query,
      };

      const result = await adapter.load({
        authContext,
        campaignId,
        workspaceId,
        transactionManager: transactionManager as never,
      });

      expect(blockers(result).map(({ code }) => code)).toEqual([
        'MATERIAL_STALE',
      ]);
    },
  );

  it.each([
    ['inactive', false, false, true],
    ['released', true, true, true],
    ['different-manager', true, false, false],
  ])(
    'blocks an %s transaction manager before querying',
    async (_label, isTransactionActive, isReleased, usesSuppliedManager) => {
      const query = jest.fn();
      const transactionManager = { queryRunner: undefined as unknown };

      transactionManager.queryRunner = {
        isTransactionActive,
        isReleased,
        manager: usesSuppliedManager ? transactionManager : {},
        query,
      };

      const result = await adapter.load({
        authContext,
        campaignId,
        workspaceId,
        transactionManager: transactionManager as never,
      });

      expect(blockers(result).map(({ code }) => code)).toEqual([
        'MATERIAL_STALE',
      ]);
      expect(query).not.toHaveBeenCalled();
    },
  );

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
    ['unsupported number signature', { id: campaignId, emailSignature: 42 }],
    [
      'rich-text signature without markdown',
      {
        id: campaignId,
        emailSignature: { blocknote: '[]' },
      },
    ],
    [
      'rich-text signature with non-string blocknote',
      {
        id: campaignId,
        emailSignature: { markdown: 'Kind regards', blocknote: null },
      },
    ],
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
