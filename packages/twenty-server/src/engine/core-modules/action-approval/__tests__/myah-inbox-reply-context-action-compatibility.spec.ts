import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const deliveryTargetId = '00000000-0000-4000-8000-000000000002';
const draftId = '00000000-0000-4000-8000-000000000003';
const binding = {
  workspaceId,
  draftId,
  actionName: 'send_inbox_reply',
  actionVersion: 2,
  threadId: null,
  interactionContextType: 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT',
  interactionContextId: draftId,
  initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000004',
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  actionContextFingerprint: 'd'.repeat(64),
  evidenceLinks: [],
  myahReplyContextSnapshot: {
    schemaVersion: 1,
    channel: 'EMAIL',
    deliveryTargetId,
    draftId,
    replyContext: { kind: 'GENERAL' },
    contactAnchor: { kind: 'EMAIL_THREAD', id: deliveryTargetId },
    creatorId: null,
    eligibilityEvidenceDigest: 'a'.repeat(64),
    contextFingerprint: 'b'.repeat(64),
    authoredContextFingerprint: 'b'.repeat(64),
    reviewedContextFingerprint: null,
  },
} as const;

const setup = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoinAndSelect', 'innerJoin', 'where', 'andWhere'])
    qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => []);
  const manager = {
    query: jest.fn(async (_sql: string, _parameters?: unknown[]) => []),
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (_entity, value) => ({ id: 'binding', ...value })),
    getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
  };
  const dataSource = {
    ...manager,
    transaction: jest.fn(async (run) => run(manager)),
  };
  const service = new ActionApprovalService(dataSource as never, {} as never);
  return { service, manager, qb };
};

describe('Email context action compatibility', () => {
  it.each([null, 'agent-chat'])(
    'persists the complete immutable v2 authority for direct and Agent pending approvals (%s)',
    async (threadId) => {
      const { service, manager } = setup();
      const input = threadId
        ? {
            ...binding,
            threadId,
            interactionContextId: null,
            interactionContextType: null,
          }
        : binding;
      await service.createPendingBinding(input);
      expect(manager.create).toHaveBeenCalledWith(
        ActionApprovalBindingEntity,
        expect.objectContaining({
          threadId,
          interactionContextType: input.interactionContextType,
          interactionContextId: input.interactionContextId,
          myahReplyContextSnapshot: binding.myahReplyContextSnapshot,
        }),
      );
    },
  );

  it('takes the exact target lock before the legacy v1 draft lock', async () => {
    const { service, manager } = setup();
    await service.executeInboxReplyLocked(
      { workspaceId, draftId: deliveryTargetId },
      async () => undefined,
    );
    expect(manager.query.mock.calls.map((call) => call[1])).toEqual([
      [`myah-inbox-reply-target:${workspaceId}:EMAIL:${deliveryTargetId}`],
      [`myah-inbox-reply:${workspaceId}:${deliveryTargetId}`],
    ]);
  });

  it('queries legacy Agent v1 by draftId, groups sibling v2 within workspace, and gives UNKNOWN precedence', async () => {
    const { service, qb } = setup();
    qb.getMany.mockResolvedValue([
      {
        state: 'CONSUMED',
        actionVersion: 1,
        draftId: deliveryTargetId,
        threadId: 'agent-chat',
        receipts: [{ state: 'PROCESSING' }],
      },
      { state: 'CONSUMED', receipts: [{ state: 'UNKNOWN' }] },
    ] as never);
    await expect(
      service.getInboxReplyTargetExecutionState({
        workspaceId,
        deliveryTargetId,
      }),
    ).resolves.toBe('UNKNOWN');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(/^\(\(binding\."actionVersion" = 1.*OR.*\)\)$/),
      { draftTargetId: deliveryTargetId, snapshotTargetId: deliveryTargetId },
    );
  });
});

it('installs strict version-specific snapshot checks and a v2 immutable authority guard', async () => {
  const { CreateMyahInboxReplyContextDraftsFastInstanceCommand } =
    await import('src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789645911001-create-myah-inbox-reply-context-drafts');
  const query = jest.fn(async (_sql: string) => []);
  await new CreateMyahInboxReplyContextDraftsFastInstanceCommand().up({
    query,
  } as never);
  const sql = query.mock.calls.map(([statement]) => statement).join('\n');
  expect(sql).toContain('IS TRUE');
  expect(sql).toContain(
    'NEW."myahReplyContextSnapshot" IS DISTINCT FROM OLD."myahReplyContextSnapshot"',
  );
  expect(sql).toContain('CREATE TRIGGER');
});

