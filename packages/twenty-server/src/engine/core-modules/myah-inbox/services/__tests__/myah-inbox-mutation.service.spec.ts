import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH,
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  type MyahInboxMutationRequest,
  MyahInboxMutationService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { FindOperator } from 'typeorm';

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
const otherCreatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d04';
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
  myahReplyDraftBody: { markdown: string; blocknote: string | null } | null;
  myahReplyDraftRevision: number;
};

const initialThread = (): ThreadRecord => ({
  id: threadId,
  creatorId: null,
  myahCampaignId: null,
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
  draftExecutionLocked = false,
  migrationStatus = 'MIGRATING',
}: {
  thread?: ThreadRecord | null;
  readableCreatorIds?: string[];
  readableCampaignIds?: string[];
  readableMemberIds?: string[];
  hasReadableMessage?: boolean;
  projectionReadable?: boolean;
  canUpdateMessageThread?: boolean;
  draftExecutionLocked?: boolean;
  migrationStatus?: 'MIGRATING' | 'READY';
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
      (criteria.creatorId !== undefined &&
        ((criteria.creatorId as unknown) instanceof FindOperator
          ? persistedThread.creatorId !== null
          : criteria.creatorId !== persistedThread.creatorId)) ||
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
    query: jest.fn((sql: string) =>
      sql.includes('FROM "myahInboxTriageMigration"')
        ? Promise.resolve([{ status: migrationStatus }])
        : Promise.resolve(undefined),
    ),
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
  const coreTransactionManager = { query: jest.fn().mockResolvedValue([]) };
  const coreTransaction = jest
    .fn()
    .mockImplementation(
      (run: (manager: typeof coreTransactionManager) => unknown) =>
        run(coreTransactionManager),
    );
  const dataSource = { transaction: coreTransaction };
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
      creator: persistedThread.creatorId
        ? { id: persistedThread.creatorId, name: 'Creator' }
        : null,
      campaign: persistedThread.myahCampaignId
        ? { id: persistedThread.myahCampaignId, name: 'Campaign' }
        : null,
    });
  });
  const isDraftExecutionLocked = jest
    .fn()
    .mockResolvedValue(draftExecutionLocked);
  const withPreparedSourceMutationInTransaction = jest.fn(
    async ({ mutate }: { mutate: () => Promise<unknown> }) => mutate(),
  );
  const service = new MyahInboxMutationService(
    globalWorkspaceOrmManager as never,
    { getThreadSummary } as never,
    { withPreparedSourceMutationInTransaction } as never,
    { isDraftExecutionLocked } as never,
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    service,
    repositories,
    bypassedMessageThreadRepository,
    globalWorkspaceOrmManager,
    transaction,
    transactionManager,
    coreTransaction,
    coreTransactionManager,
    getThreadSummary,
    isDraftExecutionLocked,
    withPreparedSourceMutationInTransaction,
    get persistedThread() {
      return persistedThread;
    },
  };
};

