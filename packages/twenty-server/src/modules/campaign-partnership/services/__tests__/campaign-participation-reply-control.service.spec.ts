import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignParticipationReplyControlService } from 'src/modules/campaign-partnership/services/campaign-participation-reply-control.service';

jest.mock('src/engine/twenty-orm/repository/permissions.utils', () => ({
  validateOperationIsPermittedOrThrow: jest.fn(),
}));

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN = '22222222-2222-4222-8222-222222222222';
const PARTICIPATION = '33333333-3333-4333-8333-333333333333';
const CREATOR = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';
const authContext = {
  type: 'user',
  workspace: { id: WORKSPACE },
  userWorkspaceId: '66666666-6666-4666-8666-666666666666',
  workspaceMemberId: MEMBER,
  user: { id: '77777777-7777-4777-8777-777777777777' },
  workspaceMember: {
    id: MEMBER,
    userId: '77777777-7777-4777-8777-777777777777',
  },
} as UserWorkspaceAuthContext;

const run = async (change?: (state: ReturnType<typeof fixture>) => void) => {
  const state = fixture();
  change?.(state);
  return {
    state,
    service: new CampaignParticipationReplyControlService(state.orm as never),
    context: <T>(fn: () => T) =>
      withWorkspaceContext(
        {
          authContext,
          userWorkspaceRoleMap: { [authContext.userWorkspaceId]: 'role' },
          apiKeyRoleMap: {},
        } as never,
        fn,
      ),
  };
};

