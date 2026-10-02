import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignReviewEnablementService } from 'src/modules/campaign-partnership/services/campaign-review-enablement.service';

jest.mock('src/engine/twenty-orm/repository/permissions.utils', () => ({
  validateOperationIsPermittedOrThrow: jest.fn(),
}));

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN = '22222222-2222-4222-8222-222222222222';
const MEMBER = '55555555-5555-4555-8555-555555555555';
const USER_WORKSPACE = '66666666-6666-4666-8666-666666666666';
const USER = '77777777-7777-4777-8777-777777777777';
const authContext = {
  type: 'user',
  workspace: { id: WORKSPACE },
  userWorkspaceId: USER_WORKSPACE,
  workspaceMemberId: MEMBER,
  user: { id: USER },
  workspaceMember: { id: MEMBER, userId: USER },
} as UserWorkspaceAuthContext;

const fixture = () => {
  const campaign = {
    id: CAMPAIGN,
    deletedAt: null,
    lifecycleStatus: 'ACTIVE',
    replyAgentEnabled: false,
    replyAgentMode: 'REVIEW',
    replyAgentRevision: 0,
    replyAgentEnabledAt: null as Date | null,
    replyAgentEnabledByUserWorkspaceId: null as string | null,
    replyAgentChangedAt: null as Date | null,
    replyAgentChangedByWorkspaceMemberId: null as string | null,
  };
  const member = { id: MEMBER, userId: USER, deletedAt: null };
  const repositories = {
    campaign: {
      target: 'campaign',
      findOne: jest.fn(async () => campaign),
      update: jest.fn(async (where, values) => {
        if (
          where.id !== campaign.id ||
          where.replyAgentRevision !== campaign.replyAgentRevision ||
          where.replyAgentEnabled !== campaign.replyAgentEnabled ||
          where.replyAgentMode !== campaign.replyAgentMode
        )
          return { affected: 0 };
        Object.assign(campaign, values);
        return { affected: 1 };
      }),
      objectRecordsPermissions: { campaign: { canUpdateObjectRecords: true } },
    },
    workspaceMember: {
      target: 'workspaceMember',
      findOne: jest.fn(async () => member),
    },
  };
  const manager = {
    queryRunner: { isTransactionActive: true, isReleased: false },
    getRepository: jest.fn(
      (target: keyof typeof repositories) => repositories[target],
    ),
    transaction: jest.fn(),
  };
  manager.transaction.mockImplementation(
    (fn: (manager: unknown) => Promise<unknown>) => fn(manager),
  );
  const orm = {
    executeInWorkspaceContext: jest.fn((fn) => fn()),
    getRepository: jest.fn(
      async (_workspace, object: keyof typeof repositories) =>
        repositories[object],
    ),
  };
  Object.assign(repositories.campaign, { manager });
  const service = new CampaignReviewEnablementService(orm as never);
  const context = <T>(fn: () => T) =>
    withWorkspaceContext(
      {
        authContext,
        userWorkspaceRoleMap: { [USER_WORKSPACE]: 'role' },
        apiKeyRoleMap: {},
      } as never,
      fn,
    );
  const change = (
    intent: 'ENABLE' | 'DISABLE',
    expectedRevision: number,
    actor = authContext,
  ) =>
    context(() =>
      service.change({
        authContext: actor,
        expectedWorkspaceId: WORKSPACE,
        campaignId: CAMPAIGN,
        expectedRevision,
        intent,
      }),
    );
  return { campaign, member, repositories, orm, change, context, service };
};

