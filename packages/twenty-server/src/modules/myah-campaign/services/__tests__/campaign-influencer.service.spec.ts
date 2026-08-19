import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

const campaignId = '11111111-1111-4111-8111-111111111111';
const listOneId = '22222222-2222-4222-8222-222222222222';
const listTwoId = '33333333-3333-4333-8333-333333333333';
const creatorOneId = '44444444-4444-4444-8444-444444444444';
const creatorTwoId = '55555555-5555-4555-8555-555555555555';
const creatorThreeId = '66666666-6666-4666-8666-666666666666';
const authContext = {
  type: 'system',
  workspace: { id: 'workspace-1' },
} as never;
const workspaceContext = {
  authContext,
  userWorkspaceRoleMap: {},
  apiKeyRoleMap: {},
} as unknown as ORMWorkspaceContext;

type Row = {
  id: string;
  campaignId?: string;
  creatorId?: string;
  creatorListId?: string;
  campaignCreatorId?: string;
  isDirectlyAdded?: boolean;
  deletedAt?: string;
};

const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(
    ([key, value]) => row[key as keyof Row] === value,
  );
type TestRepository = {
  find: jest.Mock;
  findOne: jest.Mock;
  exists: jest.Mock;
  upsert: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
};

const createRepository = (rows: Row[]) => ({
  find: jest.fn(
    async ({
      where,
      withDeleted = false,
    }: {
      where?: Record<string, unknown> | Record<string, unknown>[];
      withDeleted?: boolean;
    } = {}) =>
      rows.filter(
        (row) =>
          (withDeleted || !row.deletedAt) &&
          (!where ||
            (Array.isArray(where)
              ? where.some((item) => matches(row, item))
              : matches(row, where))),
      ),
  ),
  findOne: jest.fn(
    async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => !row.deletedAt && matches(row, where)) ?? null,
  ),
  exists: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
    rows.some((row) => !row.deletedAt && matches(row, where)),
  ),
  upsert: jest.fn(
    async (
      input: Row | Row[],
      { conflictPaths }: { conflictPaths: (keyof Row)[] },
    ) => {
      for (const item of Array.isArray(input) ? input : [input]) {
        const existing = rows.find(
          (row) =>
            !row.deletedAt &&
            conflictPaths.every((key) => row[key] === item[key]),
        );
        if (existing) Object.assign(existing, item);
        else rows.push({ ...item });
      }
    },
  ),
  softDelete: jest.fn(async (where: Record<string, unknown>) => {
    for (const row of rows) if (matches(row, where)) row.deletedAt = 'deleted';
  }),
  restore: jest.fn(async (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (row) row.deletedAt = undefined;
  }),
});

const createHarness = (
  seed: Partial<Record<string, Row[]>> = {},
  {
    testWorkspaceContext = workspaceContext,
    callerVisibleRows = {},
  }: {
    testWorkspaceContext?: ORMWorkspaceContext;
    callerVisibleRows?: Partial<Record<string, Row[]>>;
  } = {},
) => {
  const rows = {
    campaign: [{ id: campaignId }, ...(seed.campaign ?? [])],
    creator: [
      { id: creatorOneId },
      { id: creatorTwoId },
      { id: creatorThreeId },
      ...(seed.creator ?? []),
    ],
    creatorList: [
      { id: listOneId },
      { id: listTwoId },
      ...(seed.creatorList ?? []),
    ],
    campaignCreator: seed.campaignCreator ?? [],
    campaignCreatorList: seed.campaignCreatorList ?? [],
    campaignCreatorListSource: seed.campaignCreatorListSource ?? [],
    creatorListMember: seed.creatorListMember ?? [],
  };
  const repositories = Object.fromEntries(
    Object.entries(rows).map(([name, values]) => [
      name,
      createRepository(values),
    ]),
  ) as Record<string, TestRepository>;
  const callerScopedRepositories = Object.fromEntries(
    Object.entries(rows).map(([name, values]) => [
      name,
      createRepository(callerVisibleRows[name] ?? values),
    ]),
  ) as Record<string, TestRepository>;
  const transactionManager = { id: 'transaction-manager' };
  const manager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      withWorkspaceContext(testWorkspaceContext, callback),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
      transaction: jest.fn(
        async (callback: (transaction: unknown) => unknown) =>
          callback(transactionManager),
      ),
    }),
    getRepository: jest.fn(
      async (
        _workspaceId: string,
        name: string,
        options: { shouldBypassPermissionChecks?: boolean },
      ) =>
        options.shouldBypassPermissionChecks
          ? repositories[name]
          : callerScopedRepositories[name],
    ),
  } as unknown as GlobalWorkspaceOrmManager;
  return {
    rows,
    repositories,
    transactionManager,
    service: new CampaignInfluencerService(manager),
  };
};

