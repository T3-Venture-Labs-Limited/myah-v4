import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import {
  type CampaignLifecycleActorPermissionResolverPort,
  type CampaignLifecycleWriteAuthorizationPort,
  type LockedCampaignLifecycleContext,
  type RawCampaignLifecycleProjection,
} from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';

const makeAuthContext = () =>
  ({
    type: 'system',
    workspace: { id: workspaceId, settings: { locale: 'en' } },
  }) as unknown as WorkspaceAuthContext;

class AuthRecord {
  constructor(readonly id: string) {}
}

const makeUserAuthContext = () =>
  ({
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId: 'user-workspace-id',
    user: { id: 'user-id' },
    workspaceMemberId: 'workspace-member-id',
    workspaceMember: new AuthRecord('workspace-member-id'),
  }) as unknown as WorkspaceAuthContext;

const makeApiKeyAuthContext = () =>
  ({
    type: 'apiKey',
    workspace: { id: workspaceId },
    apiKey: { id: 'api-key-id', roleId: 'api-key-role-id' },
  }) as unknown as WorkspaceAuthContext;

const makeApplicationAuthContext = () =>
  ({
    type: 'application',
    workspace: { id: workspaceId },
    application: Object.assign(new AuthRecord('application-id'), {
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      defaultRoleId: 'application-role-id',
      updatedAt: new Date('2026-09-10T00:00:01.000Z'),
    }),
  }) as unknown as WorkspaceAuthContext;

const makePendingActivationAuthContext = () =>
  ({
    type: 'pendingActivationUser',
    workspace: { id: workspaceId },
    userWorkspaceId: 'pending-user-workspace-id',
    user: { id: 'pending-user-id' },
  }) as unknown as WorkspaceAuthContext;

const makeWorkspaceRow = () => ({
  id: workspaceId,
  campaignCapacityTimeZone: 'America/New_York',
});
const makeCampaignRow = (): RawCampaignLifecycleProjection => ({
  id: campaignId,
  lifecycleStatus: 'DRAFT',
  sequenceAuthorization: { rules: [{ channel: 'email' }] },
});

const WORKSPACE_LOCK_SQL = `SELECT id, "campaignCapacityTimeZone"
         FROM core.workspace
        WHERE id = $1
        FOR UPDATE`;
const CAMPAIGN_ADVISORY_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))';

type Boundary =
  | 'resolver'
  | 'data-source'
  | 'workspace-lock'
  | 'advisory-lock'
  | 'repository'
  | 'campaign-lock'
  | 'authorization';

type Deferred = {
  entered: Promise<void>;
  release: () => void;
};

const deferred = (): Deferred => {
  let markEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => (markEntered = resolve));
  const wait = new Promise<void>((resolve) => (release = resolve));

  return {
    entered,
    release: () => release(),
    wait,
    markEntered,
  } as Deferred & {
    wait: Promise<void>;
    markEntered: () => void;
  };
};

type Harness = ReturnType<typeof createHarness>;