describe('Campaign Review enablement (unregistered domain service)', () => {
  beforeEach(() => jest.clearAllMocks());
  it('persists scoped enabling principal, member, time and revision without sending', async () => {
    const s = fixture();
    expect(await s.change('ENABLE', 0)).toMatchObject({
      enabled: true,
      mode: 'REVIEW',
      revision: 1,
      enabledByUserWorkspaceId: USER_WORKSPACE,
    });
    expect(s.campaign).toMatchObject({
      replyAgentEnabled: true,
      replyAgentEnabledByUserWorkspaceId: USER_WORKSPACE,
      replyAgentChangedByWorkspaceMemberId: MEMBER,
      replyAgentRevision: 1,
      replyAgentEnabledAt: expect.any(Date),
      replyAgentChangedAt: expect.any(Date),
    });
    expect(s.repositories.campaign.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(s.repositories.campaign.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
      ['id'],
    );
    expect(validateOperationIsPermittedOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'campaign',
        operationType: 'update',
        updatedColumns: expect.arrayContaining([
          'replyAgentEnabledByUserWorkspaceId',
        ]),
      }),
    );
  });
  it('rejects stale generations, duplicate intents and CAS races before changing state', async () => {
    const s = fixture();
    await s.change('ENABLE', 0);
    await expect(s.change('ENABLE', 0)).rejects.toThrow();
    await expect(s.change('DISABLE', 0)).rejects.toThrow();
    s.repositories.campaign.update.mockResolvedValueOnce({
      affected: 0,
    } as never);
    await expect(s.change('DISABLE', 1)).rejects.toThrow();
    expect(s.campaign.replyAgentEnabled).toBe(true);
  });
  it('disables and clears enabling authority/epoch, then re-enables at a new epoch', async () => {
    const s = fixture();
    await s.change('ENABLE', 0);
    expect(await s.change('DISABLE', 1)).toMatchObject({
      enabled: false,
      revision: 2,
      enabledByUserWorkspaceId: null,
    });
    expect(s.campaign.replyAgentEnabledAt).toBeNull();
    expect(s.campaign.replyAgentEnabledByUserWorkspaceId).toBeNull();
    expect(await s.change('ENABLE', 2)).toMatchObject({
      enabled: true,
      revision: 3,
      enabledByUserWorkspaceId: USER_WORKSPACE,
    });
  });
  it('rejects cross-workspace, non-user, identity mismatch and revoked member', async () => {
    const s = fixture();
    await expect(
      s.context(() =>
        s.service.change({
          authContext,
          expectedWorkspaceId: MEMBER,
          campaignId: CAMPAIGN,
          expectedRevision: 0,
          intent: 'ENABLE',
        }),
      ),
    ).rejects.toThrow();
    await expect(
      s.change('ENABLE', 0, { ...authContext, type: 'apiKey' } as never),
    ).rejects.toThrow();
    await expect(
      s.change('ENABLE', 0, {
        ...authContext,
        workspaceMember: { id: MEMBER, userId: MEMBER },
      } as never),
    ).rejects.toThrow();
    s.member.userId = MEMBER;
    await expect(s.change('ENABLE', 0)).rejects.toThrow();
    expect(s.repositories.campaign.update).not.toHaveBeenCalled();
  });
  it('rejects invisible Campaign, lost update role or field-specific denial', async () => {
    const s = fixture();
    s.repositories.campaign.findOne.mockResolvedValueOnce(null as never);
    await expect(s.change('ENABLE', 0)).rejects.toThrow();
    s.repositories.campaign.objectRecordsPermissions = null as never;
    await expect(s.change('ENABLE', 0)).rejects.toThrow();
    s.repositories.campaign.objectRecordsPermissions = {
      campaign: { canUpdateObjectRecords: true },
    };
    jest
      .mocked(validateOperationIsPermittedOrThrow)
      .mockImplementationOnce(() => {
        throw new Error('denied');
      });
    await expect(s.change('ENABLE', 0)).rejects.toThrow('denied');
    expect(s.repositories.campaign.update).not.toHaveBeenCalled();
  });
  it('rejects a missing current role without reading or writing a Campaign', async () => {
    const s = fixture();
    await expect(
      withWorkspaceContext(
        {
          authContext,
          userWorkspaceRoleMap: {},
          apiKeyRoleMap: {},
        } as never,
        () =>
          s.service.change({
            authContext,
            expectedWorkspaceId: WORKSPACE,
            campaignId: CAMPAIGN,
            expectedRevision: 0,
            intent: 'ENABLE',
          }),
      ),
    ).rejects.toThrow();
    expect(s.orm.getRepository).not.toHaveBeenCalled();
  });
  it('rejects non-Review mode and unavailable lifecycle', async () => {
    const s = fixture();
    s.campaign.replyAgentMode = 'AUTONOMOUS';
    await expect(s.change('ENABLE', 0)).rejects.toThrow();
    s.campaign.replyAgentMode = 'REVIEW';
    s.campaign.lifecycleStatus = 'CANCELLED';
    await expect(s.change('ENABLE', 0)).rejects.toThrow();
    expect(s.repositories.campaign.update).not.toHaveBeenCalled();
  });
});
