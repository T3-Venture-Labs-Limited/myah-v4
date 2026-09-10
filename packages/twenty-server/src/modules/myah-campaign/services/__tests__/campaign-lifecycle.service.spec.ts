import { CommonQueryRunnerExceptionCode } from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';
import { CampaignLifecycleService } from 'src/modules/myah-campaign/services/campaign-lifecycle.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({ getWorkspaceContext: jest.fn() }),
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
const systemAuthContext = {
  type: 'system',
  workspace: { id: workspaceId },
} as WorkspaceAuthContext;
const campaignObjectMetadata = {
  id: 'campaign-object-id',
  universalIdentifier: MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'campaign',
};
const ownerFieldMetadata = {
  id: 'owner-field-id',
  universalIdentifier: 'owner-field-universal-id',
  objectMetadataId: campaignObjectMetadata.id,
  name: 'owner',
  isActive: true,
};

const createWorkspaceContext = (
  includeCampaign = true,
  includeOwner = true,
): ORMWorkspaceContext =>
  ({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: includeCampaign
        ? {
            [MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER]: campaignObjectMetadata,
          }
        : {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: includeOwner
        ? { [ownerFieldMetadata.universalIdentifier]: ownerFieldMetadata }
        : {},
    },
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: {},
  }) as unknown as ORMWorkspaceContext;

const dedicatedError =
  'Campaign lifecycle and execution authority require a dedicated operation.';

const expectDedicatedError = async (promise: Promise<unknown>) => {
  await expect(promise).rejects.toMatchObject({
    code: CommonQueryRunnerExceptionCode.BAD_REQUEST,
    message: dedicatedError,
    userFriendlyMessage: { message: dedicatedError },
  });
};

