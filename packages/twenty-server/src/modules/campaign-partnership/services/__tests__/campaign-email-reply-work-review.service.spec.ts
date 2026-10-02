import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignEmailReplyWorkReviewService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-review.service';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';

jest.mock('src/engine/twenty-orm/repository/permissions.utils', () => ({
  validateOperationIsPermittedOrThrow: jest.fn(),
}));

const W = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333';
const CREATOR = '44444444-4444-4444-8444-444444444444';
const B = '55555555-5555-4555-8555-555555555555';
const M = '66666666-6666-4666-8666-666666666666';
const T = '77777777-7777-4777-8777-777777777777';
const CH = '88888888-8888-4888-8888-888888888888';
const A = '99999999-9999-4999-8999-999999999999';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WORK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const auth = {
  type: 'user',
  workspace: { id: W },
  userWorkspaceId: MEMBER,
  workspaceMemberId: MEMBER,
  workspaceMember: { id: MEMBER, userId: C },
  user: { id: C },
} as never;
const timestamp = new Date('2026-09-28T12:00:00Z');
const fixture = () => {
  const work = {
    id: WORK,
    workspaceId: W,
    state: 'HELD',
    contextGeneration: 0,
    purpose: 'REPLY_AMBIGUITY',
    reason: 'AWAITING_OPERATOR_ACCESS',
    triggerKey: `email-message:${M}`,
    canonicalMessageId: M,
    messageThreadId: T,
    messageChannelId: CH,
    connectedAccountId: A,
    accountIncarnationId: INC,
    providerMessageId: 'provider-id',
    providerThreadId: 'provider-thread',
    creatorSender: 'creator@example.test',
    accountRecipient: 'brand@example.test',
    baselineGenerationId: G,
    providerOccurredAt: timestamp,
    createdAt: new Date('2026-09-28T12:00:00Z'),
    participationId: null,
    resolvedCampaignId: null,
    resolvedCreatorId: null,
  };
  const binding = {
    id: B,
    campaignId: C,
    participationId: P,
    creatorId: CREATOR,
    messageThreadId: T,
    messageChannelId: CH,
    connectedAccountId: A,
    providerThreadId: 'provider-thread',
    creatorSender: work.creatorSender,
    accountRecipient: work.accountRecipient,
    messageId: null,
    establishedAt: new Date('2026-09-28T11:00:00Z'),
    revokedAt: null,
    deletedAt: null,
  };
  const campaign = {
    id: C,
    replyAgentEnabled: true,
    replyAgentMode: 'REVIEW',
    replyAgentEnabledAt: new Date('2026-09-28T11:00:00Z'),
    deletedAt: null,
  };
  const participation = {
    id: P,
    campaignId: C,
    creatorId: CREATOR,
    replyAgentPaused: false,
    replyAgentMaterialGeneration: 0,
    replyAgentPauseHistory: null,
    excludedAt: null,
    deletedAt: null,
    stage: 'CONTACTED',
  };
  let choices = [binding];
  let ready = true;
  let nativeUpdate = true;
  let rawCount = 1;
  const repository = (name: string) => ({
    target: name,
    objectRecordsPermissions: {
      campaignCreator: { canUpdateObjectRecords: true },
    },
    find: jest.fn(async () =>
      name === 'campaignEmailConversationBinding' ? choices : [],
    ),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
      if (name === 'workspaceMember')
        return where.id === MEMBER ? { id: MEMBER, userId: C } : null;
      if (name === 'campaign') return where.id === C ? campaign : null;
      if (name === 'campaignCreator')
        return where.id === P ? participation : null;
      if (name === 'creator')
        return where.id === CREATOR ? { id: CREATOR } : null;
      if (name === 'messageThread') return where.id === T ? { id: T } : null;
      return null;
    }),
  });
  const repos = Object.fromEntries(
    [
      'workspaceMember',
      'campaignEmailConversationBinding',
      'campaign',
      'campaignCreator',
      'creator',
      'messageThread',
    ].map((name) => [name, repository(name)]),
  );
  const query = jest.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes('to_regclass(\'core."campaignEmailWorkCollision"\')'))
      return [{ exists: 'core.campaignEmailWorkCollision' }];
    if (sql.trimStart().startsWith('SELECT c."id" AS "collisionId"'))
      return [
        {
          collisionId: B,
          originalWorkItemId: WORK,
          originalState: work.state,
          createdAt: new Date('2026-09-28T12:00:00Z'),
        },
      ];
    if (
      sql.includes(
        'to_regclass(\'core."UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM"\')',
      )
    )
      return [{ exists: 'core.UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM' }];
    if (sql.includes('FROM core."campaignPartnershipWorkItem"')) return [work];
    if (sql.includes('FROM core."campaignEmailBaselineGeneration"'))
      return ready
        ? [{ id: G, completedAt: new Date('2026-09-28T11:00:00Z') }]
        : [];
    if (
      sql.includes('SELECT count(*)') &&
      sql.includes('campaignEmailConversationBinding')
    )
      return [{ count: rawCount }];
    if (sql.includes('"message" m'))
      return [
        {
          id: M,
          creatorId: CREATOR,
          receivedAt: timestamp,
          createdAt: timestamp,
          direction: 'INCOMING',
          isDraft: false,
        },
      ];
    if (sql.includes('UPDATE core."campaignPartnershipWorkItem"')) {
      if (!nativeUpdate) return [[], 0];
      Object.assign(work, {
        state: 'PENDING',
        participationId: P,
        resolvedCampaignId: C,
        resolvedCreatorId: CREATOR,
        contextGeneration: 1,
      });
      return [[{ id: WORK }], 1];
    }
    return [];
  });
  const manager: {
    queryRunner: {
      isTransactionActive: boolean;
      isReleased: boolean;
      query: jest.Mock;
    };
    getRepository: jest.Mock;
    transaction: jest.Mock;
  } = {
    queryRunner: { isTransactionActive: true, isReleased: false, query },
    getRepository: jest.fn((name: string) => repos[name]),
    transaction: jest.fn(),
  };
  manager.transaction.mockImplementation(
    async (
      isolationOrFn: string | ((tx: unknown) => unknown),
      callback?: (tx: unknown) => unknown,
    ) =>
      (typeof isolationOrFn === 'function' ? isolationOrFn : callback!)(
        manager,
      ),
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (fn: () => unknown) => fn()),
    getRepository: jest.fn(async (_workspace: string, name: string) => ({
      ...repos[name],
      manager,
    })),
  };
  const boundary = {
    inspect: jest.fn(async () => ({
      status: 'unavailable',
      reason: 'IMMUTABLE_PROVIDER_IDENTITY_SCHEMA_REQUIRED',
      choices: choices.map((choice) => ({
        bindingId: choice.id,
        campaignId: choice.campaignId,
        participationId: choice.participationId,
        creatorId: choice.creatorId,
      })),
    })),
  };
  const service = new CampaignEmailReplyWorkReviewService(
    orm as never,
    boundary as never,
  );
  const context = <T>(fn: () => T) =>
    withWorkspaceContext(
      {
        authContext: auth,
        userWorkspaceRoleMap: { [MEMBER]: 'role' },
        apiKeyRoleMap: {},
      } as never,
      fn,
    );
  const input = {
    authContext: auth,
    expectedWorkspaceId: W,
    workItemId: WORK,
    bindingId: B,
    expectedContextGeneration: 0,
    expectedParticipationMaterialGeneration: 0,
  };
  return {
    service,
    boundary,
    repos,
    context,
    input,
    query,
    work,
    campaign,
    participation,
    setChoices: (value: typeof choices) => {
      choices = value;
    },
    setReady: (value: boolean) => {
      ready = value;
    },
    setNativeUpdate: (value: boolean) => {
      nativeUpdate = value;
    },
    setRawCount: (value: number) => {
      rawCount = value;
    },
  };
};