const createHarness = (overrides?: {
  boundary?: Boundary;
  authContext?: WorkspaceAuthContext;
  rolePermissionConfig?: RolePermissionConfig | null;
  queryRunner?: Partial<
    NonNullable<WorkspaceEntityManager['queryRunner']>
  > | null;
  workspaceRows?: Array<ReturnType<typeof makeWorkspaceRow>>;
  campaign?: RawCampaignLifecycleProjection | null;
  authorizationError?: Error;
}) => {
  const order: string[] = [];
  const workspaceContextOrder: string[] = [];
  const gate = deferred() as Deferred & {
    wait: Promise<void>;
    markEntered: () => void;
  };
  const pause = async (boundary: Boundary) => {
    if (overrides?.boundary === boundary) {
      gate.markEntered();
      await gate.wait;
    }
  };
  const authContext = overrides?.authContext ?? makeAuthContext();
  const rolePermissionConfig: RolePermissionConfig | null =
    overrides && 'rolePermissionConfig' in overrides
      ? (overrides.rolePermissionConfig ?? null)
      : { intersectionOf: ['campaign-editor-role'] };
  const workspaceRows = overrides?.workspaceRows ?? [makeWorkspaceRow()];
  const campaign =
    overrides && 'campaign' in overrides
      ? overrides.campaign
      : makeCampaignRow();
  let isWorkspaceContextActive = false;
  const queryRunner =
    overrides?.queryRunner === null
      ? undefined
      : ({
          isTransactionActive: true,
          isReleased: false,
          query: jest.fn(async (sql: string) => {
            if (sql === WORKSPACE_LOCK_SQL) {
              order.push('workspace-lock');
              await pause('workspace-lock');
              return workspaceRows;
            }
            if (sql === CAMPAIGN_ADVISORY_LOCK_SQL) {
              order.push('campaign-advisory-lock');
              await pause('advisory-lock');
              return [];
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          }),
          ...overrides?.queryRunner,
        } as NonNullable<WorkspaceEntityManager['queryRunner']>);
  const transactionManager = { queryRunner } as WorkspaceEntityManager;

  if (queryRunner && overrides?.queryRunner?.manager === undefined) {
    Object.assign(queryRunner, { manager: transactionManager });
  }

  const transaction = jest.fn(
    async <T>(callback: (manager: WorkspaceEntityManager) => Promise<T>) => {
      workspaceContextOrder.push(`transaction:${isWorkspaceContextActive}`);
      return callback(transactionManager);
    },
  );
  const dataSource = { transaction } as unknown as GlobalWorkspaceDataSource;
  const campaignRepository = {
    findOne: jest.fn(async () => {
      order.push('campaign-lock');
      await pause('campaign-lock');
      return campaign;
    }),
  } as unknown as WorkspaceRepository<RawCampaignLifecycleProjection>;
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async <T>(callback: () => T | Promise<T>) => {
        workspaceContextOrder.push('enter');
        isWorkspaceContextActive = true;
        try {
          return await callback();
        } finally {
          isWorkspaceContextActive = false;
          workspaceContextOrder.push('exit');
        }
      },
    ),
    getGlobalWorkspaceDataSource: jest.fn(async () => {
      await pause('data-source');
      workspaceContextOrder.push(`data-source:${isWorkspaceContextActive}`);
      return dataSource;
    }),
    getRepository: jest.fn(async () => {
      await pause('repository');
      workspaceContextOrder.push(`repository:${isWorkspaceContextActive}`);
      return campaignRepository;
    }),
  } as unknown as GlobalWorkspaceOrmManager;
  const actorPermissionResolver: CampaignLifecycleActorPermissionResolverPort =
    {
      resolveRolePermissionConfig: jest.fn(async () => {
        await pause('resolver');
        return rolePermissionConfig;
      }),
    };
  const writeAuthorization: CampaignLifecycleWriteAuthorizationPort = {
    assertCampaignWriteAllowedInTransaction: jest.fn(async () => {
      order.push('write-authorization');
      await pause('authorization');
      if (overrides?.authorizationError) throw overrides.authorizationError;
    }),
  };
  const service = new CampaignLifecycleTransactionService(
    globalWorkspaceOrmManager,
    actorPermissionResolver,
    writeAuthorization,
  );

  return {
    actorPermissionResolver,
    authContext,
    campaign,
    campaignRepository,
    gate,
    globalWorkspaceOrmManager,
    order,
    queryRunner,
    rolePermissionConfig,
    service,
    transaction,
    transactionManager,
    workspaceContextOrder,
    workspaceRows,
    writeAuthorization,
  };
};

const run = <T>(
  harness: Harness,
  operation: (context: LockedCampaignLifecycleContext) => Promise<T>,
  input = {
    workspaceId,
    campaignId,
    authContext: harness.authContext,
  },
) => harness.service.run(input, operation);

