import { BadRequestException, ForbiddenException } from '@nestjs/common';

import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH,
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import {
  type MyahInboxMutationRequest,
  MyahInboxMutationService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

const rolePermissionConfig = { unionOf: ['role-id'] };

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      authContext: userAuthContext,
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const ownerId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const otherMemberId = '20202020-0b5c-4178-bed7-d371f6411eab';
const thirdMemberId = '20202020-0b5c-4178-bed7-d371f6411eac';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const creatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';
const campaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d03';
const workspace = { id: workspaceId } as WorkspaceEntity;
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: '20202020-1234-5678-9012-345678901234',
  user: { id: 'user-id' },
  workspaceMemberId: ownerId,
  workspaceMember: { id: ownerId },
} as unknown as UserWorkspaceAuthContext;

const request = (
  workspaceMemberId = ownerId,
  authContext: WorkspaceAuthContext = {
    ...userAuthContext,
    workspaceMemberId,
    workspaceMember: { id: workspaceMemberId },
  } as UserWorkspaceAuthContext,
): MyahInboxMutationRequest => ({
  authContext,
  user: authContext.type === 'user' ? authContext.user : undefined,
  workspace,
  workspaceMemberId,
});

type ThreadRecord = {
  id: string;
  creatorId: string | null;
  myahCampaignId: string | null;
  inboxOwnerId: string | null;
  inboxState: MyahInboxState;
  snoozedUntil: Date | string | null;
  myahReplyDraftBody: { markdown: string; blocknote: string | null } | null;
  myahReplyDraftRevision: number;
};

const initialThread = (): ThreadRecord => ({
  id: threadId,
  creatorId: null,
  myahCampaignId: null,
  inboxOwnerId: ownerId,
  inboxState: MyahInboxState.NEEDS_REPLY,
  snoozedUntil: null,
  myahReplyDraftBody: { markdown: 'existing draft', blocknote: null },
  myahReplyDraftRevision: 2,
});

