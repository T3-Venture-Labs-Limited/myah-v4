import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import {
  MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

const getWorkspaceContextMock = jest.mocked(getWorkspaceContext);

const workspaceId = 'workspace-a';
const campaignId = 'campaign-1';
const userAuthContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId: 'user-workspace-1',
  workspaceMemberId: 'workspace-member-1',
  user: { id: 'user-1' },
  workspaceMember: { id: 'workspace-member-1' },
} as WorkspaceAuthContext;
const apiKeyAuthContext = {
  type: 'apiKey',
  workspace: { id: workspaceId },
  apiKey: { id: 'api-key-1' },
} as WorkspaceAuthContext;
const applicationAuthContext = {
  type: 'application',
  workspace: { id: workspaceId },
  application: { id: 'application-1', defaultRoleId: 'application-role' },
} as WorkspaceAuthContext;
const systemAuthContext = {
  type: 'system',
  workspace: { id: workspaceId },
} as WorkspaceAuthContext;
const pendingActivationAuthContext = {
  type: 'pendingActivationUser',
  workspace: { id: workspaceId },
  userWorkspaceId: 'pending-user-workspace-1',
  user: { id: 'pending-user-1' },
} as WorkspaceAuthContext;

const campaignObjectMetadata = {
  id: 'campaign-object-id',
  universalIdentifier: MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'campaign',
};
const campaignCreatorObjectMetadata = {
  id: 'campaign-creator-object-id',
  universalIdentifier: MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'campaignCreator',
};
const ownerFieldMetadata = {
  id: 'owner-field-id',
  universalIdentifier: 'owner-field-universal-id',
  objectMetadataId: campaignObjectMetadata.id,
  name: 'owner',
  isActive: true,
};

const createWorkspaceContext = ({
  includeCampaign = true,
  includeCampaignCreator = true,
  includeOwner = true,
  userWorkspaceRoleMap = { 'user-workspace-1': 'role-1' },
  apiKeyRoleMap = { 'api-key-1': 'api-role' },
}: {
  includeCampaign?: boolean;
  includeCampaignCreator?: boolean;
  includeOwner?: boolean;
  userWorkspaceRoleMap?: Record<string, string>;
  apiKeyRoleMap?: Record<string, string>;
} = {}): ORMWorkspaceContext =>
  ({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: {
        ...(includeCampaign
          ? {
              [MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER]:
                campaignObjectMetadata,
            }
          : {
              'foreign-campaign-universal-id': {
                ...campaignObjectMetadata,
                universalIdentifier: 'foreign-campaign-universal-id',
              },
            }),
        ...(includeCampaignCreator
          ? {
              [MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER]:
                campaignCreatorObjectMetadata,
            }
          : {
              'foreign-campaign-creator-universal-id': {
                ...campaignCreatorObjectMetadata,
                universalIdentifier: 'foreign-campaign-creator-universal-id',
              },
            }),
      },
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: includeOwner
        ? { [ownerFieldMetadata.universalIdentifier]: ownerFieldMetadata }
        : {},
    },
    userWorkspaceRoleMap,
    apiKeyRoleMap,
  }) as unknown as ORMWorkspaceContext;

const expectLifecycleError = async (
  promise: Promise<unknown>,
  userFriendlyMessage: string,
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    code: CommonQueryRunnerExceptionCode.BAD_REQUEST,
    userFriendlyMessage: { message: userFriendlyMessage },
  });
};