const fixture = () => {
  const campaign = {
    id: CAMPAIGN,
    deletedAt: null,
    replyAgentEnabled: true,
    replyAgentMode: 'AUTONOMOUS',
    replyAgentRevision: 4,
    replyAgentEnabledAt: new Date() as Date | null,
    lifecycleStatus: 'ACTIVE',
  };
  const participation = {
    id: PARTICIPATION,
    campaignId: CAMPAIGN,
    creatorId: CREATOR,
    deletedAt: null,
    stage: 'CONTACTED',
    excludedAt: null as Date | null,
    replyAgentPaused: false,
    replyAgentRevision: 2,
    replyAgentMaterialGeneration: 7,
    replyAgentPauseHistory: [] as unknown[] | null,
  };
  const creator = { id: CREATOR, deletedAt: null };
  const member = { id: MEMBER, userId: authContext.user.id, deletedAt: null };
  const repositories = {
    campaign: { target: 'campaign', findOne: jest.fn(async () => campaign) },
    campaignCreator: {
      target: 'campaignCreator',
      findOne: jest.fn(async () => participation),
      update: jest.fn(async (where, values) => {
        if (
          where.replyAgentRevision !== participation.replyAgentRevision ||
          where.replyAgentMaterialGeneration !==
            participation.replyAgentMaterialGeneration
        )
          return { affected: 0 };
        Object.assign(participation, values);
        return { affected: 1 };
      }),
    },
    creator: { target: 'creator', findOne: jest.fn(async () => creator) },
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
  Object.assign(repositories.campaignCreator, {
    manager,
    objectRecordsPermissions: {
      campaignCreator: { canUpdateObjectRecords: true },
    },
  });
  return {
    campaign,
    participation,
    creator,
    member,
    repositories,
    manager,
    orm,
  };
};

const input = {
  authContext,
  expectedWorkspaceId: WORKSPACE,
  campaignId: CAMPAIGN,
  participationId: PARTICIPATION,
  expectedCampaignRevision: 4,
  expectedParticipationRevision: 2,
  expectedMaterialGeneration: 7,
};

describe('participation reply control (dormant domain boundary)', () => {
  it('pauses exactly one participation and returns status without dispatch', async () => {
    const { state, service, context } = await run();
    const result = await context(() =>
      service.change({ ...input, intent: 'PAUSE' }),
    );
    expect(result).toMatchObject({
      paused: true,
      mode: 'AUTONOMOUS',
      campaignRevision: 4,
      participationRevision: 3,
      reassessLatest: false,
    });
    expect(state.participation.replyAgentPauseHistory).toEqual([
      expect.objectContaining({
        pausedByWorkspaceMemberId: MEMBER,
        pausedRevision: 3,
        resumedAt: null,
      }),
    ]);
    expect(state.campaign.replyAgentRevision).toBe(4);
    expect(state.repositories.campaignCreator.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(state.repositories.creator.findOne).toHaveBeenCalled();
  });

  it('records the first explicit pause on a legacy untouched null history', async () => {
    const { state, service, context } = await run((s) => {
      s.participation.replyAgentPauseHistory = null;
    });
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    expect(state.participation.replyAgentPauseHistory).toHaveLength(1);
  });

  it('repeats the same intent without another audit write but rejects stale different intent', async () => {
    const { state, service, context } = await run();
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    expect(
      (await context(() => service.change({ ...input, intent: 'PAUSE' })))
        .participationRevision,
    ).toBe(3);
    expect(state.repositories.campaignCreator.update).toHaveBeenCalledTimes(1);
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'RESUME',
          expectedMode: 'AUTONOMOUS',
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a material event after confirmation under the participation lock, without clearing pause', async () => {
    const { state, service, context } = await run();
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    state.participation.replyAgentMaterialGeneration = 8;
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'RESUME',
          expectedParticipationRevision: 3,
          expectedMode: 'AUTONOMOUS',
        }),
      ),
    ).rejects.toThrow('Material context changed; refresh resume disclosure');
    expect(state.participation.replyAgentPaused).toBe(true);
    expect(state.repositories.campaignCreator.update).toHaveBeenCalledTimes(1);
    const refreshed = await context(() =>
      service.change({
        ...input,
        intent: 'RESUME',
        expectedParticipationRevision: 3,
        expectedMaterialGeneration: 8,
        expectedMode: 'AUTONOMOUS',
      }),
    );
    expect(refreshed).toMatchObject({
      paused: false,
      materialGeneration: 8,
      reassessLatest: true,
    });
  });

  it('fails closed when material generation races after locked read before CAS write', async () => {
    const { state, service, context } = await run();
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    state.repositories.campaignCreator.update.mockImplementationOnce(
      async () => {
        state.participation.replyAgentMaterialGeneration = 8;
        return { affected: 0 };
      },
    );
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'RESUME',
          expectedParticipationRevision: 3,
          expectedMode: 'AUTONOMOUS',
        }),
      ),
    ).rejects.toThrow('Participation control generation changed');
    expect(state.participation.replyAgentPaused).toBe(true);
  });

  it('rejects missing/invalid resume material disclosure without a write', async () => {
    const { state, service, context } = await run();
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    for (const expectedMaterialGeneration of [undefined, -1, 1.5, NaN]) {
      await expect(
        context(() =>
          service.change({
            ...input,
            intent: 'RESUME',
            expectedMode: 'AUTONOMOUS',
            expectedParticipationRevision: 3,
            expectedMaterialGeneration,
          }),
        ),
      ).rejects.toThrow();
    }
    expect(state.repositories.campaignCreator.update).toHaveBeenCalledTimes(1);
  });

  it('resumes only on the disclosed current mode/revision and closes the pause interval', async () => {
    const { state, service, context } = await run();
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'RESUME',
          expectedParticipationRevision: 3,
          expectedMode: 'REVIEW',
        }),
      ),
    ).rejects.toThrow();
    const result = await context(() =>
      service.change({
        ...input,
        intent: 'RESUME',
        expectedParticipationRevision: 3,
        expectedMode: 'AUTONOMOUS',
      }),
    );
    expect(result).toMatchObject({
      paused: false,
      mode: 'AUTONOMOUS',
      reassessLatest: true,
      participationRevision: 4,
    });
    expect(state.participation.replyAgentPauseHistory).toEqual([
      expect.objectContaining({
        resumedByWorkspaceMemberId: MEMBER,
        resumedRevision: 4,
      }),
    ]);
  });

  it('rejects disabled, absent enablement epoch, inaccessible, cross-workspace, wrong participation, and stale campaign before write', async () => {
    for (const alter of [
      (s: ReturnType<typeof fixture>) => {
        s.campaign.replyAgentEnabled = false;
      },
      (s: ReturnType<typeof fixture>) => {
        s.campaign.replyAgentEnabledAt = null;
      },
      (s: ReturnType<typeof fixture>) => {
        s.campaign.replyAgentRevision = 5;
      },
      (s: ReturnType<typeof fixture>) => {
        s.participation.campaignId = CREATOR;
      },
      (s: ReturnType<typeof fixture>) => {
        s.participation.id = CREATOR;
      },
      (s: ReturnType<typeof fixture>) => {
        s.repositories.creator.findOne.mockResolvedValueOnce(null as never);
      },
    ]) {
      const { state, service, context } = await run(alter);
      await expect(
        context(() => service.change({ ...input, intent: 'PAUSE' })),
      ).rejects.toThrow();
      expect(state.repositories.campaignCreator.update).not.toHaveBeenCalled();
    }
    const { service, context } = await run();
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'PAUSE',
          expectedWorkspaceId: CREATOR,
        }),
      ),
    ).rejects.toThrow();
  });

  it('does not change controls on lost role, stale revision, CAS race, or non-user actor', async () => {
    const { state, service, context } = await run();
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'PAUSE',
          expectedParticipationRevision: 1,
        }),
      ),
    ).rejects.toThrow();
    Object.assign(state.repositories.campaignCreator, {
      objectRecordsPermissions: null,
    });
    await expect(
      context(() => service.change({ ...input, intent: 'PAUSE' })),
    ).rejects.toThrow();
    expect(state.repositories.campaignCreator.update).not.toHaveBeenCalled();
    Object.assign(state.repositories.campaignCreator, {
      objectRecordsPermissions: {},
    });
    state.repositories.campaignCreator.update.mockResolvedValueOnce({
      affected: 0,
    } as never);
    await expect(
      context(() => service.change({ ...input, intent: 'PAUSE' })),
    ).rejects.toThrow();
    expect(state.participation.replyAgentPauseHistory).toEqual([]);
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'PAUSE',
          authContext: { ...authContext, type: 'apiKey' } as never,
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects current field-specific denial even when the row is readable', async () => {
    const { state, service, context } = await run();
    jest
      .mocked(validateOperationIsPermittedOrThrow)
      .mockImplementationOnce(() => {
        throw new Error('field permission denied');
      });
    await expect(
      context(() => service.change({ ...input, intent: 'PAUSE' })),
    ).rejects.toThrow('field permission denied');
    expect(state.repositories.campaignCreator.update).not.toHaveBeenCalled();
  });

  it('keeps a paused control across campaign mode changes but requires fresh mode disclosure on resume', async () => {
    const { state, service, context } = await run();
    await context(() => service.change({ ...input, intent: 'PAUSE' }));
    state.campaign.replyAgentMode = 'REVIEW';
    state.campaign.replyAgentRevision = 5;
    await expect(
      context(() =>
        service.change({
          ...input,
          intent: 'RESUME',
          expectedParticipationRevision: 3,
          expectedMode: 'AUTONOMOUS',
        }),
      ),
    ).rejects.toThrow();
    expect(state.participation.replyAgentPaused).toBe(true);
    const result = await context(() =>
      service.change({
        ...input,
        intent: 'RESUME',
        expectedCampaignRevision: 5,
        expectedParticipationRevision: 3,
        expectedMode: 'REVIEW',
      }),
    );
    expect(result).toMatchObject({
      paused: false,
      mode: 'REVIEW',
      campaignRevision: 5,
      reassessLatest: true,
    });
  });

  it.each(['DRAFT', 'PAUSED', 'COMPLETED'])(
    'resumes eligible follow-up handling when authored outreach is %s',
    async (lifecycleStatus) => {
      const { state, service, context } = await run();
      await context(() => service.change({ ...input, intent: 'PAUSE' }));
      state.campaign.lifecycleStatus = lifecycleStatus;
      const result = await context(() =>
        service.change({
          ...input,
          intent: 'RESUME',
          expectedParticipationRevision: 3,
          expectedMode: 'AUTONOMOUS',
        }),
      );
      expect(result).toMatchObject({ paused: false, reassessLatest: true });
      expect(state.participation.replyAgentPauseHistory).toEqual([
        expect.objectContaining({ resumedByWorkspaceMemberId: MEMBER }),
      ]);
    },
  );

  it('does not resume through Campaign handling disablement or participation exclusion/terminalization', async () => {
    for (const alter of [
      (s: ReturnType<typeof fixture>) => {
        s.campaign.replyAgentEnabled = false;
      },
      (s: ReturnType<typeof fixture>) => {
        s.participation.excludedAt = new Date();
      },
      (s: ReturnType<typeof fixture>) => {
        s.participation.stage = 'DROPPED';
      },
    ]) {
      const { state, service, context } = await run();
      await context(() => service.change({ ...input, intent: 'PAUSE' }));
      alter(state);
      await expect(
        context(() =>
          service.change({
            ...input,
            intent: 'RESUME',
            expectedParticipationRevision: 3,
            expectedMode: 'AUTONOMOUS',
          }),
        ),
      ).rejects.toThrow();
      expect(state.participation.replyAgentPaused).toBe(true);
      expect(state.repositories.campaignCreator.update).toHaveBeenCalledTimes(
        1,
      );
    }
  });

  it('rejects a context user mismatch or current membership reassignment before audit', async () => {
    const { state, service, context } = await run();
    await expect(
      context(() =>
        service.change({
          ...input,
          authContext: {
            ...authContext,
            user: { ...authContext.user, id: CREATOR },
            workspaceMember: {
              ...authContext.workspaceMember,
              userId: CREATOR,
            },
          },
          intent: 'PAUSE',
        }),
      ),
    ).rejects.toThrow();
    await expect(
      context(() =>
        service.change({
          ...input,
          authContext: {
            ...authContext,
            workspaceMember: {
              ...authContext.workspaceMember,
              userId: CREATOR,
            },
          },
          intent: 'PAUSE',
        }),
      ),
    ).rejects.toThrow();
    state.member.userId = CREATOR;
    await expect(
      context(() => service.change({ ...input, intent: 'PAUSE' })),
    ).rejects.toThrow();
    expect(state.repositories.campaignCreator.update).not.toHaveBeenCalled();
  });
});
