import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { MessageParticipantRole } from 'twenty-shared/types';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MYAH_INBOX_MAX_PAGE_SIZE } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  type MyahInboxListThreadsInput,
  MyahInboxQueryService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyBriefingService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service';
import { MessageVisibilityAccess } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

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
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const userWorkspaceId = '20202020-1234-5678-9012-345678901234';
const tiedThreadAId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const tiedThreadBId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const workspace = { id: workspaceId } as WorkspaceEntity;
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: 'user-id' },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
} as unknown as UserWorkspaceAuthContext;

const fullVisibilityExpression = 'policy_visibility(latestMessage.id)';
const historyVisibilityExpression = 'policy_visibility(message.id)';

const row = (
  id: string,
  lastActivityAt: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  lastActivityAt,
  subject: `subject-${id}`,
  lastMessagePreview: `body-${id}`,
  lastMessageSender: `sender-${id}@example.com`,
  messageVisibility: MessageVisibilityAccess.FULL,
  state: 'NEEDS_REPLY',
  snoozedUntil: null,
  creatorId: null,
  campaignId: null,
  inboxOwnerId: null,
  ...overrides,
});

type QueryBuilderCalls = {
  operations: string[];
  selects: Array<[string, string?]>;
  joins: Array<[string, string, string?]>;
  where: Array<[string, Record<string, unknown> | undefined]>;
  order: Array<[string, string]>;
  limit: number | undefined;
  parameters: Record<string, unknown>;
};
type QueryBuilderMock = {
  select: jest.Mock;
  addSelect: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  limit: jest.Mock;
  setParameters: jest.Mock;
  getRawMany: jest.Mock;
};

const createQueryBuilder = (rows: unknown[]) => {
  const calls: QueryBuilderCalls = {
    operations: [],
    selects: [],
    joins: [],
    where: [],
    order: [],
    limit: undefined,
    parameters: {},
  };
  const queryBuilder: QueryBuilderMock = {
    select: jest.fn((expression: string, alias?: string) => {
      calls.operations.push('select');
      calls.selects.push([expression, alias]);
      return queryBuilder;
    }),
    addSelect: jest.fn((expression: string, alias?: string) => {
      calls.operations.push('select');
      calls.selects.push([expression, alias]);
      return queryBuilder;
    }),
    innerJoin: jest.fn(
      (relation: string, alias: string, condition?: string) => {
        calls.operations.push('join');
        calls.joins.push([relation, alias, condition]);
        return queryBuilder;
      },
    ),
    where: jest.fn(
      (expression: string, parameters?: Record<string, unknown>) => {
        calls.operations.push('where');
        calls.where.push([expression, parameters]);
        return queryBuilder;
      },
    ),
    andWhere: jest.fn(
      (expression: string, parameters?: Record<string, unknown>) => {
        calls.operations.push('where');
        calls.where.push([expression, parameters]);
        return queryBuilder;
      },
    ),
    orderBy: jest.fn((expression: string, direction: string) => {
      calls.operations.push('order');
      calls.order.push([expression, direction]);
      return queryBuilder;
    }),
    addOrderBy: jest.fn((expression: string, direction: string) => {
      calls.operations.push('order');
      calls.order.push([expression, direction]);
      return queryBuilder;
    }),
    limit: jest.fn((limit: number) => {
      calls.operations.push('limit');
      calls.limit = limit;
      return queryBuilder;
    }),
    setParameters: jest.fn((parameters: Record<string, unknown>) => {
      calls.parameters = { ...calls.parameters, ...parameters };
      return queryBuilder;
    }),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };

  return { queryBuilder, calls };
};