describe('CampaignLifecycleService generic compatibility adapter', () => {
  const getRepository = jest.fn();
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => unknown | Promise<unknown>) => callback(),
  );
  const service = new CampaignLifecycleService({
    executeInWorkspaceContext,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager);

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceContextMock.mockReturnValue(createWorkspaceContext());
  });

  it('leaves foreign same-named application objects untouched', async () => {
    getWorkspaceContextMock.mockReturnValue(createWorkspaceContext(false));
    const payload = {
      data: {
        lifecycleStatus: 'ACTIVE',
        sequenceAuthorization: { authorizationId: 'forged' },
      },
    } as never;

    await expect(
      service.prepareCreateOne(userAuthContext, 'campaign', payload),
    ).resolves.toBe(payload);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('defaults only an omitted lifecycle status to DRAFT and defaults user owner', async () => {
    const payload = { data: { name: 'Launch' } };

    await expect(
      service.prepareCreateOne(userAuthContext, 'campaign', payload),
    ).resolves.toBe(payload);

    expect(payload.data).toEqual({
      name: 'Launch',
      lifecycleStatus: 'DRAFT',
      ownerId: 'workspace-member-1',
    });
  });

  it('allows explicit DRAFT create and unrelated update fields', async () => {
    const createPayload = {
      data: { lifecycleStatus: 'DRAFT', objective: 'Goal' },
    };
    const updateOnePayload = { id: campaignId, data: { name: 'Renamed' } };
    const updateManyPayload = {
      filter: { id: { eq: campaignId } },
      data: { objective: 'Changed' },
    };

    await expect(
      service.prepareCreateOne(systemAuthContext, 'campaign', createPayload),
    ).resolves.toBe(createPayload);
    await expect(
      service.validateStatusBearingUpdateOne(
        userAuthContext,
        'campaign',
        updateOnePayload,
      ),
    ).resolves.toBe(updateOnePayload);
    await expect(
      service.prepareUpdateMany(userAuthContext, 'campaign', updateManyPayload),
    ).resolves.toBe(updateManyPayload);
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

  it('does not invent an owner for non-user auth or absent owner metadata', async () => {
    const systemPayload: { data: { ownerId?: string } } = { data: {} };
    const noMetadataPayload: { data: { ownerId?: string } } = { data: {} };

    await service.prepareCreateOne(
      systemAuthContext,
      'campaign',
      systemPayload,
    );
    getWorkspaceContextMock.mockReturnValue(
      createWorkspaceContext(true, false),
    );
    await service.prepareCreateOne(
      userAuthContext,
      'campaign',
      noMetadataPayload,
    );

    expect(systemPayload.data.ownerId).toBeUndefined();
    expect(noMetadataPayload.data.ownerId).toBeUndefined();
  });

  it('preserves caller UUID and owner across repeated native preparation', async () => {
    const original = {
      data: {
        id: '34700000-0000-4000-8000-000000000401',
        ownerId: '34700000-0000-4000-8000-000000000402',
        name: 'Retry preparation',
      },
    };

    for (let run = 0; run < 2; run += 1) {
      const payload = structuredClone(original);

      await service.prepareCreateOne(userAuthContext, 'campaign', payload);
      expect(payload).toEqual({
        data: { ...original.data, lifecycleStatus: 'DRAFT' },
      });
    }
  });

  it('rejects create upsert before applying defaults', async () => {
    const payload = { data: {}, upsert: true };

    await expect(
      service.prepareCreateOne(userAuthContext, 'campaign', payload),
    ).rejects.toMatchObject({
      code: CommonQueryRunnerExceptionCode.BAD_REQUEST,
      message: 'Campaign upsert is not supported; use create or update.',
    });
    expect(payload.data).toEqual({});
  });

  it('rejects createMany upsert before mutating any row', async () => {
    const payload = { data: [{}, { lifecycleStatus: null }], upsert: true };

    await expect(
      service.prepareCreateMany(userAuthContext, 'campaign', payload),
    ).rejects.toMatchObject({
      code: CommonQueryRunnerExceptionCode.BAD_REQUEST,
      message: 'Campaign upsert is not supported; use create or update.',
    });
    expect(payload.data).toEqual([{}, { lifecycleStatus: null }]);
  });

  it.each(['ACTIVE', 'PAUSED', 'COMPLETED', null, undefined, ''])(
    'rejects explicit createOne lifecycle value %p',
    async (lifecycleStatus) => {
      await expectDedicatedError(
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data: { lifecycleStatus },
        }),
      );
    },
  );

  it.each(['ACTIVE', 'PAUSED', 'COMPLETED'])(
    'rejects explicit createMany lifecycle value %s before mutating any row',
    async (lifecycleStatus) => {
      const payload = {
        data: [{ name: 'Allowed first' }, { lifecycleStatus }],
      };

      await expectDedicatedError(
        service.prepareCreateMany(userAuthContext, 'campaign', payload),
      );
      expect(payload.data[0]).toEqual({ name: 'Allowed first' });
    },
  );

  it.each([
    [
      'createOne',
      (data: object) =>
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data,
        } as never),
    ],
    [
      'createMany',
      (data: object) =>
        service.prepareCreateMany(userAuthContext, 'campaign', {
          data: [data],
        } as never),
    ],
    [
      'updateOne',
      (data: object) =>
        service.validateStatusBearingUpdateOne(userAuthContext, 'campaign', {
          id: campaignId,
          data,
        } as never),
    ],
    [
      'updateMany',
      (data: object) =>
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: { id: { eq: campaignId } },
          data,
        } as never),
    ],
  ] as const)(
    'rejects caller-owned sequenceAuthorization on %s, including undefined',
    async (_operation, invoke) => {
      await expectDedicatedError(invoke({ sequenceAuthorization: undefined }));
      await expectDedicatedError(
        invoke({ sequenceAuthorization: { authorizationId: 'forged' } }),
      );
    },
  );

  it.each([
    { deletedAt: undefined },
    { deletedAt: null },
    { deletedAt: '2026-09-11T00:00:00.000Z' },
  ])(
    'rejects caller-owned deletedAt $deletedAt on all generic writes',
    async (data) => {
      await expectDedicatedError(
        service.prepareCreateOne(userAuthContext, 'campaign', {
          data,
        } as never),
      );
      await expectDedicatedError(
        service.prepareCreateMany(userAuthContext, 'campaign', {
          data: [data],
        } as never),
      );
      await expectDedicatedError(
        service.validateStatusBearingUpdateOne(userAuthContext, 'campaign', {
          id: campaignId,
          data,
        } as never),
      );
      await expectDedicatedError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: {},
          data,
        } as never),
      );
    },
  );

  it('scopes raw validation to canonical Campaign identity', () => {
    const payload = { data: { deletedAt: undefined } } as never;

    expect(() =>
      service.validateRawCreateOne(
        {
          objectMetadataId: 'custom-object-id',
          objectMetadataUniversalIdentifier:
            '20202020-0000-4000-8000-000000000099',
        },
        payload,
      ),
    ).not.toThrow();
    expect(() =>
      service.validateRawCreateOne(
        {
          objectMetadataId: campaignObjectMetadata.id,
          objectMetadataUniversalIdentifier:
            MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
        },
        payload,
      ),
    ).toThrow(dedicatedError);
  });

  it.each(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'])(
    'rejects updateOne and updateMany lifecycle %s, including no-op candidates',
    async (lifecycleStatus) => {
      await expectDedicatedError(
        service.validateStatusBearingUpdateOne(userAuthContext, 'campaign', {
          id: campaignId,
          data: { lifecycleStatus },
        }),
      );
      await expectDedicatedError(
        service.prepareUpdateMany(userAuthContext, 'campaign', {
          filter: {},
          data: { lifecycleStatus },
        }),
      );
      expect(getRepository).not.toHaveBeenCalled();
    },
  );

  it('uses runtime own-property checks for type-erased payloads', async () => {
    const inheritedAuthority = Object.create({ sequenceAuthorization: {} });
    inheritedAuthority.name = 'Allowed';
    const ownUndefinedLifecycle = Object.create(null) as Record<
      string,
      unknown
    >;
    ownUndefinedLifecycle.lifecycleStatus = undefined;

    await expect(
      service.validateStatusBearingUpdateOne(userAuthContext, 'campaign', {
        id: campaignId,
        data: inheritedAuthority,
      } as never),
    ).resolves.toBeDefined();
    await expectDedicatedError(
      service.prepareUpdateMany(userAuthContext, 'campaign', {
        filter: {},
        data: ownUndefinedLifecycle,
      } as never),
    );
  });
});