const createService = ({
  thread = initialThread(),
  readableCreatorIds = [creatorId],
  readableCampaignIds = [campaignId],
  readableMemberIds = [ownerId, otherMemberId, thirdMemberId],
  hasReadableMessage = true,
  projectionReadable = true,
  canUpdateMessageThread = true,
}: {
  thread?: ThreadRecord | null;
  readableCreatorIds?: string[];
  readableCampaignIds?: string[];
  readableMemberIds?: string[];
  hasReadableMessage?: boolean;
  projectionReadable?: boolean;
  canUpdateMessageThread?: boolean;
} = {}) => {
  let persistedThread = thread;
  const targets = {
    messageThread: Symbol('messageThread'),
    message: Symbol('message'),
    creator: Symbol('creator'),
    campaign: Symbol('campaign'),
    workspaceMember: Symbol('workspaceMember'),
  };

  const updateMessageThread = (
    criteria: Partial<ThreadRecord>,
    patch: Record<string, unknown>,
    canUpdate: boolean,
  ) => {
    if (!canUpdate) {
      return Promise.reject(
        new ForbiddenException('MessageThread update denied'),
      );
    }

    if (
      !persistedThread ||
      criteria.id !== persistedThread.id ||
      (criteria.inboxOwnerId !== undefined &&
        criteria.inboxOwnerId !== persistedThread.inboxOwnerId) ||
      (criteria.myahReplyDraftRevision !== undefined &&
        criteria.myahReplyDraftRevision !==
          persistedThread.myahReplyDraftRevision)
    ) {
      return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
    }

    persistedThread = {
      ...persistedThread,
      ...patch,
      myahReplyDraftRevision:
        typeof patch.myahReplyDraftRevision === 'function'
          ? persistedThread.myahReplyDraftRevision + 1
          : ((patch.myahReplyDraftRevision as number | undefined) ??
            persistedThread.myahReplyDraftRevision),
    } as ThreadRecord;

    return Promise.resolve({
      affected: 1,
      raw: [{ ...persistedThread }],
      generatedMaps: [{ ...persistedThread }],
    });
  };

  const messageThreadRepository = {
    target: targets.messageThread,
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          persistedThread?.id === where.id ? { ...persistedThread } : null,
        ),
      ),
    update: jest.fn(
      (criteria: Partial<ThreadRecord>, patch: Record<string, unknown>) =>
        updateMessageThread(criteria, patch, canUpdateMessageThread),
    ),
  };
  const bypassedMessageThreadRepository = {
    ...messageThreadRepository,
    update: jest.fn(
      (criteria: Partial<ThreadRecord>, patch: Record<string, unknown>) =>
        updateMessageThread(criteria, patch, true),
    ),
  };
  const messageRepository = {
    target: targets.message,
    findOne: jest
      .fn()
      .mockResolvedValue(hasReadableMessage ? { id: 'message-id' } : null),
  };
  const creatorRepository = {
    target: targets.creator,
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          readableCreatorIds.includes(where.id)
            ? { id: where.id, name: 'Creator' }
            : null,
        ),
      ),
  };
  const campaignRepository = {
    target: targets.campaign,
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          readableCampaignIds.includes(where.id)
            ? { id: where.id, name: 'Campaign' }
            : null,
        ),
      ),
  };
  const workspaceMemberRepository = {
    target: targets.workspaceMember,
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          readableMemberIds.includes(where.id)
            ? { id: where.id, name: { firstName: where.id, lastName: '' } }
            : null,
        ),
      ),
  };
  const repositories = {
    messageThread: messageThreadRepository,
    message: messageRepository,
    creator: creatorRepository,
    campaign: campaignRepository,
    workspaceMember: workspaceMemberRepository,
  };
  const repositoryByTarget = new Map(
    Object.entries(repositories).map(([name, repository]) => [
      targets[name as keyof typeof targets],
      repository,
    ]),
  );
  const transactionManager = {
    getRepository: jest.fn(
      (
        target: symbol,
        permissionConfig?: { shouldBypassPermissionChecks?: boolean },
      ) =>
        target === targets.messageThread &&
        permissionConfig?.shouldBypassPermissionChecks
          ? bypassedMessageThreadRepository
          : repositoryByTarget.get(target),
    ),
  };
  const transaction = jest
    .fn()
    .mockImplementation(
      (run: (manager: typeof transactionManager) => unknown) =>
        run(transactionManager),
    );
  Object.assign(messageThreadRepository, { manager: { transaction } });
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((run: () => unknown) => run()),
    getRepository: jest.fn(
      (_workspaceId: string, objectName: keyof typeof repositories) =>
        repositories[objectName],
    ),
  };
  const getThreadSummary = jest.fn().mockImplementation(() => {
    if (!persistedThread || !projectionReadable) {
      throw new ForbiddenException('Inbox thread is not readable');
    }

    return Promise.resolve({
      id: persistedThread.id,
      lastActivityAt: '2026-07-24T10:00:00.000Z',
      subject: 'Visible subject',
      lastMessagePreview: 'Visible body',
      lastMessageSender: 'creator@example.com',
      state: persistedThread.inboxState,
      snoozedUntil:
        persistedThread.snoozedUntil instanceof Date
          ? persistedThread.snoozedUntil.toISOString()
          : persistedThread.snoozedUntil,
      creator: persistedThread.creatorId
        ? { id: persistedThread.creatorId, name: 'Creator' }
        : null,
      campaign: persistedThread.myahCampaignId
        ? { id: persistedThread.myahCampaignId, name: 'Campaign' }
        : null,
      inboxOwner: persistedThread.inboxOwnerId
        ? { id: persistedThread.inboxOwnerId, name: 'Owner' }
        : null,
    });
  });
  const service = new MyahInboxMutationService(
    globalWorkspaceOrmManager as never,
    { getThreadSummary } as never,
  );

  return {
    service,
    repositories,
    bypassedMessageThreadRepository,
    globalWorkspaceOrmManager,
    transaction,
    transactionManager,
    getThreadSummary,
    get persistedThread() {
      return persistedThread;
    },
  };
};

