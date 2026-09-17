import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignActivityReaderService } from 'src/modules/campaign-execution/services/campaign-activity-reader.service';

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

const ids = {
  workspace: '11111111-1111-4111-8111-111111111111',
  campaign: '22222222-2222-4222-8222-222222222222',
  campaignCreatorA: '33333333-3333-4333-8333-333333333331',
  campaignCreatorB: '33333333-3333-4333-8333-333333333332',
  campaignCreatorC: '33333333-3333-4333-8333-333333333333',
  creatorA: '44444444-4444-4444-8444-444444444441',
  creatorB: '44444444-4444-4444-8444-444444444442',
  creatorC: '44444444-4444-4444-8444-444444444443',
  message: '55555555-5555-4555-8555-555555555555',
  thread: '66666666-6666-4666-8666-666666666666',
};

const authContext = {
  workspace: { id: ids.workspace },
} as WorkspaceAuthContext;

describe('CampaignActivityReaderService', () => {
  it('returns stable attention-first pages from Campaign-linked facts and keeps unavailable facts explicit', async () => {
    const campaignRepository = {
      findOne: jest.fn().mockResolvedValue({ id: ids.campaign }),
    };
    const campaignCreatorRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: ids.campaignCreatorA,
          creatorId: ids.creatorA,
          campaignId: ids.campaign,
          stage: 'READY',
          excludedAt: null,
          exclusionReason: null,
          outcomeSummary: null,
        },
        {
          id: ids.campaignCreatorB,
          creatorId: ids.creatorB,
          campaignId: ids.campaign,
          stage: 'CONTACTED',
          excludedAt: null,
          exclusionReason: null,
          outcomeSummary: null,
        },
        {
          id: ids.campaignCreatorC,
          creatorId: ids.creatorC,
          campaignId: ids.campaign,
          stage: 'CUSTOM_STAGE',
          excludedAt: null,
          exclusionReason: null,
          outcomeSummary: null,
        },
      ]),
    };
    const readableCreatorRepository = {
      find: jest.fn().mockResolvedValue([
        { id: ids.creatorA, name: 'Zed' },
        { id: ids.creatorB, name: 'Amy' },
        { id: ids.creatorC, name: 'Ben' },
      ]),
    };
    const messageRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: ids.message, messageThreadId: ids.thread }]),
    };
    const timelineRepository = { find: jest.fn().mockResolvedValue([]) };
    const campaignEnrollments = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'enrollment-a',
          campaignCreatorId: ids.campaignCreatorA,
          holdReason: null,
        },
        {
          id: 'enrollment-b',
          campaignCreatorId: ids.campaignCreatorB,
          holdReason: 'SENDER_NOT_READY',
        },
      ]),
    };
    const campaignOccurrences = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'occurrence-a',
          enrollmentId: 'enrollment-a',
          holdReason: null,
          state: 'PENDING',
          dueAt: new Date('2026-09-18T12:00:00.000Z'),
        },
        {
          id: 'occurrence-b',
          enrollmentId: 'enrollment-b',
          holdReason: 'SENDER_NOT_READY',
          state: 'HELD',
          dueAt: new Date('2026-09-19T12:00:00.000Z'),
        },
      ]),
    };
    const outboundAttempts = {
      find: jest.fn().mockResolvedValue([
        {
          attemptId: 'attempt-processing',
          enrollmentId: 'enrollment-a',
          attemptState: 'PROCESSING',
          updatedAt: new Date('2026-09-17T13:00:00.000Z'),
          providerAcceptedAt: null,
          projectedMessageId: null,
          projectedMessageThreadId: null,
        },
        {
          attemptId: 'attempt-accepted',
          enrollmentId: 'enrollment-a',
          attemptState: 'ACCEPTED',
          updatedAt: new Date('2026-09-17T12:00:00.000Z'),
          providerAcceptedAt: new Date('2026-09-17T12:00:00.000Z'),
          projectedMessageId: ids.message,
          projectedMessageThreadId: ids.thread,
        },
      ]),
    };
    const orm = {
      executeInWorkspaceContext: jest.fn(async (operation) => operation()),
      getRepository: jest.fn(async (_workspaceId, objectName) =>
        objectName === 'campaign'
          ? campaignRepository
          : objectName === 'campaignCreator'
            ? campaignCreatorRepository
            : objectName === 'creator'
              ? readableCreatorRepository
              : objectName === 'timelineActivity'
                ? timelineRepository
                : messageRepository,
      ),
    } as unknown as GlobalWorkspaceOrmManager;
    const visibility = {
      applyMessagesVisibility: jest.fn(async (messages) => messages),
    };
    const metadataCache = {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
        flatFieldMetadataMaps: {
          byUniversalIdentifier: {
            [MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage
              .universalIdentifier]: {
              options: [
                { value: 'READY', label: 'Workspace ready' },
                { value: 'CONTACTED', label: 'Workspace contacted' },
              ],
            },
          },
        },
      }),
    };
    const service = new CampaignActivityReaderService(
      orm,
      visibility as never,
      metadataCache as never,
      campaignEnrollments as never,
      campaignOccurrences as never,
      outboundAttempts as never,
    );

    const firstPage = await service.read({
      campaignId: ids.campaign,
      first: 2,
      authContext,
    });

    expect(
      firstPage.nodes.map(({ campaignCreatorId }) => campaignCreatorId),
    ).toEqual([ids.campaignCreatorB, ids.campaignCreatorA]);
    expect(firstPage.nodes[0]).toEqual(
      expect.objectContaining({
        reason: 'SENDER_NOT_READY',
        needsAttention: true,
        creatorName: 'Amy',
        stageLabel: 'Workspace contacted',
        latestOutbound: null,
      }),
    );
    expect(firstPage.nodes[1]).toEqual(
      expect.objectContaining({
        stageLabel: 'Workspace ready',
        currentAttemptState: 'PROCESSING',
        mayStillSend: true,
        latestOutbound: expect.objectContaining({
          id: ids.message,
          threadId: ids.thread,
          state: 'ACCEPTED',
        }),
      }),
    );
    expect(firstPage.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: expect.any(String),
    });
    const secondPage = await service.read({
      campaignId: ids.campaign,
      first: 2,
      after: firstPage.pageInfo.endCursor as string,
      authContext,
    });
    expect(
      secondPage.nodes.map(({ campaignCreatorId }) => campaignCreatorId),
    ).toEqual([ids.campaignCreatorC]);
    expect(secondPage.nodes[0]).toEqual(
      expect.objectContaining({
        latestInbound: null,
        latestOutbound: null,
        plannedAt: null,
        stage: 'CUSTOM_STAGE',
        stageLabel: 'CUSTOM_STAGE',
        inboxThreadId: null,
      }),
    );
    expect(campaignEnrollments.find).toHaveBeenCalledWith(
      ids.workspace,
      expect.objectContaining({
        where: expect.objectContaining({ campaignId: ids.campaign }),
      }),
    );
    expect(timelineRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: 'campaign.replied' }),
      }),
    );

    visibility.applyMessagesVisibility.mockImplementationOnce(
      async (messages: unknown[]) => {
        messages.splice(0, messages.length);
        return messages;
      },
    );
    const revoked = await service.read({
      campaignId: ids.campaign,
      first: 3,
      authContext,
    });
    const revokedRow = revoked.nodes.find(
      ({ campaignCreatorId }) => campaignCreatorId === ids.campaignCreatorA,
    );
    expect(revokedRow).toEqual(
      expect.objectContaining({
        latestOutbound: null,
        inboxContactId: null,
        inboxThreadId: null,
      }),
    );
  });

  it('fails closed when the Campaign itself is not readable', async () => {
    const orm = {
      executeInWorkspaceContext: jest.fn(async (operation) => operation()),
      getRepository: jest.fn().mockResolvedValue({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    } as unknown as GlobalWorkspaceOrmManager;

    await expect(
      new CampaignActivityReaderService(
        orm,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ).read({
        campaignId: ids.campaign,
        first: 25,
        authContext,
      }),
    ).rejects.toThrow('Campaign is not readable');
  });
});