describe('CampaignLifecycleTransactionService', () => {
  it('uses one transaction and exact Workspace → advisory → Campaign → write-auth → callback order', async () => {
    const harness = createHarness();
    const result = { activationId: 'activation-id' } as const;

    await expect(
      run(harness, async () => {
        harness.order.push('operation');
        return result;
      }),
    ).resolves.toBe(result);

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.order).toEqual([
      'workspace-lock',
      'campaign-advisory-lock',
      'campaign-lock',
      'write-authorization',
      'operation',
    ]);
  });

  it('resolves permissions server-side and encloses all datasource work in the snapshotted actor context', async () => {
    const harness = createHarness();

    await run(harness, async () => undefined);

    expect(
      harness.actorPermissionResolver.resolveRolePermissionConfig,
    ).toHaveBeenCalledWith({
      authContext: expect.objectContaining({ type: 'system' }),
      workspaceId,
    });
    const resolvedAuth = (
      harness.actorPermissionResolver.resolveRolePermissionConfig as jest.Mock
    ).mock.calls[0][0].authContext;
    expect(
      harness.globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), resolvedAuth);
    expect(harness.workspaceContextOrder).toEqual([
      'enter',
      'data-source:true',
      'transaction:true',
      'repository:true',
      'exit',
    ]);
    expect(
      harness.globalWorkspaceOrmManager.getRepository,
    ).toHaveBeenCalledWith(workspaceId, 'campaign', {
      intersectionOf: ['campaign-editor-role'],
    });
  });

  it('uses the active transaction manager identity for the Campaign lock and both trusted participants', async () => {
    const harness = createHarness();
    const operation = jest.fn(async () => undefined);

    await run(harness, operation);

    expect(harness.campaignRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
        where: { id: campaignId },
      }),
      harness.transactionManager,
    );
    expect(
      harness.writeAuthorization.assertCampaignWriteAllowedInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ manager: harness.transactionManager }),
    );
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({ manager: harness.transactionManager }),
    );
  });

  it.each([
    ['missing', null],
    ['inactive', { isTransactionActive: false, isReleased: false }],
    ['released', { isTransactionActive: true, isReleased: true }],
  ])('rejects a %s query runner before locks', async (_name, queryRunner) => {
    const harness = createHarness({ queryRunner });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Campaign lifecycle transaction requires an active, unreleased query runner',
    );
    if (harness.queryRunner) {
      expect(harness.queryRunner.query).not.toHaveBeenCalled();
    }
  });

  it('rejects a query runner owned by a different manager', async () => {
    const harness = createHarness({
      queryRunner: { manager: {} as WorkspaceEntityManager },
    });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Campaign lifecycle transaction manager must own its query runner',
    );
  });

  it.each([
    ['workspaceId', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'],
    ['campaignId', 'not-a-uuid'],
  ])('rejects non-canonical %s before async work', async (key, value) => {
    const harness = createHarness();
    const input = {
      workspaceId,
      campaignId,
      authContext: harness.authContext,
      [key]: value,
    };

    await expect(run(harness, async () => undefined, input)).rejects.toThrow(
      `${key} must be a canonical lowercase UUID`,
    );
    expect(
      harness.actorPermissionResolver.resolveRolePermissionConfig,
    ).not.toHaveBeenCalled();
  });

  it('rejects caller workspace mismatch and null resolution', async () => {
    const mismatchedAuth = makeAuthContext();
    mismatchedAuth.workspace.id = '33333333-3333-4333-8333-333333333333';
    const mismatchHarness = createHarness({ authContext: mismatchedAuth });

    await expect(run(mismatchHarness, async () => undefined)).rejects.toThrow(
      'Actor permission context does not match workspace scope',
    );

    const nullHarness = createHarness({ rolePermissionConfig: null });
    await expect(run(nullHarness, async () => undefined)).rejects.toThrow(
      'Actor permission resolution failed',
    );
    expect(nullHarness.transaction).not.toHaveBeenCalled();
  });

  it('allows resolver bypass only for system actors and fails non-system bypass closed', async () => {
    const systemHarness = createHarness({
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    await expect(run(systemHarness, async () => 'ok')).resolves.toBe('ok');

    const userHarness = createHarness({
      authContext: makeUserAuthContext(),
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });
    await expect(run(userHarness, async () => undefined)).rejects.toThrow(
      'Permission bypass requires a system actor',
    );
    expect(userHarness.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['system', makeAuthContext],
    ['user', makeUserAuthContext],
    ['apiKey', makeApiKeyAuthContext],
    ['application', makeApplicationAuthContext],
    ['pendingActivationUser', makePendingActivationAuthContext],
  ])('detaches and supports the real %s auth shape', async (_name, factory) => {
    const authContext = factory();
    const harness = createHarness({ authContext });
    let received: LockedCampaignLifecycleContext | undefined;

    await run(harness, async (context) => {
      received = context;
    });

    const snapshot = received?.actorPermissionContext.authContext;

    expect(snapshot).not.toBe(authContext);
    expect(snapshot?.type).toBe(authContext.type);
    expect(snapshot?.workspace).not.toBe(authContext.workspace);
    expect(snapshot?.workspace.id).toBe(workspaceId);

    if (
      authContext.type === 'application' &&
      snapshot?.type === 'application'
    ) {
      expect(snapshot.application).not.toBe(authContext.application);
      expect(snapshot.application.createdAt).toBeInstanceOf(Date);
      expect(snapshot.application.createdAt).not.toBe(
        authContext.application.createdAt,
      );
      expect(snapshot.application.createdAt.getTime()).toBe(
        authContext.application.createdAt.getTime(),
      );
      expect(Object.getPrototypeOf(snapshot.application)).toBeNull();
    }

    if (authContext.type === 'user' && snapshot?.type === 'user') {
      expect(snapshot.workspaceMember).not.toBe(authContext.workspaceMember);
      expect(Object.getPrototypeOf(snapshot.workspaceMember)).toBeNull();
    }
  });

  it.each([
    [
      'prototype-polluting extra key',
      () => {
        const value = { intersectionOf: ['role-a'] } as Record<string, unknown>;

        Object.defineProperty(value, '__proto__', {
          enumerable: true,
          value: { shouldBypassPermissionChecks: true },
        });

        return value;
      },
    ],
    [
      'accessor',
      () =>
        Object.defineProperty({}, 'intersectionOf', {
          enumerable: true,
          get: () => ['role-a'],
        }),
    ],
    ['sparse role array', () => ({ intersectionOf: new Array(1) })],
  ])('rejects a malicious resolver %s', async (_name, factory) => {
    const harness = createHarness({
      rolePermissionConfig: factory() as RolePermissionConfig,
    });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Actor permission resolution was invalid',
    );
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('rejects role-array accessors without invoking them', async () => {
    let getterCalls = 0;
    const roleIds = Object.defineProperty(new Array(1), '0', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'role-a';
      },
    });
    const harness = createHarness({
      rolePermissionConfig: {
        intersectionOf: roleIds,
      },
    });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Actor permission resolution was invalid',
    );
    expect(getterCalls).toBe(0);
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('rejects resolver proxies without invoking their traps', async () => {
    let trapCalls = 0;
    const rolePermissionConfig = new Proxy(
      { intersectionOf: ['role-a'] },
      {
        ownKeys: () => {
          trapCalls += 1;
          return ['intersectionOf'];
        },
      },
    );
    const harness = createHarness({ rolePermissionConfig });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Actor permission resolution was invalid',
    );
    expect(trapCalls).toBe(0);
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('rejects role-array proxies without invoking their traps', async () => {
    let trapCalls = 0;
    const roleIds = new Proxy(['role-a'], {
      ownKeys: () => {
        trapCalls += 1;
        return ['0', 'length'];
      },
    });
    const harness = createHarness({
      rolePermissionConfig: {
        intersectionOf: roleIds,
      },
    });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Actor permission resolution was invalid',
    );
    expect(trapCalls).toBe(0);
    expect(harness.transaction).not.toHaveBeenCalled();
  });

  it('rejects accessor transaction inputs without invoking them', async () => {
    let getterCalls = 0;
    const harness = createHarness();
    const input = Object.defineProperty(
      { workspaceId, campaignId, authContext: harness.authContext },
      'campaignId',
      {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return campaignId;
        },
      },
    );

    await expect(
      harness.service.run(input, async () => undefined),
    ).rejects.toThrow('Campaign lifecycle transaction input was invalid');
    expect(getterCalls).toBe(0);
  });

  it('rejects auth proxies without invoking their traps', async () => {
    let trapCalls = 0;
    const authContext = new Proxy(makeAuthContext(), {
      ownKeys: () => {
        trapCalls += 1;
        return ['type', 'workspace'];
      },
    });
    const harness = createHarness({ authContext });

    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Campaign lifecycle auth context was invalid',
    );
    expect(trapCalls).toBe(0);
  });

  it.each([
    ['missing', []],
    [
      'scope-mismatched',
      [{ ...makeWorkspaceRow(), id: '33333333-3333-4333-8333-333333333333' }],
    ],
  ])(
    'rejects a %s Workspace before later locks',
    async (_name, workspaceRows) => {
      const harness = createHarness({ workspaceRows });
      await expect(run(harness, async () => undefined)).rejects.toThrow(
        'Workspace was not found in the requested scope',
      );
      expect(harness.order).toEqual(['workspace-lock']);
    },
  );

  it.each([
    ['missing', null],
    [
      'scope-mismatched',
      { ...makeCampaignRow(), id: '33333333-3333-4333-8333-333333333333' },
    ],
  ])('rejects a %s Campaign before authorization', async (_name, campaign) => {
    const harness = createHarness({ campaign });
    await expect(run(harness, async () => undefined)).rejects.toThrow(
      'Campaign was not found in the requested scope',
    );
    expect(
      harness.writeAuthorization.assertCampaignWriteAllowedInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('propagates authorization and operation errors after the proven callback order', async () => {
    const denied = new Error('denied');
    const deniedHarness = createHarness({ authorizationError: denied });
    await expect(run(deniedHarness, async () => undefined)).rejects.toBe(
      denied,
    );
    expect(deniedHarness.order).toEqual([
      'workspace-lock',
      'campaign-advisory-lock',
      'campaign-lock',
      'write-authorization',
    ]);

    const failedHarness = createHarness();
    const failure = new Error('operation failed');
    await expect(
      run(failedHarness, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(
      failedHarness.workspaceContextOrder[
        failedHarness.workspaceContextOrder.length - 1
      ],
    ).toBe('exit');
  });

  it.each<Boundary>([
    'resolver',
    'data-source',
    'workspace-lock',
    'advisory-lock',
    'repository',
    'campaign-lock',
    'authorization',
  ])(
    'never rereads caller IDs or auth aliases after the %s await boundary',
    async (boundary) => {
      const authContext = makeAuthContext();
      const harness = createHarness({ boundary, authContext });
      const input = { workspaceId, campaignId, authContext };
      let received: LockedCampaignLifecycleContext | undefined;
      const pending = run(
        harness,
        async (context) => {
          received = context;
        },
        input,
      );

      await harness.gate.entered;
      input.workspaceId = '33333333-3333-4333-8333-333333333333';
      input.campaignId = '44444444-4444-4444-8444-444444444444';
      authContext.workspace.id = input.workspaceId;
      (
        authContext.workspace as unknown as { settings: { locale: string } }
      ).settings.locale = 'fr';
      harness.gate.release();
      await pending;

      expect(received).toEqual(
        expect.objectContaining({ workspaceId, campaignId }),
      );
      expect(received?.actorPermissionContext.authContext.workspace.id).toBe(
        workspaceId,
      );
      expect(
        (
          received?.actorPermissionContext.authContext.workspace as unknown as {
            settings: { locale: string };
          }
        ).settings.locale,
      ).toBe('en');
      expect(harness.queryRunner?.query).toHaveBeenNthCalledWith(
        1,
        WORKSPACE_LOCK_SQL,
        [workspaceId],
      );
      expect(harness.queryRunner?.query).toHaveBeenNthCalledWith(
        2,
        CAMPAIGN_ADVISORY_LOCK_SQL,
        [workspaceId, campaignId],
      );
    },
  );

  it('preserves arbitrary JSON keys as setter-free own properties', async () => {
    const sequenceAuthorization = Object.create(null) as Record<
      string,
      unknown
    >;

    Object.defineProperty(sequenceAuthorization, '__proto__', {
      enumerable: true,
      value: { authorized: true },
    });
    const harness = createHarness({
      campaign: {
        ...makeCampaignRow(),
        sequenceAuthorization:
          sequenceAuthorization as RawCampaignLifecycleProjection['sequenceAuthorization'],
      },
    });
    let received: LockedCampaignLifecycleContext | undefined;

    await run(harness, async (context) => {
      received = context;
    });

    const snapshot = received?.campaign.sequenceAuthorization as Record<
      string,
      unknown
    >;

    expect(Object.getPrototypeOf(snapshot)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(snapshot, '__proto__')).toBe(
      true,
    );
    expect(snapshot.__proto__).toEqual({ authorized: true });
  });

  it.each([
    [
      'Workspace',
      { ...makeWorkspaceRow(), unexpected: true },
      undefined,
      'Workspace lock projection was invalid',
    ],
    [
      'Campaign',
      makeWorkspaceRow(),
      { ...makeCampaignRow(), unexpected: true },
      'Campaign lock projection was invalid',
    ],
  ])(
    'rejects an extra-key %s lock projection',
    async (_name, workspaceRow, campaign, error) => {
      const harness = createHarness({
        workspaceRows: [workspaceRow],
        campaign: campaign ?? makeCampaignRow(),
      });

      await expect(run(harness, async () => undefined)).rejects.toThrow(error);
    },
  );

  it('clones and recursively freezes resolver roles and locked projections against later external mutation', async () => {
    const rolePermissionConfig = { intersectionOf: ['role-a'] };
    const workspaceRows = [makeWorkspaceRow()];
    const campaign = makeCampaignRow();
    const harness = createHarness({
      boundary: 'authorization',
      rolePermissionConfig,
      workspaceRows,
      campaign,
    });
    let received: LockedCampaignLifecycleContext | undefined;
    const pending = run(harness, async (context) => {
      received = context;
    });

    await harness.gate.entered;
    rolePermissionConfig.intersectionOf.push('role-b');
    workspaceRows[0].campaignCapacityTimeZone = 'UTC';
    (
      campaign.sequenceAuthorization as { rules: Array<{ channel: string }> }
    ).rules[0].channel = 'sms';
    harness.gate.release();
    await pending;

    expect(received?.actorPermissionContext.rolePermissionConfig).toEqual({
      intersectionOf: ['role-a'],
    });
    expect(received?.workspace.campaignCapacityTimeZone).toBe(
      'America/New_York',
    );
    expect(received?.campaign.sequenceAuthorization).toEqual({
      rules: [{ channel: 'email' }],
    });
    expect(Object.isFrozen(received)).toBe(true);
    expect(
      Object.isFrozen(received?.actorPermissionContext.authContext.workspace),
    ).toBe(true);
    expect(
      Object.isFrozen(
        (
          received?.actorPermissionContext.rolePermissionConfig as {
            intersectionOf: string[];
          }
        ).intersectionOf,
      ),
    ).toBe(true);
    expect(
      Object.isFrozen(
        (received?.campaign.sequenceAuthorization as { rules: unknown[] })
          .rules,
      ),
    ).toBe(true);
    expect(
      Object.isFrozen(
        (received?.campaign.sequenceAuthorization as { rules: object[] })
          .rules[0],
      ),
    ).toBe(true);
  });
});
