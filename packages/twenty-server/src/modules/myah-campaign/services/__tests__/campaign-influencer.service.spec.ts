import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import {
  buildEffectiveCampaignCreators,
  CampaignInfluencerService,
  getCampaignListSyncChanges,
  getSourceRemovalImpact,
} from 'src/modules/myah-campaign/services/campaign-influencer.service';

describe('CampaignInfluencerService audience invariants', () => {
  it('deduplicates overlapping lists and preserves direct provenance', () => {
    expect(
      buildEffectiveCampaignCreators({
        campaignId: 'campaign-1',
        directCreatorIds: ['creator-1'],
        listMembersByListId: {
          'list-a': ['creator-1', 'creator-2'],
          'list-b': ['creator-1'],
        },
      }),
    ).toEqual([
      {
        campaignId: 'campaign-1',
        creatorId: 'creator-1',
        isDirectlyAdded: true,
        sourceListIds: ['list-a', 'list-b'],
      },
      {
        campaignId: 'campaign-1',
        creatorId: 'creator-2',
        isDirectlyAdded: false,
        sourceListIds: ['list-a'],
      },
    ]);
  });

  it('returns only new list members for explicit add-only review', () => {
    expect(
      getCampaignListSyncChanges({
        attachedListIds: ['list-a'],
        existingCreators: [
          { campaignId: 'campaign-1', creatorId: 'creator-1' },
        ],
        listMembersByListId: { 'list-a': ['creator-1', 'creator-2'] },
      }),
    ).toEqual({ additions: ['creator-2'], preserved: ['creator-1'] });
  });

  it('keeps a campaign creator when one of several sources is removed', () => {
    expect(
      buildEffectiveCampaignCreators({
        campaignId: 'campaign-1',
        directCreatorIds: ['creator-1'],
        listMembersByListId: { 'list-b': ['creator-1'] },
      }),
    ).toEqual([
      {
        campaignId: 'campaign-1',
        creatorId: 'creator-1',
        isDirectlyAdded: true,
        sourceListIds: ['list-b'],
      },
    ]);
  });
  it('requires confirmation only when a removed List was the final source', () => {
    expect(
      getSourceRemovalImpact({
        removedListId: 'list-a',
        directCreatorIds: ['creator-1'],
        listMembersByListId: {
          'list-a': ['creator-1', 'creator-2'],
          'list-b': ['creator-1'],
        },
      }),
    ).toEqual({
      affectedCreatorIds: ['creator-2'],
      requiresConfirmation: true,
    });
  });
});
describe('CampaignInfluencerService generic membership guard', () => {
  const authContext = {
    type: 'system',
    workspace: { id: 'workspace-1' },
  } as never;
  const workspaceContext = {
    authContext,
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: {},
  } as unknown as ORMWorkspaceContext;

  it.each([
    [false, 'allows generic membership writes for unattached lists'],
    [true, 'rejects generic membership writes for attached lists'],
  ])('%s', async (attached) => {
    const attachments = { exists: jest.fn().mockResolvedValue(attached) };
    const manager = {
      executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
        withWorkspaceContext(workspaceContext, callback),
      ),
      getRepository: jest.fn().mockResolvedValue(attachments),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new CampaignInfluencerService(manager);

    const mutation = service.assertGenericMembershipMutationAllowed(
      'list-1',
      authContext,
    );

    if (attached) {
      await expect(mutation).rejects.toThrow(
        'Use the creator-list membership intent for attached lists',
      );
    } else {
      await expect(mutation).resolves.toBeUndefined();
    }
    expect(attachments.exists).toHaveBeenCalledWith({
      where: { creatorListId: 'list-1' },
    });
  });
});

describe('CampaignInfluencerService membership transaction safety', () => {
  const authContext = {
    type: 'system',
    workspace: { id: 'workspace-1' },
  } as never;
  const workspaceContext = {
    authContext,
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: {},
  } as unknown as ORMWorkspaceContext;

  it('upserts and reloads a new membership on the transaction manager', async () => {
    const transactionManager = { id: 'transaction-manager' };
    const membership = {
      id: 'membership-1',
      creatorListId: 'list-1',
      creatorId: 'creator-1',
    };
    const members = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(membership),
      save: jest.fn(),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    const repositories = {
      campaign: {},
      campaignCreatorList: {
        find: jest.fn().mockResolvedValue([]),
      },
      creator: {
        findOne: jest.fn().mockResolvedValue({ id: 'creator-1' }),
      },
      creatorList: {
        findOne: jest.fn().mockResolvedValue({ id: 'list-1' }),
      },
      creatorListMember: members,
    };
    const manager = {
      executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
        withWorkspaceContext(workspaceContext, callback),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
          callback(transactionManager),
        ),
      }),
      getRepository: jest.fn(
        async (_workspaceId: string, name: keyof typeof repositories) =>
          repositories[name],
      ),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new CampaignInfluencerService(manager);

    await expect(
      service.addCreatorListMemberIntent(
        { creatorListId: 'list-1', creatorId: 'creator-1' },
        authContext,
      ),
    ).resolves.toEqual(membership);
    expect(members.upsert).toHaveBeenCalledWith(
      { creatorListId: 'list-1', creatorId: 'creator-1' },
      {
        conflictPaths: ['creatorListId', 'creatorId'],
        indexPredicate: '"deletedAt" IS NULL',
      },
      transactionManager,
    );
    expect(members.save).not.toHaveBeenCalled();
    expect(members.findOne).toHaveBeenLastCalledWith(
      {
        where: {
          creatorListId: 'list-1',
          creatorId: 'creator-1',
        },
      },
      transactionManager,
    );
  });

  it('persists a managed mailbox on transactional direct additions', async () => {
    const transactionManager = { id: 'transaction-manager' };
    const campaignCreators = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    const repositories = {
      campaign: {
        findOne: jest.fn().mockResolvedValue({ id: 'campaign-1' }),
      },
      campaignCreator: campaignCreators,
      campaignCreatorList: {
        find: jest.fn().mockResolvedValue([]),
      },
      creator: {
        findOne: jest.fn().mockResolvedValue({ id: 'creator-1' }),
      },
      creatorList: {},
    };
    const manager = {
      executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
        withWorkspaceContext(workspaceContext, callback),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
          callback(transactionManager),
        ),
      }),
      getRepository: jest.fn(
        async (_workspaceId: string, name: keyof typeof repositories) =>
          repositories[name],
      ),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new CampaignInfluencerService(manager);

    await service.addDirectCampaignCreators(
      {
        campaignId: 'campaign-1',
        creatorIds: ['creator-1'],
        assignedManagedMailboxId: 'mailbox-1',
      },
      authContext,
    );

    expect(campaignCreators.upsert).toHaveBeenCalledWith(
      [
        {
          campaignId: 'campaign-1',
          creatorId: 'creator-1',
          isDirectlyAdded: true,
          assignedManagedMailboxId: 'mailbox-1',
        },
      ],
      {
        conflictPaths: ['campaignId', 'creatorId'],
        indexPredicate: '"deletedAt" IS NULL',
      },
      transactionManager,
    );
  });
});