describe('CampaignLifecycleService', () => {
  const campaignRepository = {
    findOne: jest.fn(),
  };
  const campaignCreatorRepository = {
    exists: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDelete: jest.fn(),
  };
  const getRepository = jest.fn();
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => unknown | Promise<unknown>) => callback(),
  );
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager;
  const service = new CampaignLifecycleService(globalWorkspaceOrmManager);

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceContextMock.mockReturnValue(createWorkspaceContext());
    campaignRepository.findOne.mockResolvedValue({
      id: campaignId,
      name: 'Launch',
      objective: 'Grow awareness',
      status: 'DRAFT',
      ownerId: 'workspace-member-1',
    });
    campaignCreatorRepository.exists.mockResolvedValue(true);
    getRepository.mockImplementation(
      async (_workspaceId: string, objectName: string) =>
        objectName === 'campaign'
          ? campaignRepository
          : campaignCreatorRepository,
    );
  });

  describe('app-object isolation', () => {
    it('returns every payload unchanged before defaults, rejections, or repositories for a foreign same-named object', async () => {
      getWorkspaceContextMock.mockReturnValue(
        createWorkspaceContext({ includeCampaign: false }),
      );
      const createOnePayload = { data: { status: 'ACTIVE' }, upsert: true };
      const createManyPayload = {
        data: [{ status: 'ACTIVE' }],
        upsert: true,
      };
      const updateOnePayload = { id: campaignId, data: { status: 'ACTIVE' } };
      const updateManyPayload = {
        filter: { id: { eq: campaignId } },
        data: { status: 'ACTIVE' },
      };

      await expect(
        service.prepareCreateOne(userAuthContext, 'campaign', createOnePayload),
      ).resolves.toBe(createOnePayload);
      await expect(
        service.prepareCreateMany(
          userAuthContext,
          'campaign',
          createManyPayload,
        ),
      ).resolves.toBe(createManyPayload);
      await expect(
        service.validateStatusBearingUpdateOne(
          userAuthContext,
          'campaign',
          updateOnePayload,
        ),
      ).resolves.toBe(updateOnePayload);
      await expect(
        service.prepareUpdateMany(
          userAuthContext,
          'campaign',
          updateManyPayload,
        ),
      ).resolves.toBe(updateManyPayload);

      expect(createOnePayload).toEqual({
        data: { status: 'ACTIVE' },
        upsert: true,
      });
      expect(getRepository).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('defaults a user create to Draft and the current workspace member owner', async () => {
      const payload = { data: { name: 'Launch' } };

      await expect(
        service.prepareCreateOne(userAuthContext, 'campaign', payload),
      ).resolves.toBe(payload);

      expect(payload.data).toEqual({
        name: 'Launch',
        status: 'DRAFT',
        ownerId: 'workspace-member-1',
      });
      expect(getRepository).not.toHaveBeenCalled();
    });

    it.each([{ ownerId: 'workspace-member-2' }, { ownerId: null }])(
      'preserves explicit owner $ownerId',
      async ({ ownerId }) => {
        const payload = { data: { ownerId } };

        await service.prepareCreateOne(userAuthContext, 'campaign', payload);

        expect(payload.data.ownerId).toBe(ownerId);
      },
    );

    it.each([
      apiKeyAuthContext,
      applicationAuthContext,
      systemAuthContext,
      pendingActivationAuthContext,
    ])(
      'defaults Draft without inventing an owner for $type auth',
      async (authContext) => {
        const payload: { data: { status?: string; ownerId?: string } } = {
          data: {},
        };

        await service.prepareCreateOne(authContext, 'campaign', payload);

        expect(payload.data).toEqual({ status: 'DRAFT' });
      },
    );

    it('does not write owner when owner metadata is not installed', async () => {
      getWorkspaceContextMock.mockReturnValue(
        createWorkspaceContext({ includeOwner: false }),
      );
      const payload: { data: { status?: string; ownerId?: string } } = {
        data: {},
      };

      await service.prepareCreateOne(userAuthContext, 'campaign', payload);

      expect(payload.data).toEqual({ status: 'DRAFT' });
    });

    it.each([' draft ', 'draft', 'Draft', 'READY', '0'])(
      'rejects non-canonical status %s',
      async (status) => {
        await expectLifecycleError(
          service.prepareCreateOne(userAuthContext, 'campaign', {
            data: { status },
          }),
          'Campaign status is invalid.',
        );
      },
    );

    it.each([undefined, null, ''])(
      'normalizes %p status to Draft',
      async (status) => {
        const payload = { data: { status } };

        await service.prepareCreateOne(userAuthContext, 'campaign', payload);

        expect(payload.data.status).toBe('DRAFT');
      },
    );

    it('rejects createOne upsert before mutating status or owner', async () => {
      const payload = { data: {}, upsert: true };

      await expectLifecycleError(
        service.prepareCreateOne(userAuthContext, 'campaign', payload),
        'Campaign upsert is not supported; use create or update.',
      );

      expect(payload.data).toEqual({});
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('rejects createMany upsert before mutating any row', async () => {
      const payload = { data: [{}, { status: null }], upsert: true };

      await expectLifecycleError(
        service.prepareCreateMany(userAuthContext, 'campaign', payload),
        'Campaign upsert is not supported; use create or update.',
      );

      expect(payload.data).toEqual([{}, { status: null }]);
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('defaults every createMany row', async () => {
      const payload: {
        data: Array<{ status?: string; ownerId?: string }>;
      } = { data: [{}, { status: '' }] };

      await service.prepareCreateMany(userAuthContext, 'campaign', payload);

      expect(payload.data).toEqual([
        { status: 'DRAFT', ownerId: 'workspace-member-1' },
        { status: 'DRAFT', ownerId: 'workspace-member-1' },
      ]);
    });

    it('permits incomplete Draft creation without repository reads', async () => {
      await expect(
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data: { status: 'DRAFT', name: '', objective: null },
        }),
      ).resolves.toBeDefined();
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('checks Name then Objective then Audience for direct Active creation', async () => {
      await expectLifecycleError(
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data: { status: 'ACTIVE' },
        }),
        'Campaign name is required before activation.',
      );
      await expectLifecycleError(
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data: { status: 'ACTIVE', name: 'Launch' },
        }),
        'Campaign objective is required before activation.',
      );
      campaignCreatorRepository.exists.mockResolvedValue(false);
      await expectLifecycleError(
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data: {
            id: campaignId,
            status: 'ACTIVE',
            name: 'Launch',
            objective: 'Grow awareness',
          },
        }),
        'Add at least one creator before activating this campaign.',
      );
    });
  });

  describe('update', () => {
    const allowedTransitions = [
      ['DRAFT', 'ACTIVE'],
      ['ACTIVE', 'PAUSED'],
      ['PAUSED', 'ACTIVE'],
      ['ACTIVE', 'COMPLETED'],
      ['PAUSED', 'COMPLETED'],
    ] as const;
    const forbiddenTransitions = [
      ['DRAFT', 'PAUSED'],
      ['DRAFT', 'COMPLETED'],
      ['ACTIVE', 'DRAFT'],
      ['PAUSED', 'DRAFT'],
      ['COMPLETED', 'DRAFT'],
      ['COMPLETED', 'ACTIVE'],
      ['COMPLETED', 'PAUSED'],
    ] as const;

    it.each(allowedTransitions)(
      'allows %s to %s and appends the observed-status predicate',
      async (observedStatus, targetStatus) => {
        campaignRepository.findOne.mockResolvedValue({
          id: campaignId,
          name: 'Launch',
          objective: 'Grow awareness',
          status: observedStatus,
        });
        const originalFilter = {
          id: { eq: campaignId },
          name: { like: 'Launch%' },
        };
        const payload = {
          filter: originalFilter,
          data: { status: targetStatus },
        };

        const result = await service.prepareUpdateMany(
          userAuthContext,
          'campaign',
          payload,
        );

        expect(result.data).toBe(payload.data);
        expect(result.filter).toEqual({
          and: [originalFilter, { status: { eq: observedStatus } }],
        });
      },
    );

    it.each(forbiddenTransitions)(
      'rejects %s to %s',
      async (observedStatus, targetStatus) => {
        campaignRepository.findOne.mockResolvedValue({
          id: campaignId,
          name: 'Launch',
          objective: 'Grow awareness',
          status: observedStatus,
        });

        await expectLifecycleError(
          service.prepareUpdateMany(userAuthContext, 'campaign', {
            filter: { id: { eq: campaignId } },
            data: { status: targetStatus },
          }),
          'This Campaign status change is not allowed.',
        );
      },
    );

    it('keeps same-state writes behind the observed-status predicate without readiness work', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: null,
        objective: null,
        status: 'ACTIVE',
      });
      const payload = {
        filter: { id: { eq: campaignId } },
        data: { status: 'ACTIVE' },
      };

      const result = await service.prepareUpdateMany(
        userAuthContext,
        'campaign',
        payload,
      );

      expect(campaignRepository.findOne).toHaveBeenCalledWith({
        where: { id: campaignId },
        select: { id: true, status: true },
      });
      expect(result.filter).toEqual({
        and: [payload.filter, { status: { eq: 'ACTIVE' } }],
      });
      expect(campaignCreatorRepository.exists).not.toHaveBeenCalled();
    });

    it.each([
      {
        observedStatus: 'DRAFT',
        data: { status: 'ACTIVE' as const },
        select: {
          id: true,
          name: true,
          objective: true,
        },
      },
      {
        observedStatus: 'DRAFT',
        data: { status: 'ACTIVE' as const, name: 'Updated launch' },
        select: {
          id: true,
          objective: true,
        },
      },
      {
        observedStatus: 'DRAFT',
        data: {
          status: 'ACTIVE' as const,
          name: 'Updated launch',
          objective: 'Updated objective',
        },
        select: { id: true, status: true },
      },
      {
        observedStatus: 'ACTIVE',
        data: { status: 'PAUSED' as const },
        select: { id: true, status: true },
      },
      {
        observedStatus: 'ACTIVE',
        data: { status: 'COMPLETED' as const },
        select: { id: true, status: true },
      },
    ])(
      'selects only persisted fields required for $data.status without the optional owner column',
      async ({ observedStatus, data, select }) => {
        campaignRepository.findOne.mockResolvedValue({
          id: campaignId,
          name: 'Launch',
          objective: 'Grow awareness',
          status: observedStatus,
        });

        await service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data,
        });

        expect(campaignRepository.findOne).toHaveBeenCalledWith({
          where: { id: campaignId },
          select,
        });
      },
    );

    it('returns status-free updateOne and updateMany payloads unchanged without repositories', async () => {
      const updateOnePayload = { id: campaignId, data: { name: 'Renamed' } };
      const updateManyPayload = {
        filter: { id: { eq: campaignId } },
        data: { objective: 'Changed' },
      };

      await expect(
        service.validateStatusBearingUpdateOne(
          userAuthContext,
          'campaign',
          updateOnePayload,
        ),
      ).resolves.toBe(updateOnePayload);
      await expect(
        service.prepareUpdateMany(
          userAuthContext,
          'campaign',
          updateManyPayload,
        ),
      ).resolves.toBe(updateManyPayload);
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('rejects status-bearing updateOne', async () => {
      await expectLifecycleError(
        service.validateStatusBearingUpdateOne(userAuthContext, 'campaign', {
          id: campaignId,
          data: { status: 'PAUSED' },
        }),
        'Change Campaign status from Campaign Overview.',
      );
      expect(getRepository).not.toHaveBeenCalled();
    });

    it.each([
      {},
      { name: { eq: 'Launch' } },
      { id: { in: [] } },
      { id: { in: [campaignId, 'campaign-2'] } },
      { id: { eq: campaignId, in: [campaignId] } },
      { and: [{ id: { eq: campaignId } }] },
    ])('rejects broad or multi-record filter %p', async (filter) => {
      await expectLifecycleError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter,
          data: { status: 'PAUSED' },
        }),
        'Change one Campaign status at a time.',
      );
      expect(getRepository).not.toHaveBeenCalled();
    });

    it('accepts a one-element top-level id.in filter', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: 'Launch',
        objective: 'Grow awareness',
        status: 'ACTIVE',
      });
      const filter = { id: { in: [campaignId] } };

      const result = await service.prepareUpdateMany(
        userAuthContext,
        'campaign',
        { filter, data: { status: 'PAUSED' } },
      );

      expect(result.filter).toEqual({
        and: [filter, { status: { eq: 'ACTIVE' } }],
      });
    });

    it.each([
      {
        persisted: { name: null, objective: 'Goal', status: 'DRAFT' },
        data: { status: 'ACTIVE' },
        message: 'Campaign name is required before activation.',
      },
      {
        persisted: { name: 'Launch', objective: null, status: 'DRAFT' },
        data: { status: 'ACTIVE' },
        message: 'Campaign objective is required before activation.',
      },
      {
        persisted: {
          name: 'Launch',
          objective: 'Goal',
          status: 'PAUSED',
        },
        data: { status: 'ACTIVE', name: '   ' },
        message: 'Campaign name is required before activation.',
      },
    ])(
      'rejects activation readiness in Name → Objective order',
      async ({ persisted, data, message }) => {
        campaignRepository.findOne.mockResolvedValue({
          id: campaignId,
          ...persisted,
        });

        await expectLifecycleError(
          service.prepareUpdateMany(userAuthContext, 'campaign', {
            filter: { id: { eq: campaignId } },
            data,
          }),
          message,
        );
      },
    );

    it('uses one existence query for effective Audience and never mutates duplicate rows', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: 'Launch',
        objective: 'Goal',
        status: 'DRAFT',
      });

      await service.prepareUpdateMany(userAuthContext, 'campaign', {
        filter: { id: { eq: campaignId } },
        data: { status: 'ACTIVE' },
      });

      expect(campaignCreatorRepository.exists).toHaveBeenCalledTimes(1);
      expect(campaignCreatorRepository.exists).toHaveBeenCalledWith({
        where: {
          campaignId,
          creatorId: expect.anything(),
          deletedAt: expect.anything(),
        },
      });
      expect(campaignCreatorRepository.update).not.toHaveBeenCalled();
      expect(campaignCreatorRepository.delete).not.toHaveBeenCalled();
      expect(campaignCreatorRepository.softDelete).not.toHaveBeenCalled();
    });

    it('rejects Audience when no non-null, non-deleted Creator relation exists', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: 'Launch',
        objective: 'Goal',
        status: 'DRAFT',
      });
      campaignCreatorRepository.exists.mockResolvedValue(false);

      await expectLifecycleError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data: { status: 'ACTIVE' },
        }),
        'Add at least one creator before activating this campaign.',
      );
    });

    it('never acquires Campaign Creator for Pause or Complete', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: null,
        objective: null,
        status: 'ACTIVE',
      });

      await service.prepareUpdateMany(userAuthContext, 'campaign', {
        filter: { id: { eq: campaignId } },
        data: { status: 'PAUSED' },
      });

      expect(getRepository).toHaveBeenCalledTimes(1);
      expect(getRepository).toHaveBeenCalledWith(workspaceId, 'campaign', {
        intersectionOf: ['role-1'],
      });
    });

    it('treats a foreign same-named Campaign Creator object as absent and never queries it', async () => {
      getWorkspaceContextMock.mockReturnValue(
        createWorkspaceContext({ includeCampaignCreator: false }),
      );
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: 'Launch',
        objective: 'Goal',
        status: 'DRAFT',
      });

      await expectLifecycleError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data: { status: 'ACTIVE' },
        }),
        'Add at least one creator before activating this campaign.',
      );

      expect(getRepository).toHaveBeenCalledTimes(1);
      expect(getRepository).not.toHaveBeenCalledWith(
        workspaceId,
        'campaignCreator',
        expect.anything(),
      );
    });

    it('rejects invalid target and observed statuses', async () => {
      await expectLifecycleError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data: { status: 'active' },
        }),
        'Campaign status is invalid.',
      );
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: 'Launch',
        objective: 'Goal',
        status: 'UNKNOWN',
      });
      await expectLifecycleError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data: { status: 'ACTIVE' },
        }),
        'Campaign status is invalid.',
      );
    });
  });

  describe('permissions and tenancy', () => {
    it('passes the resolved user role config to every repository used by activation', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        name: 'Launch',
        objective: 'Goal',
        status: 'DRAFT',
      });

      await service.prepareUpdateMany(userAuthContext, 'campaign', {
        filter: { id: { eq: campaignId } },
        data: { status: 'ACTIVE' },
      });

      expect(getRepository).toHaveBeenNthCalledWith(
        1,
        workspaceId,
        'campaign',
        { intersectionOf: ['role-1'] },
      );
      expect(getRepository).toHaveBeenNthCalledWith(
        2,
        workspaceId,
        'campaignCreator',
        { intersectionOf: ['role-1'] },
      );
    });

    it('uses only the standard system bypass config', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        status: 'ACTIVE',
        name: null,
        objective: null,
      });

      await service.prepareUpdateMany(systemAuthContext, 'campaign', {
        filter: { id: { eq: campaignId } },
        data: { status: 'PAUSED' },
      });

      expect(getRepository).toHaveBeenCalledWith(workspaceId, 'campaign', {
        shouldBypassPermissionChecks: true,
      });
    });

    it.each([applicationAuthContext, pendingActivationAuthContext])(
      'rejects unresolved $type auth before repository access',
      async (authContext) => {
        const unresolvedContext = createWorkspaceContext({
          userWorkspaceRoleMap: {},
          apiKeyRoleMap: {},
        });
        if (authContext.type === 'application') {
          authContext.application.defaultRoleId = null;
        }
        getWorkspaceContextMock.mockReturnValue(unresolvedContext);

        await expect(
          service.prepareUpdateMany(authContext, 'campaign', {
            filter: { id: { eq: campaignId } },
            data: { status: 'PAUSED' },
          }),
        ).rejects.toMatchObject({
          code: CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
        });
        expect(getRepository).not.toHaveBeenCalled();
      },
    );

    it('rethrows repository permission exceptions unchanged', async () => {
      const permissionError = new Error('permission denied');
      getRepository.mockRejectedValueOnce(permissionError);

      await expect(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data: { status: 'PAUSED' },
        }),
      ).rejects.toBe(permissionError);
    });

    it('acquires repositories only for the authenticated workspace', async () => {
      campaignRepository.findOne.mockResolvedValue({
        id: campaignId,
        status: 'ACTIVE',
        name: null,
        objective: null,
      });

      await service.prepareUpdateMany(userAuthContext, 'campaign', {
        filter: { id: { eq: campaignId } },
        data: { status: 'PAUSED' },
      });

      expect(getRepository).toHaveBeenCalledWith(
        workspaceId,
        'campaign',
        expect.anything(),
      );
      expect(getRepository).not.toHaveBeenCalledWith(
        expect.not.stringMatching(/^workspace-a$/),
        expect.anything(),
        expect.anything(),
      );
      expect(executeInWorkspaceContext).toHaveBeenCalledWith(
        expect.any(Function),
        userAuthContext,
      );
    });
  });
});