describe('MyahInboxMutationService', () => {
  it('rejects legacy Email draft saves before opening transactions or repository writes', async () => {
    const setup = createService();

    await expect(
      setup.service.saveMyahInboxDraft({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'legacy draft', blocknote: null },
      }),
    ).rejects.toEqual(
      new ConflictException(
        'Email reply drafts require a refreshed contextual reply flow',
      ),
    );
    expect(setup.coreTransaction).not.toHaveBeenCalled();
    expect(setup.transaction).not.toHaveBeenCalled();
    expect(setup.bypassedMessageThreadRepository.update).not.toHaveBeenCalled();
  });

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
      campaignId,
    });

    expect(setup.persistedThread).toMatchObject({
      creatorId,
      myahCampaignId: campaignId,
    });
  });

  it('keeps relink independent from policy-authorized draft editing', async () => {
    const setup = createService();

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      creatorId,
    });
    setup.repositories.messageThread.update.mockClear();

    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(otherMemberId),
        threadId,
        expectedRevision: 3,
        body: { markdown: 'second shared copy', blocknote: null },
      }),
    ).resolves.toMatchObject({ status: 'SAVED', revision: 4 });

    await setup.service.updateMyahInboxThread({
      ...request(otherMemberId),
      threadId,
      creatorId: null,
    });
    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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

  it('carries the loaded Creator into the compare-and-set of a relation-only patch', async () => {
    const setup = createService({
      thread: { ...initialThread(), creatorId: otherCreatorId },
    });

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      campaignId,
    });

    expect(setup.repositories.messageThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: threadId, creatorId: otherCreatorId }),
      { myahCampaignId: campaignId },
      expect.anything(),
    );
  });

  it('compare-and-sets an unlinked thread with an explicit null Creator match', async () => {
    const setup = createService();

    await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      campaignId,
    });

    const [criteria] = setup.repositories.messageThread.update.mock.calls[0];
    expect(criteria).toMatchObject({ id: threadId });
    expect(criteria.creatorId).toBeInstanceOf(FindOperator);
  });

  it('links and clears Creator independently, moving into and out of Unmatched', async () => {
    const setup = createService();

    const linked = await setup.service.updateMyahInboxThread({
      ...request(),
      threadId,
      creatorId,
    });
    expect(linked.creator).toEqual({ id: creatorId, name: 'Creator' });
    expect(setup.persistedThread?.creatorId).toBe(creatorId);
    expect(setup.withPreparedSourceMutationInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        sourceRecordIds: [threadId],
        nextCreatorIds: [creatorId],
        manager: setup.transactionManager,
      }),
    );

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

    const staleSave =
      await setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: 3,
        body: null,
      }),
    ).resolves.toEqual({ status: 'SAVED', revision: 4, body: null });
    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: 4,
        body: null,
      }),
    ).resolves.toEqual({ status: 'SAVED', revision: 5, body: null });
  });

  it('fails closed after a zero-row update when the thread vanished or was relinked', async () => {
    const setup = createService();
    setup.bypassedMessageThreadRepository.update.mockImplementationOnce(() => {
      const current = setup.persistedThread;

      if (current) {
        current.creatorId = otherCreatorId;
      }

      return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
    });

    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
          : setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'hidden after preflight', blocknote: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(setup.getThreadSummary).toHaveBeenCalledTimes(2);
    expect(setup.bypassedMessageThreadRepository.update).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs, revisions, empty updates, and oversized draft payloads before writing', async () => {
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: -1,
        body: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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
      setup.service.saveMyahInboxDraftAfterProviderFailure({
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

    await setup.service.saveMyahInboxDraftAfterProviderFailure({
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
  it('keeps immutable receipt recovery available without reopening the public legacy draft-write path', async () => {
    const setup = createService({ draftExecutionLocked: true });

    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'recovered copy', blocknote: null },
      }),
    ).resolves.toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'recovered copy', blocknote: null },
    });
    expect(setup.isDraftExecutionLocked).not.toHaveBeenCalled();
    expect(setup.bypassedMessageThreadRepository.update).toHaveBeenCalledTimes(
      1,
    );
  });

  it('keeps workspace raw SQL forbidden while acquiring the advisory lock through the core transaction before CAS', async () => {
    const setup = createService();
    setup.transactionManager.query.mockRejectedValue(
      new Error('Raw SQL queries are not allowed'),
    );

    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'core transaction copy', blocknote: null },
      }),
    ).resolves.toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'core transaction copy', blocknote: null },
    });

    expect(setup.coreTransaction).toHaveBeenCalledTimes(1);
    expect(setup.coreTransactionManager.query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`myah-inbox-reply-target:${workspaceId}:EMAIL:${threadId}`],
    ]);
    expect(setup.coreTransactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`myah-inbox-reply:${workspaceId}:${threadId}`],
    );
    expect(
      setup.coreTransactionManager.query.mock.invocationCallOrder[0],
    ).toBeLessThan(
      setup.bypassedMessageThreadRepository.update.mock.invocationCallOrder[0],
    );
    expect(setup.transactionManager.query).not.toHaveBeenCalled();
  });

  it('takes the shared advisory lock before receipt recovery draft CAS', async () => {
    const setup = createService();

    await setup.service.saveMyahInboxDraftAfterProviderFailure({
      ...request(),
      threadId,
      expectedRevision: 2,
      body: { markdown: 'serialized copy', blocknote: null },
    });

    expect(setup.coreTransactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`myah-inbox-reply:${workspaceId}:${threadId}`],
    );
    expect(
      setup.coreTransactionManager.query.mock.invocationCallOrder[0],
    ).toBeLessThan(
      setup.bypassedMessageThreadRepository.update.mock.invocationCallOrder[0],
    );
  });

  it('uses the same advisory lock to preserve a rejected draft while its receipt is processing', async () => {
    const setup = createService({ draftExecutionLocked: true });

    await expect(
      setup.service.saveMyahInboxDraftAfterProviderFailure({
        ...request(),
        threadId,
        expectedRevision: 2,
        body: { markdown: 'rejected copy', blocknote: null },
      }),
    ).resolves.toEqual({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'rejected copy', blocknote: null },
    });
    expect(setup.isDraftExecutionLocked).not.toHaveBeenCalled();
    expect(setup.coreTransactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`myah-inbox-reply:${workspaceId}:${threadId}`],
    );
  });
});
