import { validate } from 'class-validator';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import {
  CampaignMessageOverviewInput,
  CampaignMessageOverviewView,
} from 'src/modules/campaign-execution/dtos/campaign-message-overview.dto';
import { CampaignMessageOverviewReaderService } from 'src/modules/campaign-execution/services/campaign-message-overview-reader.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: () => ({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    }),
  }),
);
jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({ resolveRolePermissionConfig: () => ({ objectPermissions: {} }) }),
);

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const secondCampaignId = '22222222-2222-4222-8222-222222222223';
const campaignCreatorId = '33333333-3333-4333-8333-333333333333';
const creatorId = '44444444-4444-4444-8444-444444444444';
const occurrenceId = '55555555-5555-4555-8555-555555555555';
const generationId = '66666666-6666-4666-8666-666666666666';
const workflowVersionId = '77777777-7777-4777-8777-777777777777';
const messageId = '88888888-8888-4888-8888-888888888888';

const authContext = {
  type: 'system',
  workspace: { id: workspaceId },
} as WorkspaceAuthContext;

const makeOrm = (messageThreadFind = jest.fn().mockResolvedValue([])) => {
  const repositories = {
    campaign: {
      find: jest.fn().mockResolvedValue([{ id: campaignId, name: 'Launch' }]),
    },
    campaignCreator: {
      find: jest
        .fn()
        .mockResolvedValue([{ id: campaignCreatorId, campaignId, creatorId }]),
    },
    creator: {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: creatorId, name: 'Ada', email: 'ada@example.com' },
        ]),
    },
    messageThread: { find: messageThreadFind },
    message: { find: jest.fn().mockResolvedValue([]) },
  };

  return {
    executeInWorkspaceContext: jest.fn((callback) => callback()),
    getRepository: jest.fn((_workspaceId, name: keyof typeof repositories) =>
      Promise.resolve(repositories[name]),
    ),
  };
};

const makeDataSource = (query: ReturnType<typeof jest.fn>) => ({
  transaction: (callback: (value: { query: typeof query }) => unknown) =>
    callback({
      query: ((sql: string, ...args: unknown[]) =>
        sql.startsWith('SELECT set_config(')
          ? Promise.resolve([])
          : query(sql, ...args)) as typeof query,
    }),
});

const makeSequences = () => ({
  loadEmailByVersion: jest.fn().mockResolvedValue({
    body: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi Ada, this is the scheduled message.' },
          ],
        },
      ],
    }),
    subject: 'Scheduled partnership',
  }),
});