describe('authenticated held Email reply work review', () => {
  it('lists a neutral item with only role-visible choices, without promoting it', async () => {
    const f = fixture();
    await expect(
      f.context(() =>
        f.service.listHeld({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
        }),
      ),
    ).resolves.toMatchObject({
      items: [
        {
          workItemId: WORK,
          contextGeneration: 0,
          choices: [
            {
              bindingId: B,
              campaignId: C,
              participationId: P,
              creatorId: CREATOR,
            },
          ],
        },
      ],
    });
    f.setChoices([]);
    await expect(
      f.context(() =>
        f.service.listHeld({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
        }),
      ),
    ).resolves.toMatchObject({
      items: [
        {
          workItemId: WORK,
          contextGeneration: 0,
          choices: [],
        },
      ],
    });
    expect(f.work.state).toBe('HELD');
  });
  it('shows collision attention for a role-visible thread but removes the original resolution choice', async () => {
    const f = fixture();
    f.work.reason = 'PROVIDER_ID_COLLISION';
    await expect(
      f.context(() =>
        f.service.listCollisions({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
        }),
      ),
    ).resolves.toMatchObject({
      items: [
        { collisionId: B, originalWorkItemId: WORK, originalState: 'HELD' },
      ],
    });
    await expect(
      f.context(() =>
        f.service.listHeld({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
        }),
      ),
    ).resolves.toMatchObject({
      items: [{ workItemId: WORK, contextGeneration: 0, choices: [] }],
    });
    expect(f.boundary.inspect).not.toHaveBeenCalled();
    await expect(
      f.context(() =>
        f.service.listCollisions({
          authContext: auth,
          expectedWorkspaceId: A,
          threadId: T,
        }),
      ),
    ).rejects.toThrow();
  });
  it('pages 21 HELD and collision attention items without exposing source payload or accepting stale/cross-thread cursors', async () => {
    const f = fixture();
    const dates = Array.from(
      { length: 21 },
      (_, i) => new Date(Date.parse('2026-09-28T12:00:00Z') + i * 1000),
    );
    const ids = dates.map(
      (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    );
    const held = ids.map((id, i) => ({
      ...f.work,
      id,
      createdAt: dates[i],
      reason: 'PROVIDER_ID_COLLISION',
    }));
    const collision = ids.map((id, i) => ({
      collisionId: id,
      originalWorkItemId: WORK,
      originalState: 'HELD',
      createdAt: dates[i],
    }));
    f.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('to_regclass'))
        return [{ exists: 'core.campaignEmailWorkCollision' }];
      const records: Array<{
        id?: string;
        collisionId?: string;
        createdAt: Date;
      }> = sql.includes('FROM core."campaignEmailWorkCollision" c')
        ? collision
        : held;
      if (sql.includes('LIMIT 21')) {
        const time = params?.[2] as Date | undefined;
        const id = params?.[3] as string | undefined;
        return records
          .filter(
            (row) =>
              !time ||
              row.createdAt > time ||
              (row.createdAt.getTime() === time.getTime() &&
                typeof id === 'string' &&
                (row.id ?? row.collisionId ?? '') > id),
          )
          .slice(0, 21);
      }
      if (sql.includes('AS "createdAt"') || sql.includes('"createdAt" FROM'))
        return records.filter(
          (row) => row.id === params?.[2] || row.collisionId === params?.[2],
        );
      return records;
    });
    const heldFirst = await f.context(() =>
      f.service.listHeld({
        authContext: auth,
        expectedWorkspaceId: W,
        threadId: T,
      }),
    );
    expect(heldFirst.items).toHaveLength(20);
    expect(heldFirst.hasNextPage).toBe(true);
    expect(heldFirst.endCursor).toEqual(expect.any(String));
    expect(JSON.stringify(heldFirst)).not.toContain('creator@example.test');
    const heldLast = await f.context(() =>
      f.service.listHeld({
        authContext: auth,
        expectedWorkspaceId: W,
        threadId: T,
        cursor: heldFirst.endCursor!,
      }),
    );
    expect(heldLast.items.map((item) => item.workItemId)).toEqual([ids[20]]);
    expect(heldLast.hasNextPage).toBe(false);
    const collisionFirst = await f.context(() =>
      f.service.listCollisions({
        authContext: auth,
        expectedWorkspaceId: W,
        threadId: T,
      }),
    );
    expect(collisionFirst.items).toHaveLength(20);
    expect(collisionFirst.hasNextPage).toBe(true);
    const collisionLast = await f.context(() =>
      f.service.listCollisions({
        authContext: auth,
        expectedWorkspaceId: W,
        threadId: T,
        cursor: collisionFirst.endCursor!,
      }),
    );
    expect(collisionLast.items.map((item) => item.collisionId)).toEqual([
      ids[20],
    ]);
    expect(JSON.stringify(collisionLast)).not.toContain('creator@example.test');
    await expect(
      f.context(() =>
        f.service.listCollisions({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
          cursor: heldFirst.endCursor!,
        }),
      ),
    ).rejects.toThrow();
    f.repos.workspaceMember.findOne.mockResolvedValueOnce(null);
    await expect(
      f.context(() =>
        f.service.listCollisions({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
          cursor: collisionFirst.endCursor!,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      f.context(() =>
        f.service.listHeld({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: A,
          cursor: heldFirst.endCursor!,
        }),
      ),
    ).rejects.toThrow();
    f.query.mockImplementation(async (sql: string) =>
      sql.includes('to_regclass')
        ? [{ exists: 'core.campaignEmailWorkCollision' }]
        : [],
    );
    await expect(
      f.context(() =>
        f.service.listCollisions({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
          cursor: collisionFirst.endCursor!,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      f.context(() =>
        f.service.listHeld({
          authContext: auth,
          expectedWorkspaceId: W,
          threadId: T,
          cursor: heldFirst.endCursor!,
        }),
      ),
    ).rejects.toThrow();
  });
  it('promotes only an exact permissioned route under current READY proof with CAS; no enqueue/send', async () => {
    const f = fixture();
    await expect(f.context(() => f.service.promote(f.input))).resolves.toEqual({
      workItemId: WORK,
      state: 'PENDING',
      contextGeneration: 1,
    });
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('UPDATE core."campaignPartnershipWorkItem"'),
      ),
    ).toBe(true);
    expect(f.work.participationId).toBe(P);
    expect(f.work.resolvedCampaignId).toBe(C);
    expect(f.work.resolvedCreatorId).toBe(CREATOR);
  });
  it('holds denied workspace, hidden binding, reassignment, disabled/paused or lost frontier', async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => f.setChoices([]),
      (f: ReturnType<typeof fixture>) => {
        f.participation.creatorId = A;
      },
      (f: ReturnType<typeof fixture>) => {
        f.campaign.replyAgentEnabled = false;
      },
      (f: ReturnType<typeof fixture>) => {
        f.participation.replyAgentPaused = true;
      },
      (f: ReturnType<typeof fixture>) => f.setReady(false),
    ]) {
      const f = fixture();
      change(f);
      await expect(
        f.context(() => f.service.promote(f.input)),
      ).rejects.toThrow();
      expect(f.work.state).toBe('HELD');
    }
    const f = fixture();
    await expect(
      f.context(() =>
        f.service.promote({ ...f.input, expectedWorkspaceId: A }),
      ),
    ).rejects.toThrow();
  });
  it('holds a hidden competing route and role-field revocation without promotion', async () => {
    const conflict = fixture();
    conflict.setRawCount(2);
    await expect(
      conflict.context(() => conflict.service.promote(conflict.input)),
    ).rejects.toThrow();
    expect(conflict.work.state).toBe('HELD');
    const revoked = fixture();
    jest
      .mocked(validateOperationIsPermittedOrThrow)
      .mockImplementationOnce(() => {
        throw new Error('field permission denied');
      });
    await expect(
      revoked.context(() => revoked.service.promote(revoked.input)),
    ).rejects.toThrow('field permission denied');
    expect(revoked.work.state).toBe('HELD');
  });
  it('never promotes a provider identity collision even if a visible binding exists', async () => {
    const f = fixture();
    f.work.reason = 'PROVIDER_ID_COLLISION';
    await expect(f.context(() => f.service.promote(f.input))).rejects.toThrow();
    expect(f.work.state).toBe('HELD');
  });
  it('leaves work HELD on CAS race, never creates a second receipt', async () => {
    const f = fixture();
    f.setNativeUpdate(false);
    await expect(f.context(() => f.service.promote(f.input))).rejects.toThrow();
    expect(f.work.state).toBe('HELD');
  });
});