it('legacy Email saving checks target-wide sibling state, not only the old draft identity', async () => {
  const { service } = setup();
  const state = jest
    .spyOn(service, 'getInboxReplyTargetExecutionState')
    .mockResolvedValue('UNKNOWN');
  await expect(
    service.isDraftExecutionLocked({
      workspaceId,
      actionName: 'send_inbox_reply',
      draftId: deliveryTargetId,
    }),
  ).resolves.toBe(true);
  expect(state).toHaveBeenCalledWith({ workspaceId, deliveryTargetId });
});

it('authorizes the direct v2 viewer without interpreting its target as an Agent chat', async () => {
  const findOne = jest.fn(async () => ({ ...binding, id: 'binding' }));
  const getRepository = jest.fn(() => ({ findOne }));
  const service = new ActionApprovalService(
    { getRepository } as never,
    {} as never,
  );
  await expect(
    service.getBindingForViewer({
      workspaceId,
      bindingId: 'binding',
      userWorkspaceId: binding.initiatorUserWorkspaceId,
    }),
  ).resolves.toMatchObject({ threadId: null });
  expect(getRepository).toHaveBeenCalledTimes(1);
});

it('reserves the target before approving an Agent card so two sibling approvals cannot claim it', async () => {
  const { service, manager } = setup();
  const pending = {
    ...binding,
    threadId: 'agent-chat',
    interactionContextType: null,
    interactionContextId: null,
    state: 'PENDING',
    expiresAt: new Date('2099-01-01'),
  };
  const transaction = { ...manager, findOne: jest.fn(async () => pending) };
  await service.decidePendingBindingInTransaction(transaction as never, {
    workspaceId,
    userWorkspaceId: binding.initiatorUserWorkspaceId,
    threadId: 'agent-chat',
    approvalBindingId: 'binding',
    decision: 'approved',
  });
  expect(manager.query.mock.calls[0]).toEqual([
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [`myah-inbox-reply-target:${workspaceId}:EMAIL:${deliveryTargetId}`],
  ]);
  expect(pending.state).toBe('APPROVED');
});

it('queries only legacy Instagram v2 REPLY conversation evidence for an Instagram target', async () => {
  const { service, qb } = setup();
  await service.getInboxReplyTargetExecutionState({
    workspaceId,
    deliveryTargetId,
    channel: 'INSTAGRAM',
  });
  expect(qb.innerJoin).toHaveBeenCalledWith(
    'binding.evidenceLinks',
    'targetEvidence',
    expect.any(String),
    { targetRole: 'SOCIAL_CONVERSATION', deliveryTargetId },
  );
  expect(qb.andWhere).toHaveBeenCalledWith(
    'binding."actionVersion" = 2 AND binding."actionKind" = :actionKind',
    { actionKind: 'REPLY' },
  );
});

it('preserves the original v1 logical key byte-for-byte', async () => {
  const { createHash } = await import('node:crypto');
  const { computeLogicalActionKey } =
    await import('src/engine/core-modules/action-approval/utils/action-binding-digest.util');
  const legacy = {
    ...binding,
    actionVersion: 1 as const,
    threadId: deliveryTargetId,
    draftId: deliveryTargetId,
  };
  expect(computeLogicalActionKey(legacy)).toBe(
    createHash('sha256')
      .update(
        JSON.stringify([
          'v1',
          workspaceId,
          'send_inbox_reply',
          1,
          deliveryTargetId,
          binding.contentDigest,
          binding.recipientFingerprint,
          binding.sendingAccountFingerprint,
          binding.actionContextFingerprint,
        ]),
      )
      .digest('hex'),
  );
});

it.each([null, 'agent-chat'])(
  'round-trips persisted direct/Agent v2 approval authority (%s)',
  async (threadId) => {
    const input = {
      ...binding,
      threadId,
      interactionContextType: threadId ? null : binding.interactionContextType,
      interactionContextId: threadId ? null : binding.draftId,
    };
    const stored = {
      ...input,
      state: 'APPROVED',
      actionKind: null,
      expiresAt: new Date('2099-01-01'),
      myahReplyContextSnapshot: Object.fromEntries(
        Object.entries(input.myahReplyContextSnapshot).reverse(),
      ),
    };
    const manager = {
      findOne: jest.fn(async () => stored),
      find: jest.fn(async () => []),
      save: jest.fn(),
    };
    const service = new ActionApprovalService(
      { transaction: jest.fn(async (run) => run(manager)) } as never,
      {} as never,
    );
    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId: 'binding',
        initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
        threadId,
        interactionContextId: input.interactionContextId,
        interactionContextType: input.interactionContextType,
      }),
    ).resolves.toEqual(input);
  },
);
