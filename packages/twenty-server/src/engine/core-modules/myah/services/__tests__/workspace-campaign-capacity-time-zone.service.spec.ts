import {
  MODULE_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import { type EntityManager } from 'typeorm';

import { WorkspaceCampaignCapacityTimeZoneModule } from 'src/engine/core-modules/myah/workspace-campaign-capacity-time-zone.module';
import { WorkspaceCampaignCapacityTimeZoneAuthorizationService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone-authorization.service';
import { WorkspaceCampaignCapacityTimeZoneService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone.service';
import { WorkspaceCampaignCapacityTimeZoneAuthorizationPort } from 'src/engine/core-modules/myah/types/workspace-campaign-capacity-time-zone.type';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const campaignId = '33333333-3333-4333-8333-333333333333';
const secondCampaignId = '44444444-4444-4444-8444-444444444444';
const schemaName = 'workspace_10dgnsxljlxoxc3rmyv4e8snl';

const WORKSPACE_LOCK_SQL = `SELECT id, "campaignCapacityTimeZone"
         FROM core.workspace
        WHERE id = $1
        FOR UPDATE`;
const CAMPAIGN_METADATA_SQL = `SELECT c.relkind AS "relationKind",
       c.relrowsecurity AS "rowSecurityEnabled",
       c.relforcerowsecurity AS "forceRowSecurityEnabled",
       COUNT(a.attname)::integer AS "requiredColumnCount"
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = c.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
   AND a.attname IN ('id', 'lifecycleStatus', 'deletedAt')
 WHERE n.nspname = $1
   AND c.relname = 'campaign'
 GROUP BY c.relkind, c.relrowsecurity, c.relforcerowsecurity`;
const CAMPAIGN_SCAN_SQL = `SELECT id, "lifecycleStatus"
  FROM "${schemaName}"."campaign"
 WHERE "deletedAt" IS NULL
 ORDER BY id ASC`;
const WORKSPACE_UPDATE_SQL = `UPDATE core.workspace
   SET "campaignCapacityTimeZone" = $2
 WHERE id = $1
   AND "campaignCapacityTimeZone" IS NOT DISTINCT FROM $3
 RETURNING id, "campaignCapacityTimeZone"`;

const workspaceRow = (campaignCapacityTimeZone: string | null = 'UTC') => ({
  id: workspaceId,
  campaignCapacityTimeZone,
});
const metadataRow = () => ({
  relationKind: 'r',
  rowSecurityEnabled: false,
  forceRowSecurityEnabled: false,
  requiredColumnCount: 3,
});
const campaignRow = (id = campaignId, lifecycleStatus = 'PAUSED') => ({
  id,
  lifecycleStatus,
});

const createHarness = (overrides?: {
  workspaceRows?: unknown;
  metadataRows?: unknown;
  campaignRows?: unknown;
  updateResult?: unknown;
  queryRunner?: Record<string, unknown> | null;
  readAuthorizationError?: Error;
  mutationAuthorizationError?: Error;
}) => {
  const order: string[] = [];
  const workspaceRows =
    overrides && 'workspaceRows' in overrides
      ? overrides.workspaceRows
      : [workspaceRow()];
  const metadataRows =
    overrides && 'metadataRows' in overrides
      ? overrides.metadataRows
      : [metadataRow()];
  const campaignRows =
    overrides && 'campaignRows' in overrides
      ? overrides.campaignRows
      : [campaignRow()];
  const updateResult =
    overrides && 'updateResult' in overrides
      ? overrides.updateResult
      : {
          affected: 1,
          records: [workspaceRow('America/New_York')],
        };
  const query = jest.fn(
    async (sql: string, _parameters?: unknown[], structured?: boolean) => {
      if (sql === WORKSPACE_LOCK_SQL) {
        order.push('workspace-lock');
        return workspaceRows;
      }
      if (sql === CAMPAIGN_METADATA_SQL) {
        order.push('campaign-metadata');
        return metadataRows;
      }
      if (sql === CAMPAIGN_SCAN_SQL) {
        order.push('campaign-scan');
        return campaignRows;
      }
      if (sql === WORKSPACE_UPDATE_SQL) {
        order.push(`workspace-update:${String(structured)}`);
        return updateResult;
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  );
  const queryRunner =
    overrides?.queryRunner === null
      ? undefined
      : {
          isTransactionActive: true,
          isReleased: false,
          query,
          ...overrides?.queryRunner,
        };
  const manager = { query, queryRunner } as unknown as EntityManager;

  if (queryRunner && overrides?.queryRunner?.manager === undefined) {
    Object.assign(queryRunner, { manager });
  }

  const authorization: WorkspaceCampaignCapacityTimeZoneAuthorizationPort = {
    assertReadAllowedInTransaction: jest.fn(async () => {
      order.push('read-authorization');
      if (overrides?.readAuthorizationError) {
        throw overrides.readAuthorizationError;
      }
    }),
    assertMutationAllowedInTransaction: jest.fn(async () => {
      order.push('mutation-authorization');
      if (overrides?.mutationAuthorizationError) {
        throw overrides.mutationAuthorizationError;
      }
    }),
  };
  const service = new WorkspaceCampaignCapacityTimeZoneService(authorization);

  return {
    authorization,
    manager,
    order,
    query,
    service,
  };
};

const setTimeZone = (
  harness: ReturnType<typeof createHarness>,
  campaignCapacityTimeZone: string | null,
) =>
  harness.service.setCampaignCapacityTimeZoneInTransaction(
    { workspaceId, campaignCapacityTimeZone },
    harness.manager,
  );

describe('WorkspaceCampaignCapacityTimeZoneService', () => {
  it('authorizes read, locks the exact Workspace, and returns the configured supported value', async () => {
    const harness = createHarness();

    await expect(
      harness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId },
        harness.manager,
      ),
    ).resolves.toEqual({
      status: 'CONFIGURED',
      campaignCapacityTimeZone: 'UTC',
    });

    expect(harness.order).toEqual(['read-authorization', 'workspace-lock']);
    expect(harness.query).toHaveBeenCalledWith(WORKSPACE_LOCK_SQL, [
      workspaceId,
    ]);
    expect(
      harness.authorization.assertReadAllowedInTransaction,
    ).toHaveBeenCalledWith(Object.freeze({ workspaceId }), harness.manager);
  });

  it.each([
    [null, 'NOT_CONFIGURED'],
    ['Not/AZone', 'INVALID_STORED_TIME_ZONE'],
    [' utc ', 'INVALID_STORED_TIME_ZONE'],
  ] as const)(
    'blocks a stored %p timezone without a fallback',
    async (value, reason) => {
      const harness = createHarness({ workspaceRows: [workspaceRow(value)] });

      await expect(
        harness.service.readCampaignCapacityTimeZoneInTransaction(
          { workspaceId },
          harness.manager,
        ),
      ).resolves.toEqual({ status: 'BLOCKED', reason });
    },
  );

  it('uses exact case-sensitive shared IANA membership, including listed aliases', async () => {
    const aliasHarness = createHarness({
      workspaceRows: [workspaceRow('US/Eastern')],
    });
    await expect(
      aliasHarness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId },
        aliasHarness.manager,
      ),
    ).resolves.toMatchObject({
      status: 'CONFIGURED',
      campaignCapacityTimeZone: 'US/Eastern',
    });

    const caseHarness = createHarness({
      workspaceRows: [workspaceRow('us/eastern')],
    });
    await expect(
      caseHarness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId },
        caseHarness.manager,
      ),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'INVALID_STORED_TIME_ZONE',
    });
  });

  it.each([
    ['zero', []],
    ['duplicate', [workspaceRow(), workspaceRow()]],
    ['scope-mismatched', [{ ...workspaceRow(), id: otherWorkspaceId }]],
    ['extra-key', [{ ...workspaceRow(), extra: true }]],
  ])('fails a %s Workspace lock closed', async (_name, workspaceRows) => {
    const harness = createHarness({ workspaceRows });

    await expect(
      harness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId },
        harness.manager,
      ),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'WORKSPACE_SCOPE_UNAVAILABLE',
    });
  });

  it.each([
    ['missing', null],
    ['inactive', { isTransactionActive: false, isReleased: false }],
    ['released', { isTransactionActive: true, isReleased: true }],
    [
      'manager-mismatched',
      {
        isTransactionActive: true,
        isReleased: false,
        manager: {} as EntityManager,
      },
    ],
  ])('rejects a %s caller-owned query runner', async (_name, queryRunner) => {
    const harness = createHarness({ queryRunner });

    await expect(
      harness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId },
        harness.manager,
      ),
    ).rejects.toThrow('active caller-owned transaction manager');
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('rejects proxy and accessor inputs without invoking traps or getters', async () => {
    let trapCalls = 0;
    let getterCalls = 0;
    const harness = createHarness();
    const proxyInput = new Proxy(
      { workspaceId },
      {
        ownKeys: () => {
          trapCalls += 1;
          return ['workspaceId'];
        },
      },
    );
    const accessorInput = Object.defineProperty({}, 'workspaceId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return workspaceId;
      },
    });

    await expect(
      harness.service.readCampaignCapacityTimeZoneInTransaction(
        proxyInput,
        harness.manager,
      ),
    ).rejects.toThrow('Workspace capacity timezone read input was invalid');
    await expect(
      harness.service.readCampaignCapacityTimeZoneInTransaction(
        accessorInput as { workspaceId: string },
        harness.manager,
      ),
    ).rejects.toThrow('Workspace capacity timezone read input was invalid');

    expect(trapCalls).toBe(0);
    expect(getterCalls).toBe(0);
    expect(
      harness.authorization.assertReadAllowedInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('detaches and freezes mutation input before the authorization await', async () => {
    const harness = createHarness();
    let releaseAuthorization!: () => void;
    const authorizationGate = new Promise<void>((resolve) => {
      releaseAuthorization = resolve;
    });
    jest
      .mocked(harness.authorization.assertMutationAllowedInTransaction)
      .mockImplementationOnce(async (authorizedInput) => {
        expect(Object.isFrozen(authorizedInput)).toBe(true);
        await authorizationGate;
        expect(authorizedInput).toEqual({
          workspaceId,
          campaignCapacityTimeZone: 'America/New_York',
        });
      });
    const input = {
      workspaceId,
      campaignCapacityTimeZone: 'America/New_York' as string | null,
    };

    const result = harness.service.setCampaignCapacityTimeZoneInTransaction(
      input,
      harness.manager,
    );
    input.campaignCapacityTimeZone = 'Europe/Paris';
    releaseAuthorization();

    await expect(result).resolves.toEqual({
      status: 'UPDATED',
      campaignCapacityTimeZone: 'America/New_York',
    });
    expect(harness.query).toHaveBeenLastCalledWith(
      WORKSPACE_UPDATE_SQL,
      [workspaceId, 'America/New_York', 'UTC'],
      true,
    );
  });

  it('rejects non-canonical scope and unsupported mutation values before authorization', async () => {
    const harness = createHarness();

    await expect(
      harness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
        harness.manager,
      ),
    ).rejects.toThrow('Workspace capacity timezone read input was invalid');
    await expect(
      harness.service.setCampaignCapacityTimeZoneInTransaction(
        { workspaceId, campaignCapacityTimeZone: 'America/New_York ' },
        harness.manager,
      ),
    ).rejects.toThrow('Workspace capacity timezone mutation input was invalid');
    expect(
      harness.authorization.assertReadAllowedInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.authorization.assertMutationAllowedInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('orders mutation authorization → Workspace lock → metadata proof → exhaustive scan → structured update', async () => {
    const harness = createHarness({
      campaignRows: [
        campaignRow(campaignId, 'DRAFT'),
        campaignRow(secondCampaignId, 'COMPLETED'),
      ],
    });

    await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
      status: 'UPDATED',
      campaignCapacityTimeZone: 'America/New_York',
    });

    expect(harness.order).toEqual([
      'mutation-authorization',
      'workspace-lock',
      'campaign-metadata',
      'campaign-scan',
      'workspace-update:true',
    ]);
    expect(harness.query).toHaveBeenNthCalledWith(2, CAMPAIGN_METADATA_SQL, [
      schemaName,
    ]);
    expect(harness.query).toHaveBeenNthCalledWith(3, CAMPAIGN_SCAN_SQL, []);
    expect(harness.query).toHaveBeenNthCalledWith(
      4,
      WORKSPACE_UPDATE_SQL,
      [workspaceId, 'America/New_York', 'UTC'],
      true,
    );
    expect(
      harness.authorization.assertMutationAllowedInTransaction,
    ).toHaveBeenCalledWith(
      Object.freeze({
        workspaceId,
        campaignCapacityTimeZone: 'America/New_York',
      }),
      harness.manager,
    );
  });

  it.each([
    ['same configured value', 'UTC', 'UTC'],
    ['null to null', null, null],
  ] as const)(
    'returns UNCHANGED with no write for %s after the complete scan',
    async (_name, existingValue, requestedValue) => {
      const harness = createHarness({
        workspaceRows: [workspaceRow(existingValue)],
      });

      await expect(setTimeZone(harness, requestedValue)).resolves.toEqual({
        status: 'UNCHANGED',
        campaignCapacityTimeZone: requestedValue,
      });
      expect(harness.order).toEqual([
        'mutation-authorization',
        'workspace-lock',
        'campaign-metadata',
        'campaign-scan',
      ]);
    },
  );

  it('permits an explicitly authorized configured-to-null clear after the complete inactive scan', async () => {
    const harness = createHarness({
      updateResult: {
        affected: 1,
        records: [workspaceRow(null)],
      },
    });

    await expect(setTimeZone(harness, null)).resolves.toEqual({
      status: 'UPDATED',
      campaignCapacityTimeZone: null,
    });
    expect(harness.query).toHaveBeenLastCalledWith(
      WORKSPACE_UPDATE_SQL,
      [workspaceId, null, 'UTC'],
      true,
    );
  });

  it('rejects every hidden ACTIVE Campaign generically after inspecting the complete unfiltered result', async () => {
    const harness = createHarness({
      campaignRows: [
        campaignRow(campaignId, 'PAUSED'),
        campaignRow(secondCampaignId, 'ACTIVE'),
      ],
    });

    await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'ACTIVE_CAMPAIGN_EXISTS',
    });
    expect(harness.order).toEqual([
      'mutation-authorization',
      'workspace-lock',
      'campaign-metadata',
      'campaign-scan',
    ]);
    expect(CAMPAIGN_SCAN_SQL).toContain('WHERE "deletedAt" IS NULL');
    expect(CAMPAIGN_SCAN_SQL).not.toContain('permission');
  });

  it('blocks a missing mutation Workspace scope before metadata or write', async () => {
    const harness = createHarness({ workspaceRows: [] });

    await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'WORKSPACE_SCOPE_UNAVAILABLE',
    });
    expect(harness.order).toEqual(['mutation-authorization', 'workspace-lock']);
  });

  it.each([
    ['missing metadata', []],
    ['duplicate metadata', [metadataRow(), metadataRow()]],
    ['incomplete columns', [{ ...metadataRow(), requiredColumnCount: 2 }]],
    ['row security', [{ ...metadataRow(), rowSecurityEnabled: true }]],
    [
      'forced row security',
      [{ ...metadataRow(), forceRowSecurityEnabled: true }],
    ],
    ['unsupported relation', [{ ...metadataRow(), relationKind: 'v' }]],
  ])(
    'blocks %s proof before the Campaign scan',
    async (_name, metadataRows) => {
      const harness = createHarness({ metadataRows });

      await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_SCAN_INCOMPLETE',
      });
      expect(harness.order).toEqual([
        'mutation-authorization',
        'workspace-lock',
        'campaign-metadata',
      ]);
    },
  );

  it('blocks metadata proof proxies without invoking traps', async () => {
    let trapCalls = 0;
    const harness = createHarness({
      metadataRows: new Proxy([metadataRow()], {
        ownKeys: () => {
          trapCalls += 1;
          return ['0', 'length'];
        },
      }),
    });

    await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CAMPAIGN_SCAN_INCOMPLETE',
    });
    expect(trapCalls).toBe(0);
    expect(harness.order).not.toContain('campaign-scan');
  });

  it.each([
    ['duplicate Campaign', [campaignRow(), campaignRow()]],
    ['unknown lifecycle', [campaignRow(campaignId, 'STOPPED')]],
    ['scope-shaped extra data', [{ ...campaignRow(), hidden: true }]],
  ])('blocks a %s result with no update', async (_name, campaignRows) => {
    const harness = createHarness({ campaignRows });

    await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CAMPAIGN_SCAN_INCOMPLETE',
    });
    expect(harness.order).not.toContain('workspace-update:true');
  });

  it('rejects Campaign result proxies and accessors without invoking them', async () => {
    let trapCalls = 0;
    let getterCalls = 0;
    const proxiedRows = new Proxy([campaignRow()], {
      ownKeys: () => {
        trapCalls += 1;
        return ['0', 'length'];
      },
    });
    const accessorRow = Object.defineProperty(
      { id: campaignId },
      'lifecycleStatus',
      {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return 'PAUSED';
        },
      },
    );

    for (const campaignRows of [proxiedRows, [accessorRow]]) {
      const harness = createHarness({ campaignRows });
      await expect(setTimeZone(harness, 'America/New_York')).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_SCAN_INCOMPLETE',
      });
      expect(harness.order).not.toContain('workspace-update:true');
    }

    expect(trapCalls).toBe(0);
    expect(getterCalls).toBe(0);
  });

  it.each([
    ['zero affected', { affected: 0, records: [] }],
    [
      'duplicate returned rows',
      {
        affected: 1,
        records: [
          workspaceRow('America/New_York'),
          workspaceRow('America/New_York'),
        ],
      },
    ],
    [
      'mismatched returned value',
      { affected: 1, records: [workspaceRow('UTC')] },
    ],
  ])(
    'rejects a malformed structured update: %s',
    async (_name, updateResult) => {
      const harness = createHarness({ updateResult });

      await expect(setTimeZone(harness, 'America/New_York')).rejects.toThrow(
        'Workspace capacity timezone update was inconsistent',
      );
    },
  );

  it('rejects structured update proxies and accessors without invoking them', async () => {
    let trapCalls = 0;
    let getterCalls = 0;
    const proxyResult = new Proxy(
      { affected: 1, records: [workspaceRow('America/New_York')] },
      {
        ownKeys: () => {
          trapCalls += 1;
          return ['affected', 'records'];
        },
      },
    );
    const accessorResult = Object.defineProperty({ affected: 1 }, 'records', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return [workspaceRow('America/New_York')];
      },
    });

    for (const updateResult of [proxyResult, accessorResult]) {
      const harness = createHarness({ updateResult });
      await expect(setTimeZone(harness, 'America/New_York')).rejects.toThrow(
        'Workspace capacity timezone update was inconsistent',
      );
    }

    expect(trapCalls).toBe(0);
    expect(getterCalls).toBe(0);
  });

  it('supplies the exact caller-owned manager to both operation-specific authorizers', async () => {
    const harness = createHarness();

    await harness.service.readCampaignCapacityTimeZoneInTransaction(
      { workspaceId },
      harness.manager,
    );
    await setTimeZone(harness, 'UTC');

    expect(
      harness.authorization.assertReadAllowedInTransaction,
    ).toHaveBeenCalledWith(Object.freeze({ workspaceId }), harness.manager);
    expect(
      harness.authorization.assertMutationAllowedInTransaction,
    ).toHaveBeenCalledWith(
      Object.freeze({ workspaceId, campaignCapacityTimeZone: 'UTC' }),
      harness.manager,
    );
  });

  it('propagates operation-specific authorization denial with zero SQL', async () => {
    const readDenied = new Error('read denied');
    const readHarness = createHarness({ readAuthorizationError: readDenied });
    await expect(
      readHarness.service.readCampaignCapacityTimeZoneInTransaction(
        { workspaceId },
        readHarness.manager,
      ),
    ).rejects.toBe(readDenied);
    expect(readHarness.query).not.toHaveBeenCalled();

    const mutationDenied = new Error('mutation denied');
    const mutationHarness = createHarness({
      mutationAuthorizationError: mutationDenied,
    });
    await expect(setTimeZone(mutationHarness, 'America/New_York')).rejects.toBe(
      mutationDenied,
    );
    expect(mutationHarness.query).not.toHaveBeenCalled();
  });

  it('exposes no transaction, datasource, context, or repository acquisition surface', () => {
    expect(
      Object.getOwnPropertyNames(
        WorkspaceCampaignCapacityTimeZoneService.prototype,
      ),
    ).toEqual([
      'constructor',
      'readCampaignCapacityTimeZoneInTransaction',
      'setCampaignCapacityTimeZoneInTransaction',
    ]);
  });
});

describe('WorkspaceCampaignCapacityTimeZoneModule', () => {
  it('injects the registered authorization port into the timezone service', () => {
    const dependencies = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      WorkspaceCampaignCapacityTimeZoneService,
    ) as Array<{ index: number; param: unknown }> | undefined;

    expect(dependencies?.find(({ index }) => index === 0)?.param).toBe(
      WorkspaceCampaignCapacityTimeZoneAuthorizationPort,
    );
  });

  it('exports the configured trusted read-only timezone leaf', () => {
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        WorkspaceCampaignCapacityTimeZoneModule,
      ) ?? [],
    ).toEqual([]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        WorkspaceCampaignCapacityTimeZoneModule,
      ) ?? [],
    ).toEqual([
      WorkspaceCampaignCapacityTimeZoneAuthorizationService,
      {
        provide: WorkspaceCampaignCapacityTimeZoneAuthorizationPort,
        useExisting: WorkspaceCampaignCapacityTimeZoneAuthorizationService,
      },
      WorkspaceCampaignCapacityTimeZoneService,
    ]);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        WorkspaceCampaignCapacityTimeZoneModule,
      ) ?? [],
    ).toEqual([WorkspaceCampaignCapacityTimeZoneService]);
  });
});
