import { MYAH_INBOX_MAX_PAGE_SIZE } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';

type RawThread = {
  id: string;
  lastActivityAt: Date | string;
  lastMessagePreview?: string | null;
  lastMessageSender?: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  inboxOwnerId?: string | null;
  state?: string | null;
};

const createQueryBuilder = (rows: RawThread[]) => {
  const queryBuilder = {
    addOrderBy: jest.fn(),
    addSelect: jest.fn(),
    andWhere: jest.fn(),
    createQueryBuilder: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rows),
    leftJoin: jest.fn(),
    limit: jest.fn(),
    orderBy: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
  };

  Object.values(queryBuilder).forEach((method) => {
    if (typeof method === 'function' && method !== queryBuilder.getRawMany) {
      method.mockReturnValue(queryBuilder);
    }
  });

  return queryBuilder;
};

const createService = (rows: RawThread[]) => {
  const queryBuilder = createQueryBuilder(rows);
  const repository = { createQueryBuilder: jest.fn(() => queryBuilder) };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback) => callback()),
    getRepository: jest.fn().mockResolvedValue(repository),
  };

  return {
    globalWorkspaceOrmManager,
    queryBuilder,
    service: new MyahInboxQueryService(globalWorkspaceOrmManager as never),
  };
};

describe('MyahInboxQueryService', () => {
  it('orders by latest message time then thread id and clamps page size', async () => {
    const { service, queryBuilder } = createService([
      {
        id: 'thread-2',
        lastActivityAt: '2026-07-21T10:00:00.000Z',
        lastMessagePreview: 'Latest',
      },
      {
        id: 'thread-1',
        lastActivityAt: '2026-07-21T09:00:00.000Z',
      },
    ]);

    await expect(
      service.listThreads({
        workspaceId: 'workspace-id',
        workspaceMemberId: 'member-id',
        first: 1,
      }),
    ).resolves.toMatchObject({
      edges: [
        {
          node: {
            id: 'thread-2',
            lastActivityAt: '2026-07-21T10:00:00.000Z',
          },
        },
      ],
      pageInfo: { hasNextPage: true },
    });

    await service.listThreads({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      first: MYAH_INBOX_MAX_PAGE_SIZE + 1,
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'latestMessage.receivedAt',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('messageThread.id', 'DESC');
    expect(queryBuilder.limit).toHaveBeenLastCalledWith(
      MYAH_INBOX_MAX_PAGE_SIZE + 1,
    );
  });

  it('round-trips a tied timestamp cursor without duplicate or skipped threads', async () => {
    const tiedAt = '2026-07-21T10:00:00.000Z';
    const firstPage = createService([
      { id: 'thread-2', lastActivityAt: tiedAt },
      { id: 'thread-1', lastActivityAt: tiedAt },
    ]);

    const firstResult = await firstPage.service.listThreads({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      first: 1,
    });
    const secondPage = createService([{ id: 'thread-1', lastActivityAt: tiedAt }]);
    const secondResult = await secondPage.service.listThreads({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      first: 1,
      after: firstResult.pageInfo.endCursor ?? undefined,
    });

    expect(firstResult.edges.map((edge) => edge.node.id)).toEqual(['thread-2']);
    expect(secondResult.edges.map((edge) => edge.node.id)).toEqual(['thread-1']);
    expect(secondPage.queryBuilder.andWhere).toHaveBeenCalledWith(
      '(latestMessage.receivedAt < :cursorReceivedAt OR (latestMessage.receivedAt = :cursorReceivedAt AND messageThread.id < :cursorThreadId))',
      { cursorReceivedAt: tiedAt, cursorThreadId: 'thread-2' },
    );
  });

  it('applies queue, ownership, campaign, state, and search filters to the native thread query', async () => {
    const { service, queryBuilder } = createService([]);

    await service.listThreads({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      queue: 'CREATOR_LINKED',
      owner: 'ME',
      campaignId: 'campaign-id',
      states: ['OPEN', 'SNOOZED'],
      search: 'contract',
    });
    await service.listThreads({
      workspaceId: 'workspace-id',
      workspaceMemberId: 'member-id',
      queue: 'UNMATCHED',
      owner: 'UNASSIGNED',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'messageThread.creatorId IS NOT NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'messageThread.creatorId IS NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'messageThread.inboxOwnerId = :inboxOwnerId',
      { inboxOwnerId: 'member-id' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'messageThread.inboxOwnerId IS NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'messageThread.campaignId = :campaignId',
      { campaignId: 'campaign-id' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'messageThread.inboxState IN (:...states)',
      { states: ['OPEN', 'SNOOZED'] },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(latestMessage.subject ILIKE :search OR latestMessage.text ILIKE :search)',
      { search: '%contract%' },
    );
  });

  it('excludes soft-deleted rows and exposes deleted relation context as null', async () => {
    const { service, queryBuilder } = createService([
      {
        id: 'thread-1',
        lastActivityAt: '2026-07-21T10:00:00.000Z',
        creatorId: null,
        campaignId: null,
      },
    ]);

    await expect(
      service.listThreads({
        workspaceId: 'workspace-id',
        workspaceMemberId: 'member-id',
      }),
    ).resolves.toMatchObject({
      edges: [
        {
          node: {
            creator: null,
            campaign: null,
          },
        },
      ],
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'messageThread.deletedAt IS NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'latestMessage.deletedAt IS NULL',
    );
  });
});