const createService = ({
  rows = [],
  historyRows = [],
  creatorRecords = [],
  campaignRecords = [],
  workspaceMemberRecords = [
    { id: workspaceMemberId, name: { firstName: 'Zac', lastName: 'Operator' } },
  ],
  campaignFilterRecord,
  ownerFilterRecord,
  creatorFindError,
  campaignFindError,
  creatorFind,
  campaignFind,
  creatorBriefingRecord,
  campaignCreatorBriefingRecord,
  messageParticipantRecords = [],
}: {
  rows?: unknown[];
  historyRows?: unknown[];
  creatorRecords?: unknown[];
  campaignRecords?: unknown[];
  workspaceMemberRecords?: unknown[];
  campaignFilterRecord?: unknown;
  ownerFilterRecord?: unknown;
  creatorFindError?: Error;
  campaignFindError?: Error;
  creatorFind?: (options: unknown) => Promise<unknown[]>;
  campaignFind?: (options: unknown) => Promise<unknown[]>;
  creatorBriefingRecord?: unknown;
  campaignCreatorBriefingRecord?: unknown;
  messageParticipantRecords?: unknown[];
} = {}) => {
  const { queryBuilder, calls } = createQueryBuilder(rows);
  const { queryBuilder: historyQueryBuilder, calls: historyCalls } =
    createQueryBuilder(historyRows);
  const messageThreadRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const messageRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(historyQueryBuilder),
  };
  const creatorRepository = {
    find: creatorFindError
      ? jest.fn().mockRejectedValue(creatorFindError)
      : creatorFind
        ? jest.fn(creatorFind)
        : jest.fn().mockResolvedValue(creatorRecords),
    findOne: jest.fn().mockResolvedValue(creatorBriefingRecord),
  };
  const campaignRepository = {
    find: campaignFindError
      ? jest.fn().mockRejectedValue(campaignFindError)
      : campaignFind
        ? jest.fn(campaignFind)
        : jest.fn().mockResolvedValue(campaignRecords),
    findOne: jest.fn().mockResolvedValue(campaignFilterRecord),
  };
  const workspaceMemberRepository = {
    find: jest.fn().mockResolvedValue(workspaceMemberRecords),
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === workspaceMemberId) {
          return Promise.resolve(workspaceMemberRecords[0] ?? null);
        }
        return Promise.resolve(ownerFilterRecord ?? null);
      }),
  };
  const messageParticipantRepository = {
    find: jest.fn().mockResolvedValue(messageParticipantRecords),
  };

  const repositories = {
    messageThread: messageThreadRepository,
    message: messageRepository,
    messageParticipant: messageParticipantRepository,
    creator: creatorRepository,
    campaign: campaignRepository,
    campaignCreator: {
      findOne: jest.fn().mockResolvedValue(campaignCreatorBriefingRecord),
    },
    workspaceMember: workspaceMemberRepository,
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((run: () => unknown) => run()),
    getRepository: jest.fn(
      (_workspaceId: string, objectName: keyof typeof repositories) =>
        repositories[objectName],
    ),
  };
  const visibilityPolicy = {
    buildSqlVisibilityProjection: jest
      .fn()
      .mockImplementation(
        ({ messageIdExpression }: { messageIdExpression: string }) => ({
          expression:
            messageIdExpression === 'message.id'
              ? historyVisibilityExpression
              : fullVisibilityExpression,
          parameters: {
            messageVisibilityFull: MessageVisibilityAccess.FULL,
            messageVisibilitySubject: MessageVisibilityAccess.SUBJECT,
            messageVisibilityMetadata: MessageVisibilityAccess.METADATA,
            messageVisibilityHidden: MessageVisibilityAccess.HIDDEN,
          },
        }),
      ),
  };

  return {
    service: new MyahInboxQueryService(
      globalWorkspaceOrmManager as never,
      visibilityPolicy as never,
    ),
    calls,
    historyCalls,
    queryBuilder,
    globalWorkspaceOrmManager,
    visibilityPolicy,
    creatorRepository,
    campaignRepository,
    workspaceMemberRepository,
  };
};

const listInput = (
  overrides: Record<string, unknown> = {},
): MyahInboxListThreadsInput =>
  ({
    authContext: userAuthContext,
    user: userAuthContext.user,
    workspace,
    workspaceMemberId,
    ...overrides,
  }) as MyahInboxListThreadsInput;