describe('MyahInboxMutationService', () => {
  it('requires matching authenticated user, workspace, and member context', async () => {
    const { service, transaction } = createService();
    const mismatchedAuthContext = {
      ...userAuthContext,
      workspaceMemberId: otherMemberId,
    } as UserWorkspaceAuthContext;

    await expect(
      service.updateMyahInboxThread({
        ...request(ownerId, mismatchedAuthContext),
        threadId,
        creatorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing or unreadable current workspace member', async () => {
    const { service } = createService({ readableMemberIds: [otherMemberId] });

    await expect(
      service.updateMyahInboxThread({
        ...request(),
        threadId,
        creatorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechecks policy visibility before applying a selected Creator link', async () => {
    const setup = createService();

    setup.getThreadSummary
      .mockResolvedValueOnce({ id: threadId })
      .mockRejectedValueOnce(
        new ForbiddenException('Inbox thread is not readable'),
      );

    await expect(
      setup.service.updateMyahInboxThread({
        ...request(),
        threadId,
        creatorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.getThreadSummary).toHaveBeenCalledTimes(2);
    expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
  });
  it('assigns, reassigns, and clears owner without changing the shared draft or revision', async () => {
    const setup = createService();
    const originalBody = setup.persistedThread?.myahReplyDraftBody;
    const originalRevision = setup.persistedThread?.myahReplyDraftRevision;

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      inboxOwnerId: otherMemberId,
    });
    expect(setup.persistedThread).toMatchObject({
      inboxOwnerId: otherMemberId,
      myahReplyDraftBody: originalBody,
      myahReplyDraftRevision: originalRevision,
    });

    await setup.service.updateMyahInboxThread({
      ...request(otherMemberId),
      threadId,
      inboxOwnerId: thirdMemberId,
    });
    expect(setup.persistedThread).toMatchObject({
      inboxOwnerId: thirdMemberId,
      myahReplyDraftBody: originalBody,
      myahReplyDraftRevision: originalRevision,
    });

    await setup.service.updateMyahInboxThread({
      ...request(thirdMemberId),
      threadId,
      inboxOwnerId: null,
    });
    expect(setup.persistedThread).toMatchObject({
      inboxOwnerId: null,
      myahReplyDraftBody: originalBody,
      myahReplyDraftRevision: originalRevision,
    });
  });

  it('preserves relations omitted as own undefined GraphQL input properties', async () => {
    const setup = createService({
      thread: {
        ...initialThread(),
        creatorId,
        myahCampaignId: campaignId,
      },
    });

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      creatorId: undefined,
      campaignId: undefined,
      inboxOwnerId: otherMemberId,
    });

    expect(setup.persistedThread).toMatchObject({
      creatorId,
      myahCampaignId: campaignId,
      inboxOwnerId: otherMemberId,
    });
  });

  it('keeps owner triage independent from policy-authorized draft editing', async () => {
    const setup = createService();

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      inboxOwnerId: otherMemberId,
    });
    setup.repositories.messageThread.update.mockClear();

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'first shared copy', blocknote: null },
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 3 });
    expect(
      setup.bypassedMessageThreadRepository.update,
    ).toHaveBeenLastCalledWith(
      { id: threadId, myahReplyDraftRevision: 2 },
      expect.anything(),
      expect.anything(),
    );

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(otherMemberId),
        threadId,
        expectedRevision: 3,
        body: { markdown: 'second shared copy', blocknote: null },
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 4 });

    await setup.service.updateMyahInboxThread({
      ...request(otherMemberId),
      threadId,
      inboxOwnerId: null,
    });
    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(thirdMemberId),
        threadId,
        expectedRevision: 4,
        body: { markdown: 'unassigned shared copy', blocknote: null },
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 5 });
  });

  it('saves a policy-visible draft when generic MessageThread updates are denied', async () => {
    const setup = createService({ canUpdateMessageThread: false });

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(otherMemberId),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'shared copy', blocknote: null },
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 3 });
    expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
    expect(setup.bypassedMessageThreadRepository.update).toHaveBeenCalledWith(
      { id: threadId, myahReplyDraftRevision: 2 },
      expect.anything(),
      expect.anything(),
    );
    expect(setup.transactionManager.getRepository).toHaveBeenCalledWith(
      setup.repositories.messageThread.target,
      { shouldBypassPermissionChecks: true },
      expect.objectContaining({ workspaceMemberId: otherMemberId }),
    );
  });

  it('requires a future timestamp when entering SNOOZED', async () => {
    const { service } = createService();

    await expect(
      service.updateMyahInboxThread({
        ...request(),
        threadId,
        inboxState: MyahInboxState.SNOOZED,
        snoozedUntil: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateMyahInboxThread({
        ...request(),
        threadId,
        inboxState: MyahInboxState.SNOOZED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a future snooze and clears snoozedUntil for every non-SNOOZED state', async () => {
    const setup = createService();
    const future = '2099-01-01T00:00:00.000Z';

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      inboxState: MyahInboxState.SNOOZED,
      snoozedUntil: future,
    });
    expect(setup.persistedThread).toMatchObject({
      inboxState: MyahInboxState.SNOOZED,
      snoozedUntil: future,
    });

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      inboxState: MyahInboxState.WAITING_ON_CREATOR,
    });
    expect(setup.persistedThread).toMatchObject({
      inboxState: MyahInboxState.WAITING_ON_CREATOR,
      snoozedUntil: null,
    });
  });
  it('state-CASes a relation-only patch so a concurrent snooze keeps its timestamp', async () => {
    const future = '2099-01-01T00:00:00.000Z';
    const setup = createService({
      thread: {
        ...initialThread(),
        inboxState: MyahInboxState.SNOOZED,
        snoozedUntil: future,
      },
    });

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      creatorId,
    });

    expect(setup.repositories.messageThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ inboxState: MyahInboxState.SNOOZED }),
      expect.anything(),
      expect.anything(),
    );
    expect(setup.persistedThread).toMatchObject({
      creatorId,
      inboxState: MyahInboxState.SNOOZED,
      snoozedUntil: future,
    });
  });

  it('rejects a null-only snooze update before write', async () => {
    const setup = createService({
      thread: {
        ...initialThread(),
        inboxState: MyahInboxState.SNOOZED,
        snoozedUntil: '2099-01-01T00:00:00.000Z',
      },
    });

    await expect(
      setup.service.updateMyahInboxThread({
        ...request(),
        threadId,
        snoozedUntil: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
  });
  it('accepts explicit null while transitioning to a non-SNOOZED state', async () => {
    const setup = createService({
      thread: {
        ...initialThread(),
        inboxState: MyahInboxState.SNOOZED,
        snoozedUntil: '2099-01-01T00:00:00.000Z',
      },
    });

    await expect(
      setup.service.updateMyahInboxThread({
        ...request(),
        threadId,
        inboxState: MyahInboxState.CLOSED,
        snoozedUntil: null,
      }),
    ).resolves.toBeDefined();
    expect(setup.persistedThread).toMatchObject({
      inboxState: MyahInboxState.CLOSED,
      snoozedUntil: null,
    });
  });

  it.each([
    ['Creator', { creatorId }, { readableCreatorIds: [] }],
    ['Campaign', { campaignId }, { readableCampaignIds: [] }],
    [
      'owner',
      { inboxOwnerId: otherMemberId },
      { readableMemberIds: [ownerId] },
    ],
  ])(
    'rejects an unreadable or cross-workspace %s target',
    async (_label, update, options) => {
      const { service } = createService(options);

      await expect(
        service.updateMyahInboxThread({
          ...request(),
          threadId,
          ...update,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('links and clears Creator independently, moving into and out of Unmatched', async () => {
    const setup = createService();

    const linked = await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      creatorId,
    });
    expect(linked.creator).toEqual({ id: creatorId, name: 'Creator' });
    expect(setup.persistedThread?.creatorId).toBe(creatorId);

    const unmatched = await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      creatorId: null,
    });
    expect(unmatched.creator).toBeNull();
    expect(setup.persistedThread?.creatorId).toBeNull();
  });

  it('links and clears Campaign without changing Creator', async () => {
    const setup = createService({
      thread: { ...initialThread(), creatorId },
    });

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      campaignId,
    });
    expect(setup.persistedThread).toMatchObject({
      creatorId,
      myahCampaignId: campaignId,
    });

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      campaignId: null,
    });
    expect(setup.persistedThread).toMatchObject({
      creatorId,
      myahCampaignId: null,
    });
  });

  it('returns the persisted body and revision on a stale compare-and-set without overwriting', async () => {
    const setup = createService({
      thread: {
        ...initialThread(),
        myahReplyDraftBody: { markdown: 'newer copy', blocknote: null },
        myahReplyDraftRevision: 3,
      },
    });

    const staleSave = await setup.service.saveMyahInboxDraft({
      ...request(),
      threadId,
      expectedRevision: 2,
      body: { markdown: 'stale copy', blocknote: null },
    });

    expect(staleSave).toEqual({
      status: 'CONFLICT',
      revision: 3,
      body: { markdown: 'newer copy', blocknote: null },
    });
    expect(setup.bypassedMessageThreadRepository.update).toHaveBeenCalledTimes(
      1,
    );
    expect(setup.persistedThread?.myahReplyDraftBody).toEqual({
      markdown: 'newer copy',
      blocknote: null,
    });
  });

  it('increments revision exactly once on both save and clear, including a successful no-op clear', async () => {
    const setup = createService({
      thread: { ...initialThread(), myahReplyDraftBody: null },
    });

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'saved copy', blocknote: null },
      }),
    ).resolves.toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'saved copy', blocknote: null },
    });
    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 3,
        body: null,
      }),
    ).resolves.toEqual({ status: 'SAVED', revision: 4, body: null });
    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 4,
        body: null,
      }),
    ).resolves.toEqual({ status: 'SAVED', revision: 5, body: null });
  });

  it('fails closed after a zero-row update when the thread vanished or ownership changed', async () => {
    const setup = createService();
    setup.bypassedMessageThreadRepository.update.mockImplementationOnce(() => {
      const current = setup.persistedThread;

      if (current) {
        current.inboxOwnerId = otherMemberId;
      }

      return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
    });

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'copy', blocknote: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an existing readable native message so drafts remain reply-only', async () => {
    const setup = createService({ hasReadableMessage: false });

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'first outbound', blocknote: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
  });

  it.each(['triage', 'draft'])(
    'rejects a thread hidden by the Task 3 message visibility projection before %s writes',
    async (mutation) => {
      const setup = createService({ projectionReadable: false });

      await expect(
        mutation === 'triage'
          ? setup.service.updateMyahInboxThread({
              ...request(),
              threadId,
              creatorId,
            })
          : setup.service.saveMyahInboxDraft({
              ...request(),
              threadId,
              expectedRevision: 2,
              body: { markdown: 'hidden thread copy', blocknote: null },
            }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
    },
  );

  it('rechecks policy visibility inside the draft transaction before a bypassed update', async () => {
    const setup = createService();
    setup.getThreadSummary
      .mockResolvedValueOnce({ id: threadId })
      .mockRejectedValueOnce(
        new ForbiddenException('Inbox thread is not readable'),
      );

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'hidden after preflight', blocknote: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(setup.getThreadSummary).toHaveBeenCalledTimes(2);
    expect(setup.bypassedMessageThreadRepository.update).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs, revisions, empty triage updates, and oversized draft payloads before writing', async () => {
    const setup = createService();

    await expect(
      setup.service.updateMyahInboxThread({
        ...request(),
        threadId: 'not-a-uuid',
        creatorId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup.service.updateMyahInboxThread({ ...request(), threadId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: -1,
        body: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: {
          markdown: 'x'.repeat(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH + 1),
          blocknote: null,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: {
          markdown: 'valid',
          blocknote: 'x'.repeat(MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH + 1),
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
  });

  it('rejects dangerous blocknote URLs before any draft write', async () => {
    const setup = createService();

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: {
          markdown: 'unsafe link',
          blocknote:
            '[{"type":"paragraph","content":[{"type":"link","href":"javascript:alert(1)"}]}]',
        },
      }),
    ).rejects.toThrow();
    expect(setup.repositories.messageThread.update).not.toHaveBeenCalled();
  });

  it('uses only workspace-scoped thread/context repositories and never creates a Message or calls a provider path', async () => {
    const setup = createService();

    await setup.service.saveMyahInboxDraft({
      ...request(),
      threadId,
      expectedRevision: 2,
      body: { markdown: 'local only', blocknote: null },
    });

    expect(
      setup.globalWorkspaceOrmManager.getRepository.mock.calls.map(
        (call) => call[1],
      ),
    ).toEqual(
      expect.arrayContaining([
        'messageThread',
        'message',
        'creator',
        'campaign',
        'workspaceMember',
      ]),
    );
    expect(setup.repositories.message.findOne).toHaveBeenCalled();
    expect(setup.repositories.message).not.toHaveProperty('save');
    expect(setup.repositories.message).not.toHaveProperty('insert');
  });
});