describe('CampaignInfluencerService retained List admissions', () => {
  it('snapshots source pairs and deduplicates overlapping List members', async () => {
    const harness = createHarness({
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorOneId },
        { id: 'member-2', creatorListId: listOneId, creatorId: creatorTwoId },
        { id: 'member-3', creatorListId: listTwoId, creatorId: creatorOneId },
      ],
    });

    await harness.service.attachCampaignCreatorLists(
      { campaignId, creatorListIds: [listOneId, listTwoId] },
      authContext,
    );

    expect(harness.rows.campaignCreator).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
        }),
        expect.objectContaining({
          campaignId,
          creatorId: creatorTwoId,
          isDirectlyAdded: false,
        }),
      ]),
    );
    expect(
      harness.rows.campaignCreator.filter(
        (row) => row.creatorId === creatorOneId,
      ),
    ).toHaveLength(1);
    expect(
      harness.rows.campaignCreatorListSource.map(
        ({ campaignCreatorId, creatorListId }) => [
          campaignCreatorId,
          creatorListId,
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        [
          harness.rows.campaignCreator.find(
            (row) => row.creatorId === creatorOneId,
          )?.id,
          listOneId,
        ],
        [
          harness.rows.campaignCreator.find(
            (row) => row.creatorId === creatorOneId,
          )?.id,
          listTwoId,
        ],
        [
          harness.rows.campaignCreator.find(
            (row) => row.creatorId === creatorTwoId,
          )?.id,
          listOneId,
        ],
      ]),
    );
  });

  it('keeps later List members out of Campaigns until their current candidacy is approved', async () => {
    const harness = createHarness({
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      campaignCreator: [
        {
          id: 'creator-row-1',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
        },
      ],
      campaignCreatorListSource: [
        {
          id: 'source-1',
          campaignCreatorId: 'creator-row-1',
          creatorListId: listOneId,
        },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorOneId },
      ],
    });

    await harness.service.addCreatorListMemberIntent(
      { creatorListId: listOneId, creatorId: creatorTwoId },
      authContext,
    );

    expect(harness.rows.campaignCreator).not.toContainEqual(
      expect.objectContaining({ creatorId: creatorTwoId }),
    );
    await expect(
      harness.service.campaignCreatorListAdditionCandidates(
        { campaignId, creatorListId: listOneId },
        authContext,
      ),
    ).resolves.toEqual({ creatorIds: [creatorTwoId] });
    await harness.service.approveCampaignCreatorListAdditions(
      { campaignId, creatorListId: listOneId, creatorIds: [creatorTwoId] },
      authContext,
    );
    expect(harness.rows.campaignCreator).toContainEqual(
      expect.objectContaining({ campaignId, creatorId: creatorTwoId }),
    );
    expect(harness.rows.campaignCreatorListSource).toContainEqual(
      expect.objectContaining({ creatorListId: listOneId }),
    );
  });

  it('locks the Creator List while approving additions', async () => {
    const harness = createHarness({
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorTwoId },
      ],
    });

    await harness.service.approveCampaignCreatorListAdditions(
      { campaignId, creatorListId: listOneId, creatorIds: [creatorTwoId] },
      authContext,
    );

    expect(harness.repositories.creatorList.findOne).toHaveBeenCalledWith(
      {
        where: { id: listOneId },
        lock: { mode: 'pessimistic_write' },
      },
      harness.transactionManager,
    );
  });

  it('does not admit a candidate when the List is detached during approval', async () => {
    const harness = createHarness({
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorTwoId },
      ],
    });
    const originalFindOne = harness.repositories.campaignCreatorList.findOne;
    let attachmentLookups = 0;
    harness.repositories.campaignCreatorList.findOne = jest.fn(
      async (options, manager) => {
        attachmentLookups += 1;
        if (attachmentLookups === 2) {
          harness.rows.campaignCreatorList.length = 0;
        }
        return originalFindOne(options, manager);
      },
    );

    await expect(
      harness.service.approveCampaignCreatorListAdditions(
        { campaignId, creatorListId: listOneId, creatorIds: [creatorTwoId] },
        authContext,
      ),
    ).rejects.toThrow('Campaign Creator List attachment not found');

    expect(harness.rows.campaignCreator).not.toContainEqual(
      expect.objectContaining({ campaignId, creatorId: creatorTwoId }),
    );
  });
  it('approves and detaches Campaign List sources without Creator List update permission', async () => {
    const campaignOperatorAuthContext = {
      type: 'user',
      workspace: { id: 'workspace-1' },
      userWorkspaceId: 'user-workspace-1',
    } as never;
    const campaignOperatorWorkspaceContext = {
      authContext: campaignOperatorAuthContext,
      userWorkspaceRoleMap: { 'user-workspace-1': 'role-1' },
      apiKeyRoleMap: {},
      objectIdByNameSingular: {
        campaign: 'campaign-object',
        creatorList: 'creator-list-object',
      },
      permissionsPerRoleId: {
        'role-1': {
          'campaign-object': { canUpdateObjectRecords: true },
          'creator-list-object': { canReadObjectRecords: true },
        },
      },
    } as unknown as ORMWorkspaceContext;
    const harness = createHarness(
      {
        campaignCreatorList: [
          { id: 'attachment-1', campaignId, creatorListId: listOneId },
        ],
        creatorListMember: [
          {
            id: 'member-1',
            creatorListId: listOneId,
            creatorId: creatorTwoId,
          },
        ],
      },
      { testWorkspaceContext: campaignOperatorWorkspaceContext },
    );

    await expect(
      harness.service.approveCampaignCreatorListAdditions(
        { campaignId, creatorListId: listOneId, creatorIds: [creatorTwoId] },
        campaignOperatorAuthContext,
      ),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.detachCampaignCreatorList(
        { campaignId, creatorListId: listOneId },
        campaignOperatorAuthContext,
      ),
    ).resolves.toEqual({
      campaignCreators: expect.any(Array),
      campaignCreatorLists: [],
    });
  });

  it('rejects stale, not-member, invalid, or inaccessible candidates without admitting them', async () => {
    const harness = createHarness({
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorTwoId },
      ],
    });

    await harness.service.removeCreatorListMemberIntent(
      { creatorListId: listOneId, creatorId: creatorTwoId },
      authContext,
    );
    await expect(
      harness.service.approveCampaignCreatorListAdditions(
        { campaignId, creatorListId: listOneId, creatorIds: [creatorTwoId] },
        authContext,
      ),
    ).rejects.toThrow('Creator is not an eligible List addition candidate');
    await expect(
      harness.service.campaignCreatorListAdditionCandidates(
        { campaignId: 'not-a-uuid', creatorListId: listOneId },
        authContext,
      ),
    ).rejects.toThrow('UUID');
    await expect(
      harness.service.campaignCreatorListAdditionCandidates(
        {
          campaignId: '77777777-7777-4777-8777-777777777777',
          creatorListId: listOneId,
        },
        authContext,
      ),
    ).rejects.toThrow('Campaign not found');
    const inaccessibleCreator = createHarness({
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      creatorListMember: [
        {
          id: 'member-2',
          creatorListId: listOneId,
          creatorId: '88888888-8888-4888-8888-888888888888',
        },
      ],
    });
    await expect(
      inaccessibleCreator.service.campaignCreatorListAdditionCandidates(
        { campaignId, creatorListId: listOneId },
        authContext,
      ),
    ).rejects.toThrow('Creator not found');
    expect(harness.rows.campaignCreator).toHaveLength(0);
  });

  it('does not bypass caller visibility when removing a List member', async () => {
    const callerAuthContext = {
      type: 'user',
      workspace: { id: 'workspace-1' },
      userWorkspaceId: 'user-workspace-1',
    } as never;
    const callerWorkspaceContext = {
      authContext: callerAuthContext,
      userWorkspaceRoleMap: { 'user-workspace-1': 'role-1' },
      apiKeyRoleMap: {},
      objectIdByNameSingular: { creatorList: 'creator-list-object' },
      permissionsPerRoleId: {
        'role-1': {
          'creator-list-object': { canUpdateObjectRecords: true },
        },
      },
    } as unknown as ORMWorkspaceContext;
    const member = {
      id: 'member-1',
      creatorListId: listOneId,
      creatorId: creatorOneId,
    };
    const inaccessibleCreator = createHarness(
      { creatorListMember: [member] },
      {
        testWorkspaceContext: callerWorkspaceContext,
        callerVisibleRows: { creator: [], creatorListMember: [] },
      },
    );
    const inaccessibleMembership = createHarness(
      { creatorListMember: [member] },
      {
        testWorkspaceContext: callerWorkspaceContext,
        callerVisibleRows: { creatorListMember: [] },
      },
    );

    await expect(
      inaccessibleCreator.service.removeCreatorListMemberIntent(
        { creatorListId: listOneId, creatorId: creatorOneId },
        callerAuthContext,
      ),
    ).rejects.toThrow('Creator not found');
    await expect(
      inaccessibleMembership.service.removeCreatorListMemberIntent(
        { creatorListId: listOneId, creatorId: creatorOneId },
        callerAuthContext,
      ),
    ).rejects.toThrow('Creator list membership not found');
    expect(inaccessibleCreator.rows.creatorListMember).toEqual([member]);
    expect(inaccessibleMembership.rows.creatorListMember).toEqual([member]);
  });

  it('does not alter retained Creators, Direct, or List sources when a member leaves or a List detaches', async () => {
    const harness = createHarness({
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      campaignCreator: [
        {
          id: 'creator-row-1',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
        },
      ],
      campaignCreatorListSource: [
        {
          id: 'source-1',
          campaignCreatorId: 'creator-row-1',
          creatorListId: listOneId,
        },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorOneId },
      ],
    });

    await harness.service.addDirectCampaignCreators(
      { campaignId, creatorIds: [creatorOneId] },
      authContext,
    );
    await harness.service.removeCreatorListMemberIntent(
      { creatorListId: listOneId, creatorId: creatorOneId },
      authContext,
    );
    await harness.service.detachCampaignCreatorList(
      { campaignId, creatorListId: listOneId },
      authContext,
    );

    expect(harness.rows.campaignCreator).toContainEqual(
      expect.objectContaining({ id: 'creator-row-1', isDirectlyAdded: true }),
    );
    expect(harness.rows.campaignCreatorListSource).toEqual([
      {
        id: 'source-1',
        campaignCreatorId: 'creator-row-1',
        creatorListId: listOneId,
      },
    ]);
  });

  it('restores a soft-deleted Campaign Creator for direct re-addition', async () => {
    const harness = createHarness({
      campaignCreator: [
        {
          id: 'creator-row-1',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
          deletedAt: 'deleted',
        },
      ],
    });

    await harness.service.addDirectCampaignCreators(
      { campaignId, creatorIds: [creatorOneId] },
      authContext,
    );

    expect(harness.rows.campaignCreator).toHaveLength(1);
    expect(harness.rows.campaignCreator).toContainEqual({
      id: 'creator-row-1',
      campaignId,
      creatorId: creatorOneId,
      isDirectlyAdded: true,
    });
  });

  it('restores a soft-deleted Campaign Creator for an approved List addition', async () => {
    const harness = createHarness({
      campaignCreator: [
        {
          id: 'creator-row-1',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
          deletedAt: 'deleted',
        },
      ],
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorOneId },
      ],
    });

    await harness.service.approveCampaignCreatorListAdditions(
      { campaignId, creatorListId: listOneId, creatorIds: [creatorOneId] },
      authContext,
    );

    expect(harness.rows.campaignCreator).toHaveLength(1);
    expect(harness.rows.campaignCreator).toContainEqual({
      id: 'creator-row-1',
      campaignId,
      creatorId: creatorOneId,
      isDirectlyAdded: false,
    });
  });

  it('does not restore a deleted duplicate when an active Creator exists', async () => {
    const harness = createHarness({
      campaignCreator: [
        {
          id: 'creator-row-active',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
        },
        {
          id: 'creator-row-deleted',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
          deletedAt: 'deleted',
        },
      ],
      campaignCreatorList: [
        { id: 'attachment-1', campaignId, creatorListId: listOneId },
      ],
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorOneId },
      ],
    });

    await harness.service.approveCampaignCreatorListAdditions(
      { campaignId, creatorListId: listOneId, creatorIds: [creatorOneId] },
      authContext,
    );

    expect(harness.repositories.campaignCreator.restore).not.toHaveBeenCalled();
    expect(harness.rows.campaignCreator).toContainEqual(
      expect.objectContaining({
        id: 'creator-row-deleted',
        deletedAt: 'deleted',
      }),
    );
  });

  it('restores only one deleted duplicate for direct re-addition', async () => {
    const harness = createHarness({
      campaignCreator: [
        {
          id: 'creator-row-a',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
          deletedAt: 'deleted',
        },
        {
          id: 'creator-row-b',
          campaignId,
          creatorId: creatorOneId,
          isDirectlyAdded: false,
          deletedAt: 'deleted',
        },
      ],
    });

    await harness.service.addDirectCampaignCreators(
      { campaignId, creatorIds: [creatorOneId] },
      authContext,
    );

    expect(harness.repositories.campaignCreator.restore).toHaveBeenCalledWith(
      'creator-row-a',
      harness.transactionManager,
    );
    expect(harness.rows.campaignCreator).toContainEqual(
      expect.objectContaining({ id: 'creator-row-b', deletedAt: 'deleted' }),
    );
  });

  it('re-reads once after a dependent Creator write conflict', async () => {
    const harness = createHarness({
      creatorListMember: [
        { id: 'member-1', creatorListId: listOneId, creatorId: creatorOneId },
      ],
    });
    const creators = harness.repositories.campaignCreator;
    creators.upsert.mockImplementationOnce(async () => {
      harness.rows.campaignCreator.push({
        id: 'creator-row-1',
        campaignId,
        creatorId: creatorOneId,
        isDirectlyAdded: false,
      });
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });

    await expect(
      harness.service.attachCampaignCreatorLists(
        { campaignId, creatorListIds: [listOneId] },
        authContext,
      ),
    ).resolves.toBeDefined();
    expect(harness.rows.campaignCreator).toHaveLength(1);
    expect(harness.rows.campaignCreatorListSource).toContainEqual(
      expect.objectContaining({
        campaignCreatorId: 'creator-row-1',
        creatorListId: listOneId,
      }),
    );
  });
});