const allWhereSql = (calls: QueryBuilderCalls) =>
  calls.where.map(([expression]) => expression).join('\n');

const allJoinSql = (calls: QueryBuilderCalls) =>
  calls.joins.map(([, , condition]) => condition ?? '').join('\n');

const allSelectSql = (calls: QueryBuilderCalls) =>
  calls.selects.map(([expression]) => expression).join('\n');

describe('MyahInboxQueryService', () => {
  it('orders and pages only policy-visible latest messages with the exact connection shape', async () => {
    const { service, calls } = createService({
      rows: [
        row('thread-2', '2026-07-21T10:00:00.000Z'),
        row('thread-1', '2026-07-21T09:00:00.000Z'),
      ],
    });

    await expect(
      service.listThreads(listInput({ first: 1 })),
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
    expect(calls.order).toEqual([
      ['latest_message."receivedAt"', 'DESC'],
      ['message_thread.id', 'DESC'],
    ]);
    expect(calls.limit).toBe(2);
    expect(allJoinSql(calls)).toContain(fullVisibilityExpression);
    expect(allJoinSql(calls)).toContain('candidateMessage."deletedAt" IS NULL');
    expect(allJoinSql(calls)).toContain(
      'candidateChannel.type IN (:...inboxEmailChannelTypes)',
    );
    expect(calls.parameters).toMatchObject({
      inboxEmailChannelTypes: ['EMAIL', 'EMAIL_GROUP'],
    });
    expect(allWhereSql(calls)).toContain('message_thread."deletedAt" IS NULL');
    expect(allWhereSql(calls)).toContain('latest_message."deletedAt" IS NULL');
    expect(calls.operations.indexOf('join')).toBeLessThan(
      calls.operations.indexOf('order'),
    );
    expect(calls.operations.indexOf('order')).toBeLessThan(
      calls.operations.indexOf('limit'),
    );
  });

  it('returns linked and unlinked readable threads in the same unfiltered Inbox page', async () => {
    const { service, calls } = createService({
      rows: [
        row('linked-thread', '2026-07-21T10:00:00.000Z', {
          creatorId: 'creator-id',
        }),
        row('unlinked-thread', '2026-07-21T09:00:00.000Z'),
      ],
    });

    await expect(
      service.listThreads(listInput({ first: 10 })),
    ).resolves.toMatchObject({
      edges: [
        { node: { id: 'linked-thread' } },
        { node: { id: 'unlinked-thread' } },
      ],
    });

    expect(allWhereSql(calls)).not.toContain(
      'message_thread."creatorId" IS NOT NULL',
    );
    expect(allWhereSql(calls)).not.toContain(
      'message_thread."creatorId" IS NULL',
    );
  });

  it('round-trips a tied timestamp cursor without duplicate or skipped thread ids', async () => {
    const firstPage = createService({
      rows: [row(tiedThreadBId, '2026-07-21T10:00:00.000Z')],
    });
    const firstResult = await firstPage.service.listThreads(
      listInput({ first: 1 }),
    );
    const secondPage = createService({
      rows: [row(tiedThreadAId, '2026-07-21T10:00:00.000Z')],
    });

    await expect(
      secondPage.service.listThreads(
        listInput({ first: 1, after: firstResult.pageInfo.endCursor }),
      ),
    ).resolves.toMatchObject({
      edges: [{ node: { id: tiedThreadAId } }],
      pageInfo: { hasNextPage: false },
    });
    expect(allWhereSql(secondPage.calls)).toContain(
      'latest_message."receivedAt" < :cursorReceivedAt',
    );
    expect(allWhereSql(secondPage.calls)).toContain(
      'message_thread.id < :cursorThreadId',
    );
    expect(secondPage.calls.where).toContainEqual([
      expect.stringContaining('message_thread.id < :cursorThreadId'),
      expect.objectContaining({
        cursorReceivedAt: '2026-07-21T10:00:00.000Z',
        cursorThreadId: tiedThreadBId,
      }),
    ]);
  });

  it('rejects malformed cursors instead of changing pagination membership', async () => {
    const { service } = createService();

    await expect(
      service.listThreads(listInput({ after: 'not-a-cursor' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a decoded cursor with a non-UUID thread id before querying', async () => {
    const { service, globalWorkspaceOrmManager } = createService();
    const cursor = Buffer.from(
      JSON.stringify({
        receivedAt: '2026-07-21T10:00:00.000Z',
        threadId: 'not-a-uuid',
      }),
    ).toString('base64url');

    await expect(
      service.listThreads(listInput({ after: cursor })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('canonicalizes a valid cursor timestamp before applying it to SQL', async () => {
    const { service, calls } = createService();
    const cursor = Buffer.from(
      JSON.stringify({
        receivedAt: '2026-07-21T10:00:00Z',
        threadId: tiedThreadBId,
      }),
    ).toString('base64url');

    await service.listThreads(listInput({ after: cursor }));

    expect(calls.where).toContainEqual([
      expect.stringContaining('message_thread.id < :cursorThreadId'),
      expect.objectContaining({
        cursorReceivedAt: '2026-07-21T10:00:00.000Z',
        cursorThreadId: tiedThreadBId,
      }),
    ]);
  });

  it.each([
    ['thread', { threadId: 'not-a-uuid' }],
    ['Campaign', { campaignId: 'not-a-uuid' }],
    ['owner', { owner: 'not-a-uuid' }],
  ])(
    'rejects an invalid explicit %s id before querying',
    async (_label, filter) => {
      const { service, globalWorkspaceOrmManager } = createService();

      await expect(
        service.listThreads(listInput(filter)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    },
  );

  it('matches readable linked Creator names before pagination', async () => {
    const linkedCreatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';
    const { service, calls } = createService({
      creatorFind: async (options) => {
        if (
          !options ||
          typeof options !== 'object' ||
          !('where' in options) ||
          !options.where ||
          typeof options.where !== 'object'
        ) {
          return [];
        }

        return 'name' in options.where ? [{ id: linkedCreatorId }] : [];
      },
    });

    await service.listThreads(listInput({ first: 10, search: 'nadine' }));

    expect(allWhereSql(calls)).toContain(
      'message_thread."creatorId" = ANY(:searchCreatorIds)',
    );
    expect(calls.where).toContainEqual([
      expect.stringContaining(
        'message_thread."creatorId" = ANY(:searchCreatorIds)',
      ),
      {
        search: '%nadine%',
        searchCreatorIds: [linkedCreatorId],
      },
    ]);
    expect(calls.operations.lastIndexOf('where')).toBeLessThan(
      calls.operations.indexOf('limit'),
    );
  });

  it('keeps message search usable when Creator names are unreadable', async () => {
    const creatorNameDenied = new PermissionsException(
      'Creator name is unreadable',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
    const normalCreatorRecords = [
      { id: '20202020-f7c5-4e2f-a44a-240b2d3a9d02', name: 'Nadine' },
    ];
    const { service, calls, creatorRepository } = createService({
      creatorRecords: normalCreatorRecords,
      creatorFind: async (options) => {
        if (
          options &&
          typeof options === 'object' &&
          'select' in options &&
          options.select &&
          typeof options.select === 'object' &&
          'name' in options.select &&
          options.select.name === true
        ) {
          throw creatorNameDenied;
        }

        return normalCreatorRecords;
      },
    });

    await expect(
      service.listThreads(listInput({ search: 'nadine' })),
    ).resolves.toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    expect(creatorRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true } }),
    );
    expect(calls.where).toContainEqual([
      expect.stringContaining('latest_message.subject ILIKE :search'),
      { search: '%nadine%', searchCreatorIds: [] },
    ]);
  });

  it('applies owner, Campaign, state, and policy-aware search filters before limit without a Creator gate', async () => {
    const campaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';
    const { service, calls } = createService({
      campaignFilterRecord: { id: campaignId, name: 'Campaign' },
    });

    await service.listThreads(
      listInput({
        first: 10,
        owner: 'ME',
        campaignId,
        states: ['NEEDS_REPLY', 'SNOOZED'],
        search: 'private phrase',
      }),
    );

    const whereSql = allWhereSql(calls);

    expect(whereSql).not.toContain('message_thread."creatorId" IS NOT NULL');
    expect(whereSql).not.toContain('message_thread."creatorId" IS NULL');
    expect(whereSql).toContain('message_thread."inboxOwnerId" = :inboxOwnerId');
    expect(whereSql).toContain('message_thread."myahCampaignId" = :campaignId');
    expect(whereSql).toContain('message_thread."inboxState" IN (:...states)');
    expect(whereSql).toContain(fullVisibilityExpression);
    expect(whereSql).toContain('latest_message.subject ILIKE :search');
    expect(whereSql).toContain('latest_message.text ILIKE :search');
    expect(whereSql).toContain(':messageVisibilitySubject');
    expect(whereSql).toContain(':messageVisibilityFull');
    expect(whereSql).not.toContain(
      ':messageVisibilityMetadata) AND latest_message.text',
    );
    expect(calls.operations.lastIndexOf('where')).toBeLessThan(
      calls.operations.indexOf('limit'),
    );
  });

  it('searches the latest non-deleted sender by name or handle without a sender join before pagination', async () => {
    const { service, calls } = createService();

    await service.listThreads(
      listInput({ first: 10, search: 'private phrase' }),
    );

    const whereSql = allWhereSql(calls);

    expect(whereSql).toMatch(
      /OR EXISTS \(\s*SELECT 1\s*FROM "[^"]+"\."messageParticipant" search_sender/,
    );
    expect(whereSql).toContain('search_sender."messageId" = latest_message.id');
    expect(whereSql).toContain('search_sender."deletedAt" IS NULL');
    expect(whereSql).toContain('search_sender.role = :fromParticipantRole');
    expect(whereSql).toContain('search_sender."displayName" ILIKE :search');
    expect(whereSql).toContain('search_sender.handle ILIKE :search');
    expect(calls.where).toContainEqual([
      expect.stringContaining('search_sender."displayName" ILIKE :search'),
      {
        search: '%private phrase%',
        searchCreatorIds: [],
      },
    ]);
    expect(calls.parameters).toMatchObject({
      fromParticipantRole: MessageParticipantRole.FROM,
    });
    expect(calls.joins.some(([, alias]) => alias === 'search_sender')).toBe(
      false,
    );
    expect(calls.operations.lastIndexOf('where')).toBeLessThan(
      calls.operations.indexOf('limit'),
    );
  });

  it.each([
    ['active', 'ACTIVE', '>'],
    ['due', 'DUE', '<='],
  ])(
    'filters %s Snoozed conversations by their deadline before pagination',
    async (_label, snoozeStatus, comparison) => {
      const { service, calls } = createService();

      await service.listThreads(listInput({ snoozeStatus }));

      expect(calls.where).toContainEqual([
        'message_thread."inboxState" = :snoozedState',
        { snoozedState: 'SNOOZED' },
      ]);
      expect(allWhereSql(calls)).toContain(
        `message_thread."snoozedUntil" ${comparison} CURRENT_TIMESTAMP`,
      );
      expect(calls.operations.lastIndexOf('where')).toBeLessThan(
        calls.operations.indexOf('limit'),
      );
    },
  );

  it('supports unassigned and explicit readable owner filters without a Creator gate', async () => {
    const ownerId = '20202020-0b5c-4178-bed7-d371f6411eab';
    const { service, calls } = createService({
      ownerFilterRecord: { id: ownerId },
    });

    await service.listThreads(listInput({ owner: 'UNASSIGNED' }));
    await service.listThreads(listInput({ owner: ownerId }));

    const whereSql = allWhereSql(calls);

    expect(whereSql).not.toContain('message_thread."creatorId" IS NOT NULL');
    expect(whereSql).not.toContain('message_thread."creatorId" IS NULL');
    expect(whereSql).toContain('message_thread."inboxOwnerId" IS NULL');
    expect(whereSql).toContain('message_thread."inboxOwnerId" = :inboxOwnerId');
  });

  it('clamps oversized service callers to MYAH_INBOX_MAX_PAGE_SIZE', async () => {
    const { service, calls } = createService();

    await service.listThreads(listInput({ first: 10_000 }));

    expect(calls.limit).toBe(MYAH_INBOX_MAX_PAGE_SIZE + 1);
  });

  it('masks body for SUBJECT and subject/body for METADATA while full access stays visible', async () => {
    const { service } = createService({
      rows: [
        row('full', '2026-07-21T12:00:00.000Z'),
        row('subject', '2026-07-21T11:00:00.000Z', {
          messageVisibility: MessageVisibilityAccess.SUBJECT,
          subject: 'visible subject',
          lastMessagePreview: 'hidden body',
        }),
        row('metadata', '2026-07-21T10:00:00.000Z', {
          messageVisibility: MessageVisibilityAccess.METADATA,
          subject: 'hidden subject',
          lastMessagePreview: 'hidden body',
        }),
      ],
    });

    const result = await service.listThreads(listInput({ first: 3 }));

    expect(result.edges.map(({ node }) => node)).toEqual([
      expect.objectContaining({
        id: 'full',
        subject: 'subject-full',
        lastMessagePreview: 'body-full',
      }),
      expect.objectContaining({
        id: 'subject',
        subject: 'visible subject',
        lastMessagePreview: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      }),
      expect.objectContaining({
        id: 'metadata',
        subject: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        lastMessagePreview: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      }),
    ]);
  });

  it('selects the latest visible message before search, ordering, cursor, and page size', async () => {
    const { service, calls } = createService({
      rows: [row('thread-with-hidden-newest', '2026-07-21T09:00:00.000Z')],
    });

    await service.listThreads(
      listInput({ first: 1, search: 'visible older body' }),
    );

    const joinSql = allJoinSql(calls);
    const selectSql = allSelectSql(calls);

    expect(joinSql).toContain(
      'candidateMessage."messageThreadId" = message_thread.id',
    );
    expect(joinSql).toContain(
      `${fullVisibilityExpression} <> :messageVisibilityHidden`,
    );
    expect(joinSql).toContain(
      'ORDER BY candidateMessage."receivedAt" DESC, candidateMessage.id DESC LIMIT 1',
    );
    expect(selectSql).toContain(fullVisibilityExpression);
    expect(selectSql).toContain(':messageVisibilitySubject');
    expect(selectSql).toContain(':messageVisibilityMetadata');
    expect(calls.operations.indexOf('join')).toBeLessThan(
      calls.operations.lastIndexOf('where'),
    );
  });

  it('keeps role-readable relation IDs and briefing fields when optional names are denied', async () => {
    const relationNameDenied = new PermissionsException(
      'Relation name is unreadable',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
    const creatorId = '20202020-0b5c-4178-bed7-d371f6411ea3';
    const campaignId = '20202020-0b5c-4178-bed7-d371f6411ea4';
    const {
      service,
      creatorRepository,
      campaignRepository,
      globalWorkspaceOrmManager,
      visibilityPolicy,
    } = createService({
      rows: [
        row(tiedThreadAId, '2026-07-21T10:00:00.000Z', {
          creatorId,
          campaignId,
        }),
      ],
      creatorFind: ({ select }: { select: Record<string, boolean> }) => {
        if (select.name) {
          return Promise.reject(relationNameDenied);
        }

        return Promise.resolve([{ id: creatorId }]);
      },
      campaignFind: ({ select }: { select: Record<string, boolean> }) => {
        if (select.name) {
          return Promise.reject(relationNameDenied);
        }

        return Promise.resolve([{ id: campaignId }]);
      },
      campaignFilterRecord: { objective: 'Reach skincare creators' },
      campaignCreatorBriefingRecord: { stage: 'CONTACTED' },
    });
    creatorRepository.findOne.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        if (select.name) {
          return Promise.reject(relationNameDenied);
        }

        return Promise.resolve({
          language: 'English',
          location: 'London',
          categories: 'Beauty',
          niches: 'Skincare',
        });
      },
    );

    const briefing = await new MyahInboxReplyBriefingService(
      service,
      globalWorkspaceOrmManager as never,
      visibilityPolicy as never,
    ).loadReplyBriefing({
      ...listInput(),
      threadId: tiedThreadAId,
    });

    expect(briefing).toMatchObject({
      thread: {
        id: tiedThreadAId,
        creator: { id: creatorId, name: null },
        campaign: { id: campaignId, name: null },
      },
      campaign: { objective: 'Reach skincare creators' },
      campaignCreator: { stage: 'CONTACTED' },
      creator: {
        name: null,
        language: 'English',
        location: 'London',
        categories: ['Beauty'],
        niches: ['Skincare'],
      },
    });
    expect(JSON.stringify(briefing)).not.toContain(
      'Relation name is unreadable',
    );
    expect(creatorRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
    expect(campaignRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
  });

  it('returns null relation context when Creator or Campaign was deleted or is unreadable', async () => {
    const { service } = createService({
      rows: [
        row('thread-id', '2026-07-21T10:00:00.000Z', {
          creatorId: 'deleted-creator-id',
          campaignId: 'deleted-campaign-id',
        }),
      ],
      creatorRecords: [],
      campaignRecords: [],
    });

    await expect(service.listThreads(listInput())).resolves.toMatchObject({
      edges: [
        {
          node: {
            id: 'thread-id',
            creator: null,
            campaign: null,
          },
        },
      ],
    });
  });

  it('degrades denied optional Creator and Campaign hydration to null without failing the thread list', async () => {
    const creatorPermissionDenied = new PermissionsException(
      'Creator field read denied',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
    const campaignPermissionDenied = new PermissionsException(
      'Campaign object read denied',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
    const { service, creatorRepository, campaignRepository } = createService({
      rows: [
        row('thread-id', '2026-07-21T10:00:00.000Z', {
          creatorId: 'unreadable-creator-id',
          campaignId: 'unreadable-campaign-id',
        }),
      ],
      creatorFindError: creatorPermissionDenied,
      campaignFindError: campaignPermissionDenied,
    });

    await expect(service.listThreads(listInput())).resolves.toMatchObject({
      edges: [
        {
          node: {
            id: 'thread-id',
            creator: null,
            campaign: null,
          },
        },
      ],
    });
    expect(creatorRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
    expect(campaignRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
  });

  it('uses role-scoped repositories and rejects unreadable relation filter ids', async () => {
    const campaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';
    const { service, globalWorkspaceOrmManager } = createService({
      campaignFilterRecord: null,
    });

    await expect(
      service.listThreads(listInput({ campaignId })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'messageThread',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaign',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'workspaceMember',
      rolePermissionConfig,
    );
  });

  it.each([
    ['apiKey', { type: 'apiKey', workspace, apiKey: { id: 'api-key-id' } }],
    [
      'application',
      { type: 'application', workspace, application: { id: 'application-id' } },
    ],
    ['system', { type: 'system', workspace }],
    [
      'missing user',
      {
        type: 'user',
        workspace,
        userWorkspaceId,
        workspaceMemberId,
        workspaceMember: { id: workspaceMemberId },
      },
    ],
  ])(
    'rejects %s auth before querying the Inbox',
    async (_label, authContext) => {
      const { service, globalWorkspaceOrmManager } = createService();

      await expect(
        service.listThreads(
          listInput({
            authContext: authContext as unknown as WorkspaceAuthContext,
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    },
  );

  it('rejects user auth whose workspace or member does not match resolver context', async () => {
    const { service } = createService();

    await expect(
      service.listThreads(
        listInput({
          authContext: {
            ...userAuthContext,
            workspace: { id: 'foreign-workspace-id' },
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.listThreads(
        listInput({
          authContext: {
            ...userAuthContext,
            workspaceMemberId: 'foreign-member-id',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('loads one exact policy-visible thread summary for mutation responses', async () => {
    const { service, calls } = createService({
      rows: [row(tiedThreadAId, '2026-07-21T10:00:00.000Z')],
    });

    await expect(
      service.getThreadSummary({
        ...listInput(),
        threadId: tiedThreadAId,
      }),
    ).resolves.toMatchObject({
      id: tiedThreadAId,
      subject: `subject-${tiedThreadAId}`,
    });
    expect(allWhereSql(calls)).toContain('message_thread.id = :threadId');
    expect(calls.limit).toBe(2);
  });

  it('loads full chronological native history for proposal context without a page-size limit', async () => {
    const {
      service,
      historyCalls,
      globalWorkspaceOrmManager,
      visibilityPolicy,
    } = createService({
      rows: [row(tiedThreadAId, '2026-07-21T10:00:00.000Z')],
      historyRows: [
        {
          id: '20202020-0b5c-4178-bed7-d371f6411ea5',
          receivedAt: '2026-07-21T09:00:00.000Z',
          subject: 'Partnership',
          text: 'Can we launch Tuesday?',
        },
        {
          id: '20202020-0b5c-4178-bed7-d371f6411ea6',
          receivedAt: '2026-07-21T10:00:00.000Z',
          subject: 'Re: Partnership',
          text: 'The launch date works.',
        },
      ],
      messageParticipantRecords: [
        {
          id: '20202020-0b5c-4178-bed7-d371f6411ea7',
          messageId: '20202020-0b5c-4178-bed7-d371f6411ea5',
          displayName: 'creator@example.com',
          handle: 'creator@example.com',
          person: null,
        },
        {
          id: '20202020-0b5c-4178-bed7-d371f6411ea8',
          messageId: '20202020-0b5c-4178-bed7-d371f6411ea6',
          displayName: 'operator@example.com',
          handle: 'operator@example.com',
          person: null,
        },
      ],
    });
    await expect(
      new MyahInboxReplyBriefingService(
        service,
        globalWorkspaceOrmManager as never,
        visibilityPolicy as never,
      ).loadReplyBriefing({
        ...listInput(),
        threadId: tiedThreadAId,
      }),
    ).resolves.toMatchObject({
      thread: { id: tiedThreadAId },
      history: [
        {
          sender: 'creator@example.com',
          text: 'Can we launch Tuesday?',
        },
        {
          sender: 'operator@example.com',
          text: 'The launch date works.',
        },
      ],
    });

    const historyWhereSql = allWhereSql(historyCalls);

    expect(historyWhereSql).toContain('message."messageThreadId" = :threadId');
    expect(historyWhereSql).toContain(
      `${historyVisibilityExpression} = :messageVisibilityFull`,
    );
    expect(historyWhereSql).toContain(
      'inboxChannel.type IN (:...inboxEmailChannelTypes)',
    );
    expect(historyWhereSql).not.toContain(':messageVisibilitySubject');
    expect(historyWhereSql).not.toContain(':messageVisibilityMetadata');
    expect(historyCalls.operations.indexOf('where')).toBeLessThan(
      historyCalls.operations.indexOf('order'),
    );
    expect(historyCalls.operations).not.toContain('limit');
    expect(historyCalls.limit).toBeUndefined();
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'message',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'creator',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaign',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaignCreator',
      rolePermissionConfig,
    );
  });

  it('enters proposal/tool thread reads with the real caller user auth context, never system auth', async () => {
    const { service, globalWorkspaceOrmManager } = createService({
      rows: [row(tiedThreadAId, '2026-07-21T10:00:00.000Z')],
    });

    await service.getThreadSummary({
      ...listInput(),
      threadId: tiedThreadAId,
    });

    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), userAuthContext);
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext.mock.calls.some(
        (call) => (call[1] as { type?: string } | undefined)?.type === 'system',
      ),
    ).toBe(false);
  });

  it('fails closed when an exact thread has no policy-visible native message', async () => {
    const { service } = createService();

    await expect(
      service.getThreadSummary({
        ...listInput(),
        threadId: tiedThreadAId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