describe('CampaignMessageOverviewReaderService', () => {
  it('rejects malformed UUID filters and dates before they reach SQL', async () => {
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      campaignIds: ['not-a-uuid'],
      dateFrom: 'not-a-date',
    });

    await expect(validate(filters)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'campaignIds' }),
        expect.objectContaining({ property: 'dateFrom' }),
      ]),
    );
  });

  it('keeps readable queued rows without forecasts and exposes generation state', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          complete: false,
          currentGenerationId: generationId,
          generatedAt: new Date('2026-09-21T09:00:00.000Z'),
          horizonEndsAt: new Date('2026-09-23T09:00:00.000Z'),
          inputRevision: '8',
          generationRevision: '7',
        },
      ])
      .mockResolvedValueOnce([
        {
          attemptState: null,
          campaignCreatorId,
          campaignId,
          connectedAccountId: null,
          creatorId,
          dueAt: new Date('2026-09-25T10:00:00.000Z'),
          estimatedSendAt: null,
          holdReason: null,
          messageId,
          occurrenceId,
          occurrenceState: 'PENDING',
          projectedMessageThreadId: null,
          providerAcceptedAt: null,
          safeOutcomeReason: null,
          sortAt: new Date('2026-09-25T10:00:00.000Z'),
          workflowVersionId,
        },
      ]);
    const service = new CampaignMessageOverviewReaderService(
      makeOrm() as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      first: 50,
      view: CampaignMessageOverviewView.SCHEDULED,
    });

    await expect(service.read({ authContext, filters })).resolves.toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            campaignName: 'Launch',
            creatorName: 'Ada',
            estimatedSendAt: null,
            occurrenceId,
            preview: null,
            recipient: null,
            status: 'SCHEDULED',
            subject: null,
          }),
        ],
        pageInfo: expect.objectContaining({
          forecastComplete: false,
          generationId,
          refreshing: true,
        }),
      }),
    );
    expect(query.mock.calls[1][0]).toContain('LIMIT $11');
    expect(query.mock.calls[1][0]).toContain(
      "IN ('CANCELLED','SKIPPED') THEN 'CANCELLED'",
    );
    expect(query.mock.calls[1][1][5]).toEqual(['SCHEDULED']);
    expect(query.mock.calls[1][1][10]).toBe(51);
  });

  it('retains all permitted Campaign options when selected Campaign A has no readable memberships', async () => {
    const orm = makeOrm();
    const campaignRepository = await orm.getRepository(workspaceId, 'campaign');
    const campaignCreatorRepository = await orm.getRepository(
      workspaceId,
      'campaignCreator',
    );
    campaignRepository.find.mockResolvedValue([
      { id: campaignId, name: 'Launch' },
      { id: secondCampaignId, name: 'Follow-up' },
    ]);
    campaignCreatorRepository.find.mockResolvedValue([]);
    const query = jest.fn();
    const service = new CampaignMessageOverviewReaderService(
      orm as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      campaignIds: [campaignId],
    });

    await expect(service.read({ authContext, filters })).resolves.toEqual(
      expect.objectContaining({
        filterOptions: expect.objectContaining({
          campaigns: [
            { id: campaignId, name: 'Launch' },
            { id: secondCampaignId, name: 'Follow-up' },
          ],
        }),
      }),
    );
    expect(campaignCreatorRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: expect.anything() } }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('classifies a SUCCEEDED occurrence without accepted evidence as Needs attention in the matching filter', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attemptState: null,
          authoredMessageIndex: 0,
          campaignCreatorId,
          campaignId,
          connectedAccountId: null,
          creatorId,
          dueAt: new Date('2026-09-25T10:00:00.000Z'),
          estimatedSendAt: null,
          holdReason: null,
          messageId,
          occurrenceId,
          occurrenceState: 'SUCCEEDED',
          projectedMessageThreadId: null,
          providerAcceptedAt: null,
          safeOutcomeReason: null,
          sortAt: new Date('2026-09-25T10:00:00.000Z'),
          workflowVersionId,
        },
      ]);
    const service = new CampaignMessageOverviewReaderService(
      makeOrm() as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      first: 50,
      view: CampaignMessageOverviewView.NEEDS_ATTENTION,
    });

    await expect(service.read({ authContext, filters })).resolves.toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            occurrenceId,
            status: 'NEEDS_ATTENTION',
          }),
        ],
      }),
    );
    expect(query.mock.calls[1][0]).toContain("o.state='SUCCEEDED'");
    expect(query.mock.calls[1][1][5]).toEqual(['NEEDS_ATTENTION']);
  });

  it('keeps accepted evidence on an IN_FLIGHT occurrence in Needs attention, not Sent', async () => {
    const acceptedAt = new Date('2026-09-21T10:00:00.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attemptState: 'ACCEPTED',
          authoredMessageIndex: 0,
          campaignCreatorId,
          campaignId,
          connectedAccountId: null,
          creatorId,
          dueAt: acceptedAt,
          estimatedSendAt: null,
          holdReason: null,
          messageId,
          occurrenceId,
          occurrenceState: 'IN_FLIGHT',
          projectedMessageThreadId: '99999999-9999-4999-8999-999999999999',
          providerAcceptedAt: acceptedAt,
          safeOutcomeReason: null,
          sortAt: acceptedAt,
          workflowVersionId,
        },
      ]);
    const service = new CampaignMessageOverviewReaderService(
      makeOrm() as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      view: CampaignMessageOverviewView.NEEDS_ATTENTION,
    });

    const result = await service.read({ authContext, filters });

    expect(result.nodes).toEqual([
      expect.objectContaining({
        occurrenceId,
        status: 'NEEDS_ATTENTION',
        needsAttention: true,
        sentAt: acceptedAt.toISOString(),
      }),
    ]);
    expect(query.mock.calls[1][1][5]).toEqual(['NEEDS_ATTENTION']);
    // The production WHERE predicate must classify this state before the accepted Sent arm.
    const sql = query.mock.calls[1][0] as string;

    expect(sql).toMatch(
      /WHEN o\.state IN \('HELD','UNKNOWN','IN_FLIGHT'\)\s+OR \(o\.state='SUCCEEDED'\s+AND \(attempt\."providerAcceptedAt" IS NULL OR attempt\."projectedMessageThreadId" IS NULL\)\)/,
    );
    expect(sql.indexOf("THEN 'NEEDS_ATTENTION'")).toBeLessThan(
      sql.indexOf("THEN 'SENT'"),
    );
  });

  it('does not expose an Inbox handoff for an unreadable projected thread', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attemptState: 'ACCEPTED',
          campaignCreatorId,
          campaignId,
          connectedAccountId: null,
          creatorId,
          dueAt: new Date('2026-09-21T10:00:00.000Z'),
          estimatedSendAt: null,
          holdReason: null,
          occurrenceId,
          occurrenceState: 'PENDING',
          projectedMessageThreadId: '77777777-7777-4777-8777-777777777777',
          providerAcceptedAt: new Date('2026-09-21T10:00:00.000Z'),
          safeOutcomeReason: null,
          sortAt: new Date('2026-09-21T10:00:00.000Z'),
        },
      ]);
    const deniedThreadRead = jest
      .fn()
      .mockRejectedValue(
        new PermissionsException(
          PermissionsExceptionMessage.PERMISSION_DENIED,
          PermissionsExceptionCode.PERMISSION_DENIED,
        ),
      );
    const service = new CampaignMessageOverviewReaderService(
      makeOrm(deniedThreadRead) as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );

    await expect(
      service.read({
        authContext,
        filters: new CampaignMessageOverviewInput(),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            inboxContactId: null,
            inboxThreadId: null,
          }),
        ],
      }),
    );
  });

  it('reads one accessible occurrence through the same scoped hydration as the list', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attemptState: null,
          authoredMessageIndex: 0,
          campaignCreatorId,
          campaignId,
          connectedAccountId: null,
          creatorId,
          dueAt: new Date('2026-09-21T10:00:00.000Z'),
          estimatedSendAt: null,
          holdReason: null,
          messageId,
          occurrenceId,
          occurrenceState: 'PENDING',
          projectedMessageThreadId: null,
          providerAcceptedAt: null,
          safeOutcomeReason: null,
          sortAt: new Date('2026-09-21T10:00:00.000Z'),
          workflowVersionId,
        },
      ]);
    const service = new CampaignMessageOverviewReaderService(
      makeOrm() as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );

    await expect(
      service.readDetail({ authContext, occurrenceId }),
    ).resolves.toEqual(
      expect.objectContaining({
        occurrenceId,
        subject: null,
        recipient: null,
      }),
    );
    expect(query.mock.calls[1][1][16]).toBe(occurrenceId);
  });

  it('returns null when the occurrence campaign is no longer readable', async () => {
    const service = new CampaignMessageOverviewReaderService(
      {
        executeInWorkspaceContext: jest.fn((callback) => callback()),
        getRepository: jest.fn().mockResolvedValue({
          find: jest.fn().mockResolvedValue([]),
        }),
      } as never,
      makeDataSource(jest.fn()) as never,
      {} as never,
      makeSequences() as never,
    );

    await expect(
      service.readDetail({ authContext, occurrenceId }),
    ).resolves.toBe(null);
  });

  it.each([
    [
      'a different workspace occurrence',
      '99999999-9999-4999-8999-999999999999',
    ],
    ['a missing occurrence', occurrenceId],
  ])(
    'returns null for %s without widening the workspace scope',
    async (_label, requestedOccurrenceId) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const service = new CampaignMessageOverviewReaderService(
        makeOrm() as never,
        makeDataSource(query) as never,
        {} as never,
        makeSequences() as never,
      );

      await expect(
        service.readDetail({
          authContext,
          occurrenceId: requestedOccurrenceId,
        }),
      ).resolves.toBe(null);
      expect(query.mock.calls[1][0]).toContain('o."workspaceId"=$1');
      expect(query.mock.calls[1][1]).toEqual(
        expect.arrayContaining([workspaceId, requestedOccurrenceId]),
      );
    },
  );

  it('rejects a cursor from an older forecast generation', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        complete: true,
        currentGenerationId: generationId,
        generatedAt: new Date('2026-09-21T09:00:00.000Z'),
        horizonEndsAt: new Date('2026-09-23T09:00:00.000Z'),
        inputRevision: '8',
        generationRevision: '8',
      },
    ]);
    const service = new CampaignMessageOverviewReaderService(
      makeOrm() as never,
      makeDataSource(query) as never,
      {} as never,
      makeSequences() as never,
    );
    const after = Buffer.from(
      JSON.stringify({
        v: 2,
        scope: 'previous-authorized-scope',
        generationId: '77777777-7777-4777-8777-777777777777',
        occurrenceId,
        sortAt: '2026-09-21T10:00:00.000Z',
      }),
    ).toString('base64url');
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      after,
    });

    await expect(service.read({ authContext, filters })).rejects.toThrow(
      'Campaign message overview changed; restart pagination',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
