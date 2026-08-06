import { randomUUID } from 'crypto';

import { type DataSource } from 'typeorm';

import { AddManagedEmailLifecycleFieldsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1786000000000-add-managed-email-lifecycle-fields';
import { CreateManagedEmailFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1785325829908-create-managed-email';
import { AddManagedEmailQuoteAndPersonaEvidenceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1785699702326-add-managed-email-quote-and-persona-evidence';
import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';

const WORKSPACE_A_ID = SEED_APPLE_WORKSPACE_ID;
const WORKSPACE_B_ID = SEED_YCOMBINATOR_WORKSPACE_ID;
const ACTOR_ID = '93000000-0000-4000-8000-000000000005';
const RATE_CARD_ID = '93000000-0000-4000-8000-000000000006';
const PRODUCT_IDS = [
  '93000000-0000-4000-8000-000000000010',
  '93000000-0000-4000-8000-000000000011',
  '93000000-0000-4000-8000-000000000012',
] as const;
const TEST_KEY_PREFIX = 'managed-email-integration:';
const PERIOD_START = '2026-08-06T12:00:00.000Z';
const PERIOD_END = '2026-09-06T12:00:00.000Z';

const buildOperation = ({
  workspaceId,
  idempotencyKey,
  state = 'PAYMENT_REQUIRED',
}: {
  workspaceId: string;
  idempotencyKey: string;
  state?: string;
}) => ({
  id: randomUUID(),
  workspaceId,
  idempotencyKey,
  acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
  providerConfigurationKey: 'integration-provider-v1',
  readinessPolicyVersion: 'integration-policy-v1',
  authorizedActorWorkspaceMemberId: ACTOR_ID,
  proposalHash: 'integration-proposal-hash',
  quoteHash: 'integration-quote-hash',
  resourceSnapshot: {
    proposal: {
      createdAt: PERIOD_START,
      expiresAt: PERIOD_END,
      policyVersion: 'integration-policy-v1',
    },
    domains: [
      {
        domain: 'managed-email-integration.test',
        mailboxes: ['sender@managed-email-integration.test'],
        providerQuote: {
          amountMinorUnits: 100,
          currency: 'USD',
          fingerprint: 'integration-provider-quote',
          observedAt: PERIOD_START,
          termCount: 1,
          termUnit: 'YEAR',
        },
      },
    ],
    personas: [
      {
        address: 'sender@managed-email-integration.test',
        createdByWorkspaceMemberId: ACTOR_ID,
        firstName: 'Integration',
        lastName: 'Sender',
        localPart: 'sender',
        roleTitle: null,
        signature: 'Integration Sender',
        version: 1,
      },
    ],
  },
  catalogVersion: 'integration-catalog-v1',
  metronomeRateCardId: RATE_CARD_ID,
  metronomeRateCardAlias: 'integration-rate-card',
  expectedLineItems: MANAGED_EMAIL_PRODUCT_DEFINITIONS.map(
    (definition, index) => ({
      currency: 'USD' as const,
      metronomeProductId: PRODUCT_IDS[index],
      periodEnd: PERIOD_END,
      periodStart: PERIOD_START,
      productKey: definition.key,
      productTag: definition.metronomeProductTag,
      quantity: 1,
      totalCents: 100,
      unitPriceCents: 100,
    }),
  ),
  expectedAmountCents: '300',
  currency: 'USD',
  servicePeriodStart: new Date(PERIOD_START),
  servicePeriodEnd: new Date(PERIOD_END),
  state,
  reconciliationAttemptCount: 0,
  nextReconciliationAt: null,
  nextSubscriptionReconciliationAt: null,
  safeFailureCode: null,
});

describe('Managed email persistence (PostgreSQL)', () => {
  let dataSource: DataSource;

  const ensureManagedEmailSchema = async () => {
    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('core."managedEmailAcquisitionOperation"') IS NOT NULL AS "exists"`,
    );

    if (exists) {
      return;
    }

    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    try {
      await new CreateManagedEmailFastInstanceCommand().up(queryRunner);
      await new AddManagedEmailQuoteAndPersonaEvidenceFastInstanceCommand().up(
        queryRunner,
      );
      await new AddManagedEmailLifecycleFieldsFastInstanceCommand().up(
        queryRunner,
      );
    } finally {
      await queryRunner.release();
    }
  };

  const insertOperation = async (
    operation: ReturnType<typeof buildOperation>,
  ) => {
    const rows = await dataSource.query<
      { id: string; state: string; workspaceId: string }[]
    >(
      `INSERT INTO core."managedEmailAcquisitionOperation" (
        "id",
        "workspaceId",
        "idempotencyKey",
        "acquisitionMode",
        "providerConfigurationKey",
        "readinessPolicyVersion",
        "authorizedActorWorkspaceMemberId",
        "proposalHash",
        "quoteHash",
        "resourceSnapshot",
        "catalogVersion",
        "metronomeRateCardId",
        "metronomeRateCardAlias",
        "expectedLineItems",
        "expectedAmountCents",
        "currency",
        "servicePeriodStart",
        "servicePeriodEnd",
        "state",
        "reconciliationAttemptCount"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
        $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19, $20
      )
      RETURNING "id", "workspaceId", "state"`,
      [
        operation.id,
        operation.workspaceId,
        operation.idempotencyKey,
        operation.acquisitionMode,
        operation.providerConfigurationKey,
        operation.readinessPolicyVersion,
        operation.authorizedActorWorkspaceMemberId,
        operation.proposalHash,
        operation.quoteHash,
        JSON.stringify(operation.resourceSnapshot),
        operation.catalogVersion,
        operation.metronomeRateCardId,
        operation.metronomeRateCardAlias,
        JSON.stringify(operation.expectedLineItems),
        operation.expectedAmountCents,
        operation.currency,
        operation.servicePeriodStart,
        operation.servicePeriodEnd,
        operation.state,
        operation.reconciliationAttemptCount,
      ],
    );
    const inserted = rows[0];

    if (inserted === undefined) {
      throw new Error('Managed email integration operation was not inserted');
    }

    return inserted;
  };

  beforeAll(async () => {
    dataSource = global.testDataSource;
    await ensureManagedEmailSchema();
  });

  beforeEach(async () => {
    await dataSource.query(
      `DELETE FROM core."managedEmailAcquisitionOperation"
       WHERE "idempotencyKey" LIKE $1`,
      [`${TEST_KEY_PREFIX}%`],
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(
      `DELETE FROM core."managedEmailAcquisitionOperation"
       WHERE "idempotencyKey" LIKE $1`,
      [`${TEST_KEY_PREFIX}%`],
    );
  });

  it('enforces one idempotency key per workspace under concurrent inserts', async () => {
    const idempotencyKey = `${TEST_KEY_PREFIX}same-workspace-race`;
    const writes = await Promise.allSettled([
      insertOperation(
        buildOperation({ workspaceId: WORKSPACE_A_ID, idempotencyKey }),
      ),
      insertOperation(
        buildOperation({ workspaceId: WORKSPACE_A_ID, idempotencyKey }),
      ),
    ]);
    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS "count"
       FROM core."managedEmailAcquisitionOperation"
       WHERE "workspaceId" = $1 AND "idempotencyKey" = $2`,
      [WORKSPACE_A_ID, idempotencyKey],
    );

    expect(writes.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(writes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('allows the same idempotency key in isolated workspaces', async () => {
    const idempotencyKey = `${TEST_KEY_PREFIX}cross-workspace`;

    await Promise.all([
      insertOperation(
        buildOperation({ workspaceId: WORKSPACE_A_ID, idempotencyKey }),
      ),
      insertOperation(
        buildOperation({ workspaceId: WORKSPACE_B_ID, idempotencyKey }),
      ),
    ]);
    const rows = await dataSource.query<{ workspaceId: string }[]>(
      `SELECT "workspaceId"
       FROM core."managedEmailAcquisitionOperation"
       WHERE "idempotencyKey" = $1
       ORDER BY "workspaceId"`,
      [idempotencyKey],
    );

    expect(rows).toEqual([
      { workspaceId: WORKSPACE_A_ID },
      { workspaceId: WORKSPACE_B_ID },
    ]);
  });

  it('lets exactly one worker claim reconciliation and denies another workspace', async () => {
    const operation = await insertOperation(
      buildOperation({
        workspaceId: WORKSPACE_A_ID,
        idempotencyKey: `${TEST_KEY_PREFIX}reconciliation-claim`,
        state: 'RECONCILIATION_REQUIRED',
      }),
    );
    const claim = async (workspaceId: string) => {
      const [, affected] = await dataSource.query<[{ id: string }[], number]>(
        `UPDATE core."managedEmailAcquisitionOperation"
         SET "state" = 'PROVIDER_SUCCEEDED', "updatedAt" = now()
         WHERE "id" = $1
           AND "workspaceId" = $2
           AND "state" = 'RECONCILIATION_REQUIRED'
         RETURNING "id"`,
        [operation.id, workspaceId],
      );

      return affected;
    };

    const [workspaceBClaim, ...workspaceAClaims] = await Promise.all([
      claim(WORKSPACE_B_ID),
      claim(WORKSPACE_A_ID),
      claim(WORKSPACE_A_ID),
    ]);
    const workspaceARows = await dataSource.query<{ state: string }[]>(
      `SELECT "state"
       FROM core."managedEmailAcquisitionOperation"
       WHERE "id" = $1 AND "workspaceId" = $2`,
      [operation.id, WORKSPACE_A_ID],
    );
    const workspaceBRows = await dataSource.query<{ state: string }[]>(
      `SELECT "state"
       FROM core."managedEmailAcquisitionOperation"
       WHERE "id" = $1 AND "workspaceId" = $2`,
      [operation.id, WORKSPACE_B_ID],
    );

    expect(workspaceBClaim).toBe(0);
    expect(workspaceAClaims.sort()).toEqual([0, 1]);
    expect(workspaceARows).toEqual([{ state: 'PROVIDER_SUCCEEDED' }]);
    expect(workspaceBRows).toHaveLength(0);
  });
});
