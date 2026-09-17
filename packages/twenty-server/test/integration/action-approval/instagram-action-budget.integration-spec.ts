import { Client, Pool, type PoolClient } from 'pg';
import { type EntityManager } from 'typeorm';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { buildLegacyInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { InstagramActionLimitBlockEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-limit-block.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';

jest.setTimeout(90_000);

const workspaceId = '90000000-0000-4000-8000-000000000309';
const workspaceCustomApplicationId = '90000000-0000-4000-8000-000000003090';
const instagramAccountRecordId = '90000000-0000-4000-8000-000000003091';
const fingerprint = (value: number) => value.toString(16).padStart(64, '0');
const fixtureId = (value: number) =>
  `90000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
type AdapterFindOneOptions = {
  lock?: unknown;
  where: Record<string, unknown>;
};

const createTransactionManager = (client: PoolClient): EntityManager => {
  const query = <T>(statement: string, parameters: unknown[] = []) =>
    client.query(statement, parameters).then((result) => result.rows as T[]);
  const findOne = async (
    target: unknown,
    options: AdapterFindOneOptions,
  ): Promise<unknown> => {
    const lock = options.lock ? ' FOR UPDATE' : '';
    const { where } = options;

    if (target === ActionExecutionReceiptEntity) {
      const rows = await query<ActionExecutionReceiptEntity>(
        `SELECT "id", "workspaceId", "state", "providerCode", "redactedOutcome"
         FROM core."actionExecutionReceipt"
         WHERE "id" = $1 AND "workspaceId" = $2
         LIMIT 1${lock}`,
        [where.id, where.workspaceId],
      );

      return rows[0] ?? null;
    }

    if (target === InstagramActionLimitBlockEntity) {
      const rows = await query<InstagramActionLimitBlockEntity>(
        `SELECT
           "id",
           "workspaceId",
           "instagramAccountRecordId",
           "actionExecutionReceiptId",
           "errorCode",
           "hourlyUsed",
           "hourlyLimit",
           "hourlyRemaining",
           "dailyUsed",
           "dailyLimit",
           "dailyRemaining",
           "blockedWindows",
           "nextEligibleAt"
         FROM core."instagramActionLimitBlock"
         WHERE "actionExecutionReceiptId" = $1 AND "workspaceId" = $2
         LIMIT 1${lock}`,
        [where.actionExecutionReceiptId, where.workspaceId],
      );

      return rows[0] ?? null;
    }

    if (target === InstagramActionReservationEntity) {
      const selectReservation = async (
        condition: string,
        parameters: unknown[],
      ) => {
        const rows = await query<InstagramActionReservationEntity>(
          `SELECT
             "id",
             "workspaceId",
             "instagramAccountRecordId",
             "actionExecutionReceiptId",
             "actionKind",
             "targetFingerprint",
             "reservedAt",
             "providerAttemptedAt",
             "releasedAt",
             "releaseReason",
             "targetLockReleasedAt"
           FROM core."instagramActionReservation"
           WHERE ${condition}
           LIMIT 1${lock}`,
          parameters,
        );

        return rows[0] ?? null;
      };

      if (where.actionExecutionReceiptId) {
        return selectReservation(
          '"actionExecutionReceiptId" = $1 AND "workspaceId" = $2',
          [where.actionExecutionReceiptId, where.workspaceId],
        );
      }
      if (where.id) {
        return selectReservation('"id" = $1 AND "workspaceId" = $2', [
          where.id,
          where.workspaceId,
        ]);
      }

      return selectReservation(
        `"actionKind" = $1
         AND "instagramAccountRecordId" = $2
         AND "targetFingerprint" = $3
         AND "targetLockReleasedAt" IS NULL
         AND "workspaceId" = $4`,
        [
          where.actionKind,
          where.instagramAccountRecordId,
          where.targetFingerprint,
          where.workspaceId,
        ],
      );
    }

    throw new Error('Unsupported transaction entity');
  };
  const save = async (target: unknown, entity: unknown): Promise<unknown> => {
    if (target === ActionExecutionReceiptEntity) {
      const receipt = entity as ActionExecutionReceiptEntity;

      await query(
        `UPDATE core."actionExecutionReceipt"
         SET
           "state" = $1,
           "providerCode" = $2,
           "redactedOutcome" = $3,
           "updatedAt" = now()
         WHERE "id" = $4 AND "workspaceId" = $5`,
        [
          receipt.state,
          receipt.providerCode,
          receipt.redactedOutcome,
          receipt.id,
          receipt.workspaceId,
        ],
      );

      return receipt;
    }

    if (target === InstagramActionReservationEntity) {
      const reservation = entity as InstagramActionReservationEntity;

      await query(
        `INSERT INTO core."instagramActionReservation" (
           "id",
           "workspaceId",
           "instagramAccountRecordId",
           "actionExecutionReceiptId",
           "actionKind",
           "targetFingerprint",
           "reservedAt",
           "providerAttemptedAt",
           "releasedAt",
           "releaseReason",
           "targetLockReleasedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT ("id") DO UPDATE SET
           "providerAttemptedAt" = EXCLUDED."providerAttemptedAt",
           "releasedAt" = EXCLUDED."releasedAt",
           "releaseReason" = EXCLUDED."releaseReason",
           "targetLockReleasedAt" = EXCLUDED."targetLockReleasedAt",
           "updatedAt" = now()`,
        [
          reservation.id,
          reservation.workspaceId,
          reservation.instagramAccountRecordId,
          reservation.actionExecutionReceiptId,
          reservation.actionKind,
          reservation.targetFingerprint,
          reservation.reservedAt,
          reservation.providerAttemptedAt,
          reservation.releasedAt,
          reservation.releaseReason,
          reservation.targetLockReleasedAt,
        ],
      );

      return reservation;
    }

    if (target === InstagramActionLimitBlockEntity) {
      const block = entity as InstagramActionLimitBlockEntity;

      await query(
        `INSERT INTO core."instagramActionLimitBlock" (
           "id",
           "workspaceId",
           "instagramAccountRecordId",
           "actionExecutionReceiptId",
           "errorCode",
           "hourlyUsed",
           "hourlyLimit",
           "hourlyRemaining",
           "dailyUsed",
           "dailyLimit",
           "dailyRemaining",
           "blockedWindows",
           "nextEligibleAt"
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         )`,
        [
          block.id,
          block.workspaceId,
          block.instagramAccountRecordId,
          block.actionExecutionReceiptId,
          block.errorCode,
          block.hourlyUsed,
          block.hourlyLimit,
          block.hourlyRemaining,
          block.dailyUsed,
          block.dailyLimit,
          block.dailyRemaining,
          block.blockedWindows,
          block.nextEligibleAt,
        ],
      );

      return block;
    }

    throw new Error('Unsupported transaction entity');
  };

  return {
    create: (target: unknown, values: Record<string, unknown>) => {
      if (
        target === ActionExecutionReceiptEntity ||
        target === InstagramActionReservationEntity ||
        target === InstagramActionLimitBlockEntity
      ) {
        return values;
      }

      throw new Error('Unsupported transaction entity');
    },
    findOne,
    query,
    save,
  } as unknown as EntityManager;
};

const createTransactionAdapter = (transactionPool: Pool) => ({
  transaction: async <T>(
    runInTransaction: (manager: EntityManager) => Promise<T>,
  ): Promise<T> => {
    const client = await transactionPool.connect();

    try {
      await client.query('BEGIN');
      const result = await runInTransaction(createTransactionManager(client));

      await client.query('COMMIT');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
});

describe('InstagramActionBudgetService (PostgreSQL)', () => {
  let setupClient: Client;
  let transactionPool: Pool;
  let service: InstagramActionBudgetService;
  let createdWorkspace = false;
  let dbNow: Date;
  const setupQuery = <T>(statement: string, parameters: unknown[] = []) =>
    setupClient
      .query(statement, parameters)
      .then((result) => result.rows as T[]);

  const getDatabaseNow = async (): Promise<Date> => {
    const [{ dbNow: value }] = await setupQuery<{ dbNow: Date | string }>(
      'SELECT clock_timestamp() AS "dbNow"',
    );

    return value instanceof Date ? value : new Date(value);
  };

  const cleanWorkspaceRows = async () => {
    await setupQuery(
      'DELETE FROM core."instagramActionLimitBlock" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await setupQuery(
      'DELETE FROM core."instagramActionReservation" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await setupQuery(
      'DELETE FROM core."actionExecutionReceipt" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await setupQuery(
      `DELETE FROM core."actionApprovalBindingEvidenceLink"
       WHERE "actionApprovalBindingId" IN (
         SELECT "id"
         FROM core."actionApprovalBinding"
         WHERE "workspaceId" = $1
       )`,
      [workspaceId],
    );
    await setupQuery(
      'DELETE FROM core."actionApprovalBinding" WHERE "workspaceId" = $1',
      [workspaceId],
    );
  };

  const insertProcessingReceipt = async (sequence: number) => {
    const bindingId = fixtureId(sequence);
    const receiptId = fixtureId(10_000 + sequence);

    await setupQuery(
      `INSERT INTO core."actionApprovalBinding" (
        "id",
        "workspaceId",
        "initiatorUserWorkspaceId",
        "actionName",
        "actionVersion",
        "draftId",
        "contentDigest",
        "recipientFingerprint",
        "sendingAccountFingerprint",
        "threadId",
        "state",
        "expiresAt"
      ) VALUES (
        $1, $2, $3, 'send_instagram_message', 2, $4, $5, $6, $7, $8,
        'APPROVED', $9
      )`,
      [
        bindingId,
        workspaceId,
        fixtureId(20_000 + sequence),
        fixtureId(30_000 + sequence),
        fingerprint(sequence),
        fingerprint(40_000 + sequence),
        fingerprint(50_000 + sequence),
        fixtureId(60_000 + sequence),
        new Date(dbNow.getTime() + 24 * 60 * 60 * 1000),
      ],
    );
    await setupQuery(
      `INSERT INTO core."actionExecutionReceipt" (
        "id",
        "workspaceId",
        "actionApprovalBindingId",
        "idempotencyKey",
        "state"
      ) VALUES ($1, $2, $3, $4, 'PROCESSING')`,
      [receiptId, workspaceId, bindingId, fingerprint(70_000 + sequence)],
    );

    return receiptId;
  };

  const insertActiveReservation = async ({
    accountId,
    receiptId,
    reservedAt,
    sequence,
  }: {
    accountId: string;
    receiptId: string;
    reservedAt: Date;
    sequence: number;
  }) => {
    await setupQuery(
      `INSERT INTO core."instagramActionReservation" (
        "id",
        "workspaceId",
        "instagramAccountRecordId",
        "actionExecutionReceiptId",
        "actionKind",
        "targetFingerprint",
        "reservedAt"
      ) VALUES ($1, $2, $3, $4, 'REPLY', $5, $6)`,
      [
        fixtureId(80_000 + sequence),
        workspaceId,
        accountId,
        receiptId,
        fingerprint(90_000 + sequence),
        reservedAt,
      ],
    );
  };

  const seedReservations = async ({
    accountId,
    count,
    reservedAt,
    sequenceOffset,
  }: {
    accountId: string;
    count: number;
    reservedAt: Date;
    sequenceOffset: number;
  }) => {
    for (let index = 0; index < count; index++) {
      const sequence = sequenceOffset + index;
      const receiptId = await insertProcessingReceipt(sequence);

      await insertActiveReservation({
        accountId,
        receiptId,
        reservedAt,
        sequence,
      });
    }
  };

  beforeAll(async () => {
    setupClient = new Client({
      connectionString: process.env.PG_DATABASE_URL,
    });
    await setupClient.connect();

    const [workspace] = await setupQuery<{ id: string }>(
      'SELECT "id" FROM core."workspace" WHERE "id" = $1',
      [workspaceId],
    );
    if (!workspace) {
      try {
        await setupClient.query('BEGIN');
        await setupClient.query('SET CONSTRAINTS ALL DEFERRED');
        await setupClient.query(
          `INSERT INTO core."workspace" (
            "id", "displayName", "subdomain", "workspaceCustomApplicationId",
            "activationStatus"
          ) VALUES (
            $1, 'Instagram action budget integration', $2, $3,
            'PENDING_CREATION'
          )`,
          [
            workspaceId,
            'instagram-action-budget-integration',
            workspaceCustomApplicationId,
          ],
        );
        await setupClient.query(
          `INSERT INTO core."application" (
            "id", "universalIdentifier", "name", "sourcePath", "workspaceId"
          ) VALUES ($1, $1, 'instagram-action-budget-integration', '', $2)`,
          [workspaceCustomApplicationId, workspaceId],
        );
        await setupClient.query('COMMIT');
        createdWorkspace = true;
      } catch (error) {
        await setupClient.query('ROLLBACK');
        throw error;
      }
    }

    const [{ exists }] = await setupQuery<{ exists: boolean }>(
      `SELECT
        to_regclass('core."instagramActionReservation"') IS NOT NULL
        AND to_regclass('core."instagramActionLimitBlock"') IS NOT NULL
        AS "exists"`,
    );

    expect(exists).toBe(true);
  });

  beforeEach(async () => {
    await cleanWorkspaceRows();
    transactionPool = new Pool({
      connectionString: process.env.PG_DATABASE_URL,
      max: 5,
    });
    service = new InstagramActionBudgetService(
      createTransactionAdapter(transactionPool) as never,
    );
    dbNow = await getDatabaseNow();
  });

  afterEach(async () => {
    await transactionPool.end();
  });

  afterAll(async () => {
    await cleanWorkspaceRows();
    if (createdWorkspace) {
      try {
        await setupClient.query('BEGIN');
        await setupClient.query('SET CONSTRAINTS ALL DEFERRED');
        await setupClient.query(
          'DELETE FROM core."workspace" WHERE "id" = $1',
          [workspaceId],
        );
        await setupClient.query(
          'DELETE FROM core."application" WHERE "id" = $1',
          [workspaceCustomApplicationId],
        );
        await setupClient.query('COMMIT');
      } catch (error) {
        await setupClient.query('ROLLBACK');
        throw error;
      }
    }
    await setupClient.end();
  });

  it('allows exactly one concurrent tenth reply reservation and blocks the other', async () => {
    await seedReservations({
      accountId: instagramAccountRecordId,
      count: 9,
      reservedAt: new Date(dbNow.getTime() - 30 * 60 * 1000),
      sequenceOffset: 1,
    });
    const firstReceiptId = await insertProcessingReceipt(10);
    const secondReceiptId = await insertProcessingReceipt(11);

    const results = await Promise.all([
      service.reserve({
        workspaceId,
        instagramAccountRecordId,
        actionExecutionReceiptId: firstReceiptId,
        actionKind: 'REPLY',
        targetFingerprint: fingerprint(1_001),
      }),
      service.reserve({
        workspaceId,
        instagramAccountRecordId,
        actionExecutionReceiptId: secondReceiptId,
        actionKind: 'REPLY',
        targetFingerprint: fingerprint(1_002),
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'BLOCKED',
      'RESERVED',
    ]);
    const [{ activeCount }] = await setupQuery<{ activeCount: string }>(
      `SELECT COUNT(*) AS "activeCount"
       FROM core."instagramActionReservation"
       WHERE "workspaceId" = $1
         AND "instagramAccountRecordId" = $2
         AND "releasedAt" IS NULL`,
      [workspaceId, instagramAccountRecordId],
    );
    expect(Number(activeCount)).toBe(10);
    const blocks = await setupQuery<{
      blockedWindows: string[];
      state: ActionExecutionReceiptState;
    }>(
      `SELECT receipt."state", block."blockedWindows"
       FROM core."instagramActionLimitBlock" AS block
       INNER JOIN core."actionExecutionReceipt" AS receipt
         ON receipt."id" = block."actionExecutionReceiptId"
       WHERE block."workspaceId" = $1`,
      [workspaceId],
    );
    expect(blocks).toEqual([
      {
        blockedWindows: ['HOURLY'],
        state: ActionExecutionReceiptState.BLOCKED,
      },
    ]);
  });

  it('blocks the 101st action on the daily window with the exact next eligible time', async () => {
    const oldestReservedAt = new Date(dbNow.getTime() - 2 * 60 * 60 * 1000);

    await seedReservations({
      accountId: instagramAccountRecordId,
      count: 100,
      reservedAt: oldestReservedAt,
      sequenceOffset: 100,
    });
    const receiptId = await insertProcessingReceipt(201);

    const result = await service.reserve({
      workspaceId,
      instagramAccountRecordId,
      actionExecutionReceiptId: receiptId,
      actionKind: 'REPLY',
      targetFingerprint: fingerprint(2_001),
    });

    expect(result).toMatchObject({
      status: 'BLOCKED',
      blockedWindows: ['DAILY'],
      hourlyUsed: 0,
      dailyUsed: 100,
      nextEligibleAt: new Date(
        oldestReservedAt.getTime() + 24 * 60 * 60 * 1000,
      ),
    });
  });

  it('holds a START_CHAT target once across simultaneous receipts', async () => {
    const firstReceiptId = await insertProcessingReceipt(300);
    const secondReceiptId = await insertProcessingReceipt(301);
    const targetFingerprint = fingerprint(3_001);

    const results = await Promise.allSettled([
      service.reserve({
        workspaceId,
        instagramAccountRecordId,
        actionExecutionReceiptId: firstReceiptId,
        actionKind: 'START_CHAT',
        targetFingerprint,
      }),
      service.reserve({
        workspaceId,
        instagramAccountRecordId,
        actionExecutionReceiptId: secondReceiptId,
        actionKind: 'START_CHAT',
        targetFingerprint,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const [{ targetCount }] = await setupQuery<{ targetCount: string }>(
      `SELECT COUNT(*) AS "targetCount"
       FROM core."instagramActionReservation"
       WHERE "workspaceId" = $1
         AND "instagramAccountRecordId" = $2
         AND "actionKind" = 'START_CHAT'
         AND "targetFingerprint" = $3
         AND "targetLockReleasedAt" IS NULL`,
      [workspaceId, instagramAccountRecordId, targetFingerprint],
    );
    expect(Number(targetCount)).toBe(1);
  });

  it('rejects concurrent approved START_CHAT drafts without a provider call', async () => {
    const firstReceiptId = await insertProcessingReceipt(500);
    const secondReceiptId = await insertProcessingReceipt(501);
    const approvalIds = [fixtureId(10_500), fixtureId(10_501)];
    const authorities = approvalIds.map((_, index) =>
      buildLegacyInstagramMessageActionAuthority({
        workspaceId,
        initiatorUserWorkspaceId: fixtureId(20_500),
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: fixtureId(30_500 + index),
        draft: {
          id: fixtureId(30_500 + index),
          revision: 1,
          body: `Distinct approved first message ${index}`,
          kind: 'START_CHAT',
          creatorRecordId: fixtureId(40_500),
          recipientUsername: 'same.creator',
          recipientSourceValues: [
            { field: 'instagramUsername', value: 'same.creator' },
          ],
          conversationRecordId: null,
          providerConversationId: null,
          recipientProviderId: 'same-creator-provider-id',
        },
        account: {
          bindingId: fixtureId(50_500),
          workspaceInstagramAccountRecordId: instagramAccountRecordId,
          unipileAccountId: 'provider-account',
          instagramUserId: 'brand-user',
        },
        evidenceLinks: [],
      }),
    );
    const receiptIdByApprovalId = new Map([
      [approvalIds[0], firstReceiptId],
      [approvalIds[1], secondReceiptId],
    ]);
    const authorityByApprovalId = new Map([
      [approvalIds[0], authorities[0]],
      [approvalIds[1], authorities[1]],
    ]);
    const actionApprovalService = {
      getApprovedBinding: jest.fn(
        async ({ approvalBindingId }) =>
          authorityByApprovalId.get(approvalBindingId)!.expectedActionBinding,
      ),
      findExecutionReceiptForBinding: jest.fn().mockResolvedValue(null),
      reserveExecutionForBinding: jest.fn(async ({ approvalBindingId }) => ({
        created: true,
        receipt: {
          id: receiptIdByApprovalId.get(approvalBindingId)!,
          state: ActionExecutionReceiptState.PROCESSING,
        },
      })),
      recordProviderAccepted: jest.fn().mockResolvedValue(undefined),
      recordProviderTerminalState: jest.fn().mockResolvedValue(undefined),
    };
    const authorityReader = {
      rebuildExecutionAuthority: jest.fn(async ({ binding }) =>
        authorities.find(
          ({ expectedActionBinding }) =>
            expectedActionBinding.draftId === binding.draftId,
        ),
      ),
      assertReadyAfterReservation: jest.fn().mockResolvedValue(undefined),
    };
    const providerCalls = jest.fn(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'ACCEPTED',
        value: { chatId: 'provider-chat', messageId: 'provider-message' },
      };
    });
    const budgetForSend = {
      reserve: service.reserve.bind(service),
      markProviderAttempted: jest.fn().mockResolvedValue(undefined),
      releasePreDispatch: jest.fn().mockResolvedValue(undefined),
      releaseStartTarget: jest.fn().mockResolvedValue(undefined),
      releaseStartTargetForReceipt: jest.fn().mockResolvedValue(undefined),
    };
    const sendService = new InstagramMessageSendService(
      actionApprovalService as never,
      authorityReader as never,
      {
        withLock: async (_input: unknown, operation: () => Promise<unknown>) =>
          operation(),
      } as never,
      budgetForSend as never,
      { startChat: providerCalls, sendMessage: jest.fn() } as never,
      {
        projectReceiptWithWriter: jest.fn().mockResolvedValue({
          projected: true,
        }),
      } as never,
      { project: jest.fn() } as never,
      { assertCanSend: jest.fn().mockResolvedValue(undefined) } as never,
      {
        assertCanExecuteDraft: jest.fn().mockResolvedValue({
          draft: authorities[0].canonicalGraph.draft,
          instagramAccountRecordId,
        }),
      } as never,
    );
    const sendInput = (approvalBindingId: string) => ({
      workspaceId,
      initiatorUserWorkspaceId: fixtureId(20_500),
      approvalBindingId,
      threadId: null,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT' as const,
      interactionContextId:
        authorityByApprovalId.get(approvalBindingId)!.canonicalGraph.draft.id,
      rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
    });

    await Promise.all(
      approvalIds.map((approvalId) =>
        expect(
          sendService.executeApproved(sendInput(approvalId)),
        ).rejects.toThrow('Instagram first-contact sending is unavailable'),
      ),
    );

    expect(
      actionApprovalService.reserveExecutionForBinding,
    ).not.toHaveBeenCalled();
    expect(providerCalls).not.toHaveBeenCalled();
  });
});
