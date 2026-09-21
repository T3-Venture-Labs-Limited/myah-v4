import { ConnectedAccountProvider } from 'twenty-shared/types';
import { DataSource, type EntityManager, type QueryRunner } from 'typeorm';

import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { CampaignMessageMaterializerService } from 'src/modules/myah-outreach/services/campaign-message-materializer.service';
import { CampaignMessageRenderService } from 'src/modules/myah-outreach/services/campaign-message-render.service';
import { type CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';

jest.mock(
  'src/engine/core-modules/tool/tools/email-tool/utils/render-rich-text-to-html.util',
  () => ({
    renderRichTextToHtml: jest.fn(
      async (document: unknown) =>
        `<rendered>${JSON.stringify(document)}</rendered>`,
    ),
  }),
);

const managerWith = (query: jest.Mock): EntityManager => {
  const queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    manager: undefined as unknown as EntityManager,
    query,
  };
  const manager = { queryRunner } as unknown as EntityManager;

  queryRunner.manager = manager;
  return manager;
};

const ids = {
  workspaceId: '20202020-1111-4111-8111-111111111111',
  campaignId: '20202020-2222-4222-8222-222222222222',
  campaignExecutionId: '20202020-3333-4333-8333-333333333333',
  authorizationId: '20202020-4444-4444-8444-444444444444',
  activationId: '20202020-5555-4555-8555-555555555555',
  workflowVersionId: '20202020-6666-4666-8666-666666666666',
  enrollmentId: '20202020-7777-4777-8777-777777777777',
  occurrenceId: '20202020-8888-4888-8888-888888888888',
  connectedAccountId: '20202020-9999-4999-8999-999999999999',
  messageChannelId: '20202020-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  attemptId: '20202020-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  creatorId: '20202020-cccc-4ccc-8ccc-cccccccccccc',
};

const routing = { ...ids, authorizationGeneration: 1 };
const localDate = '2026-09-11';
const projectAttemptLikeQueueWorker = (
  sql: string,
  row: Record<string, unknown>,
): Record<string, unknown> => ({
  ...row,
  localDate: sql.includes('"localDate"::text AS "localDate"')
    ? localDate
    : new Date(`${localDate}T00:00:00.000Z`),
});

describe('CampaignProgressionService', () => {
  it('rejects a manager that is not the active transaction owner', async () => {
    const service = new CampaignProgressionService();
    await expect(
      service.markUnknownInTransaction('occurrence', {
        queryRunner: { isTransactionActive: false },
      } as never),
    ).rejects.toThrow('supplied active manager');
  });

  it('locks untrusted workspace and Campaign coordinates before exact occurrence scope', async () => {
    const workspaceId = '20202020-1111-4111-8111-111111111111';
    const campaignId = '20202020-2222-4222-8222-222222222222';
    const occurrenceId = '20202020-3333-4333-8333-333333333333';
    const enrollmentId = '20202020-4444-4444-8444-444444444444';
    const authorizationId = '20202020-5555-4555-8555-555555555555';
    const workflowVersionId = '20202020-6666-4666-8666-666666666666';
    const campaignExecutionId = '20202020-7777-4777-8777-777777777777';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM core.workspace'))
        return [
          { activationStatus: 'INACTIVE', suspendedAt: null, deletedAt: null },
        ];
      if (sql.includes('.campaign WHERE'))
        return [
          {
            id: campaignId,
            lifecycleStatus: 'ACTIVE',
            sequenceAuthorization: {
              authorizationId,
              generation: 1,
              workflowVersionId,
            },
          },
        ];
      if (sql.includes('campaignSequenceAuthorization'))
        return [{ authorizationId }];
      if (sql.includes('campaignActivation')) return [{ campaignExecutionId }];
      if (sql.includes('SELECT "enrollmentId"')) return [{ enrollmentId }];
      if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
        return [
          {
            id: enrollmentId,
            state: 'ACTIVE',
            holdReason: null,
            nextAuthoredMessageIndex: 0,
          },
        ];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [
          {
            id: occurrenceId,
            enrollmentId,
            state: 'PENDING',
            authoredMessageIndex: 0,
            dueAt: new Date(0),
          },
        ];
      if (sql.includes('outboundEmailAttempt'))
        return [
          {
            attemptId: '20202020-dddd-4ddd-8ddd-dddddddddddd',
            source: 'CAMPAIGN_SEQUENCE',
            attemptState: 'BLOCKED',
            capacityState: 'RELEASED',
          },
          {
            attemptId: ids.attemptId,
            attemptNumber: 1,
            authorizationId,
            campaignId,
            claimedAt: new Date('2026-09-11T00:00:00Z'),
            connectedAccountId: ids.connectedAccountId,
            enrollmentId,
            localDate,
            messageChannelId: ids.messageChannelId,
            messageId: '20202020-cccc-4ccc-8ccc-cccccccccccc',
            normalizedRecipient: 'recipient@example.com',
            normalizedSenderHandle: 'sender@example.com',
            occurrenceId,
            priorAcceptedEvidenceId: null,
            provider: 'google',
            renderDigest: 'a'.repeat(64),
            selectionConstraintKind: 'ROTATE',
            senderPoolFingerprint: 'b'.repeat(64),
            slotAt: new Date('2026-09-11T00:00:01Z'),
            source: 'CAMPAIGN_SEQUENCE',
            attemptState: 'RESERVED',
            capacityState: 'RESERVED',
            unknownAfter: new Date('2026-09-11T00:01:00Z'),
            workflowVersionId,
            workspaceId,
          },
        ].map((row) => projectAttemptLikeQueueWorker(sql, row));
      if (sql.includes('clock_timestamp() AS'))
        return [{ observedAt: new Date() }];
      return [];
    });
    const blockReservedAttemptBeforeProvider = jest
      .fn()
      .mockResolvedValueOnce({ status: 'RECORDED' })
      .mockResolvedValueOnce({ status: 'STATE_CONFLICT' });
    const service = new CampaignProgressionService({
      blockReservedAttemptBeforeProvider,
    } as never);

    await expect(
      service.claimAndReserveDueOccurrenceInTransaction(
        { workspaceId, campaignId, occurrenceId },
        managerWith(query) as never,
      ),
    ).resolves.toEqual({ status: 'HELD', reason: 'WORKSPACE_NOT_ACTIVE' });
    const sql = query.mock.calls.map(([statement]) => statement);
    expect(sql[0]).toContain('core.workspace');
    expect(sql[1]).toContain('pg_advisory_xact_lock');
    expect(sql[2]).toContain('.campaign');
    expect(sql[5]).toContain('campaignOccurrence');
    expect(sql[5]).not.toContain('FOR UPDATE');
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toContain(
      'INSERT INTO core."outboundEmailAttempt"',
    );
    expect(blockReservedAttemptBeforeProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'WORKSPACE_NOT_ACTIVE',
        reservation: expect.objectContaining({ localDate }),
      }),
      expect.anything(),
    );

    await expect(
      service.claimAndReserveDueOccurrenceInTransaction(
        { workspaceId, campaignId, occurrenceId },
        managerWith(query) as never,
      ),
    ).rejects.toThrow('Campaign inactive-workspace reservation block failed');
    expect(blockReservedAttemptBeforeProvider).toHaveBeenCalledTimes(2);
    expect(
      query.mock.calls.filter(([statement]) =>
        String(statement).includes('UPDATE core."campaignOccurrence"'),
      ),
    ).toHaveLength(1);

    await expect(
      new CampaignProgressionService().claimAndReserveDueOccurrenceInTransaction(
        { workspaceId, campaignId, occurrenceId },
        managerWith(query) as never,
      ),
    ).rejects.toThrow(
      'Campaign inactive-workspace attempt service unavailable',
    );
    expect(
      query.mock.calls.filter(([statement]) =>
        String(statement).includes('UPDATE core."campaignOccurrence"'),
      ),
    ).toHaveLength(1);
  });

  it('uses a lock followed by a state CAS for typed holds', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'occurrence', state: 'PENDING' }])
      .mockResolvedValueOnce([{ id: 'occurrence' }]);
    const service = new CampaignProgressionService();

    await expect(
      service.holdOccurrenceInTransaction(
        'occurrence',
        'WORKSPACE_NOT_ACTIVE',
        managerWith(query),
      ),
    ).resolves.toEqual({ status: 'CHANGED' });
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain("state='HELD'");
    expect(query.mock.calls[1][1]).toEqual([
      'occurrence',
      'WORKSPACE_NOT_ACTIVE',
    ]);
    expect(query.mock.calls[1][0]).toContain(
      "state IN ('PENDING','IN_FLIGHT','UNKNOWN','HELD')",
    );
  });

  it('suppresses an exact hold replay but gives a later repeated hold a distinct persisted identity', async () => {
    const changedAt = ['2026-09-16T12:00:00.000Z', '2026-09-16T13:00:00.000Z'];
    let transition = 0;
    let lockCount = 0;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        lockCount += 1;
        return lockCount === 2
          ? [
              {
                id: ids.occurrenceId,
                enrollmentId: ids.enrollmentId,
                state: 'HELD',
                holdReason: 'WORKSPACE_NOT_ACTIVE',
              },
            ]
          : [
              {
                id: ids.occurrenceId,
                enrollmentId: ids.enrollmentId,
                state: 'PENDING',
                holdReason: null,
              },
            ];
      }
      if (sql.includes('RETURNING "workspaceId"')) {
        const result = [
          {
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            enrollmentId: ids.enrollmentId,
            updatedAt: changedAt[transition === 0 ? 0 : 1],
          },
        ];
        transition += 1;
        return result;
      }
      if (sql.includes('SELECT "creatorId"'))
        return [{ creatorId: ids.connectedAccountId }];
      return [];
    });
    const writer = { writeInTransaction: jest.fn() };
    const service = new CampaignProgressionService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      writer as never,
    );
    const manager = managerWith(query);

    await expect(
      service.holdOccurrenceInTransaction(
        ids.occurrenceId,
        'WORKSPACE_NOT_ACTIVE',
        manager,
      ),
    ).resolves.toEqual({ status: 'CHANGED' });
    await expect(
      service.holdOccurrenceInTransaction(
        ids.occurrenceId,
        'WORKSPACE_NOT_ACTIVE',
        manager,
      ),
    ).resolves.toEqual({ status: 'EXACT_REPLAY' });
    await expect(
      service.holdOccurrenceInTransaction(
        ids.occurrenceId,
        'WORKSPACE_NOT_ACTIVE',
        manager,
      ),
    ).resolves.toEqual({ status: 'CHANGED' });

    expect(writer.writeInTransaction).toHaveBeenCalledTimes(2);
    const keys = writer.writeInTransaction.mock.calls.map(
      ([, event]) => event.businessEventKey,
    );
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys).toEqual([
      `hold:${ids.occurrenceId}:${changedAt[0]}:WORKSPACE_NOT_ACTIVE`,
      `hold:${ids.occurrenceId}:${changedAt[1]}:WORKSPACE_NOT_ACTIVE`,
    ]);
  });

  it('requires enrollments, terminal rows, and no unresolved attempts to complete', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        hasEnrollments: true,
        enrollmentsTerminal: true,
        occurrencesResolved: true,
        attemptsResolved: false,
      },
    ]);
    const service = new CampaignProgressionService();

    await expect(
      service.canCompleteInTransaction(
        'workspace',
        'campaign',
        managerWith(query),
      ),
    ).resolves.toBe(false);
    expect(query.mock.calls[0][0]).toContain(
      "'RESERVED','PROCESSING','UNKNOWN'",
    );
  });

  it.each(['workspaceId', 'campaignId', 'occurrenceId'] as const)(
    'rejects invalid claim %s without SQL',
    async (field) => {
      const query = jest.fn();
      const service = new CampaignProgressionService();

      await expect(
        service.claimAndReserveDueOccurrenceInTransaction(
          { ...ids, [field]: 'not-a-uuid' },
          managerWith(query) as never,
        ),
      ).resolves.toEqual({ status: 'TERMINAL' });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    'workspaceId',
    'campaignId',
    'campaignExecutionId',
    'authorizationId',
    'activationId',
    'workflowVersionId',
    'enrollmentId',
    'occurrenceId',
    'connectedAccountId',
    'messageChannelId',
    'attemptId',
  ] as const)(
    'rejects invalid reconcile %s without SQL or mutation',
    async (field) => {
      const query = jest.fn();
      const service = new CampaignProgressionService();

      await expect(
        service.reconcileAcceptedInTransaction(
          { ...routing, [field]: 'invalid' },
          managerWith(query) as never,
        ),
      ).resolves.toEqual({ status: 'TERMINAL_SUPPRESSED' });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'Date inputs',
      new Date('2026-09-20T12:46:18.999Z'),
      new Date('2026-09-20T12:48:18.999Z'),
      'PROGRESSED',
    ],
    [
      'string inputs',
      '2026-09-20T08:46:18.999-04:00',
      '2026-09-20T12:48:18.999Z',
      'PROGRESSED',
    ],
    [
      'Date acceptance/string window',
      new Date('2026-09-20T12:46:18.999Z'),
      '2026-09-20T12:48:18.999Z',
      'PROGRESSED',
    ],
    [
      'string acceptance/Date window',
      '2026-09-20T12:46:18.999Z',
      new Date('2026-09-20T12:48:18.999Z'),
      'PROGRESSED',
    ],
    ['invalid acceptance', 'invalid', null, 'TERMINAL_SUPPRESSED'],
    ['invalid Date acceptance', new Date(NaN), null, 'TERMINAL_SUPPRESSED'],
    ['null acceptance', null, null, 'TERMINAL_SUPPRESSED'],
    ['missing acceptance', undefined, null, 'TERMINAL_SUPPRESSED'],
    ['invalid window', '2026-09-20T12:46:18.999Z', 'invalid', 'unavailable'],
    [
      'invalid Date window',
      '2026-09-20T12:46:18.999Z',
      new Date(NaN),
      'unavailable',
    ],
    ['null window', '2026-09-20T12:46:18.999Z', null, 'unavailable'],
    ['missing window', '2026-09-20T12:46:18.999Z', undefined, 'unavailable'],
    [
      'Date replay',
      '2026-09-20T12:46:18.999Z',
      new Date('2026-09-20T12:48:18.999Z'),
      'PROGRESSED',
    ],
    [
      'string replay',
      '2026-09-20T12:46:18.999Z',
      '2026-09-20T12:48:18.999Z',
      'PROGRESSED',
    ],
    [
      'one millisecond replay collision',
      '2026-09-20T12:46:18.999Z',
      new Date('2026-09-20T12:48:18.999Z'),
      'collision',
    ],
  ])(
    'preserves exact scheduling and fail-closed boundaries: %s',
    async (name, acceptedAt, windowAt, expected) => {
      let inserted: unknown[] = [];
      let candidate: Date | undefined;
      const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
        if (sql.includes('core.workspace')) return [{ id: ids.workspaceId }];
        if (sql.includes('.campaign WHERE'))
          return [{ lifecycleStatus: 'ACTIVE' }];
        if (sql.includes('campaignSequenceAuthorization'))
          return [{ state: 'ACTIVE' }];
        if (sql.includes('campaignActivation'))
          return [{ id: ids.activationId }];
        if (sql.includes('AS "dueAt"')) {
          candidate = parameters[3] as Date;
          return windowAt === undefined ? [] : [{ dueAt: windowAt }];
        }
        if (sql.includes('SELECT id, "workflowVersionId"'))
          return [
            {
              id: inserted[0],
              workflowVersionId: inserted[4],
              messageId: inserted[5],
              dueAt:
                expected === 'collision'
                  ? new Date('2026-09-20T12:48:18.998Z')
                  : windowAt,
            },
          ];
        if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
          return [
            {
              id: ids.enrollmentId,
              state: 'ACTIVE',
              authoredMessageCount: 2,
              nextAuthoredMessageIndex: 0,
              campaignCreatorId: ids.creatorId,
              creatorId: ids.creatorId,
            },
          ];
        if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
          return [
            {
              id: ids.occurrenceId,
              state: 'IN_FLIGHT',
              authoredMessageIndex: 0,
            },
          ];
        if (sql.includes('outboundEmailAttempt'))
          return [
            {
              ...routing,
              attemptState: 'ACCEPTED',
              providerAcceptedAt: acceptedAt,
              projectedMessageId: ids.creatorId,
              projectedMessageThreadId: ids.creatorId,
            },
          ];
        if (sql.includes('INSERT INTO core."campaignOccurrence"')) {
          inserted = parameters;
          return String(name).includes('replay') ? [] : [{ id: parameters[0] }];
        }
        if (sql.includes('UPDATE')) return [{ id: ids.occurrenceId }];
        return [];
      });
      const service = new CampaignProgressionService(undefined, undefined, {
        loadExecutionPlanInTransaction: async () => ({
          kind: 'READY',
          delaysSeconds: [120],
          nodes: [
            { messageId: ids.occurrenceId, channel: 'EMAIL' },
            { messageId: ids.creatorId, channel: 'EMAIL' },
          ],
        }),
      } as never);
      const result = service.reconcileAcceptedInTransaction(
        routing,
        managerWith(query) as never,
      );
      if (expected === 'unavailable' || expected === 'collision') {
        await expect(result).rejects.toThrow(
          expected === 'unavailable'
            ? 'Campaign next sending window was unavailable'
            : 'Next Campaign occurrence identity collision',
        );
      } else {
        await expect(result).resolves.toEqual({ status: expected });
      }
      if (expected === 'PROGRESSED') {
        expect(candidate?.toISOString()).toBe('2026-09-20T12:48:18.999Z');
        expect(inserted[7]).toEqual(new Date('2026-09-20T12:48:18.999Z'));
      }
      if (expected === 'TERMINAL_SUPPRESSED' || expected === 'unavailable') {
        expect(
          query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)\b/.test(sql)),
        ).toBe(false);
      }
    },
  );

  it('locks the full routing graph in canonical order before marking UNKNOWN', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('core.workspace')) return [{ id: ids.workspaceId }];
      if (sql.includes('.campaign WHERE')) return [{ id: ids.campaignId }];
      if (sql.includes('campaignSequenceAuthorization'))
        return [{ id: 'auth' }];
      if (sql.includes('campaignActivation')) return [{ id: ids.activationId }];
      if (sql.includes('campaignEnrollment'))
        return [{ id: ids.enrollmentId, creatorId: ids.connectedAccountId }];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [{ id: ids.occurrenceId, state: 'IN_FLIGHT' }];
      if (sql.includes('outboundEmailAttempt'))
        return [
          projectAttemptLikeQueueWorker(sql, {
            ...routing,
            attemptState: 'UNKNOWN',
            updatedAt: new Date('2026-09-16T12:00:00.000Z'),
          }),
        ];
      if (sql.includes("SET state='UNKNOWN'"))
        return [{ updatedAt: new Date('2026-09-16T12:00:00.000Z') }];
      return [];
    });
    const writer = { writeInTransaction: jest.fn() };
    const service = new CampaignProgressionService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      writer as never,
    );

    await expect(
      service.reconcileUnknownInTransaction(
        routing,
        managerWith(query) as never,
      ),
    ).resolves.toEqual({ status: 'UNKNOWN' });
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.find((sql) => sql.includes('outboundEmailAttempt')),
    ).toContain('"localDate"::text AS "localDate"');
    expect(writer.writeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ manager: expect.anything() }),
      expect.objectContaining({
        businessEventKey: `attempt:${ids.attemptId}:UNKNOWN`,
        eventKind: 'UNKNOWN',
        happenedAt: '2026-09-16T12:00:00.000Z',
      }),
    );
    expect(
      statements.map((sql) =>
        [
          'workspace',
          'advisory',
          'campaign',
          'authorization',
          'activation',
          'enrollment',
          'occurrence',
          'mailbox-advisory',
          'attempt',
          'update',
        ].find(
          (name) =>
            ({
              workspace: sql.includes('core.workspace'),
              advisory: sql.includes('hashtext($1),hashtext($2)'),
              campaign: sql.includes('.campaign WHERE'),
              authorization: sql.includes('campaignSequenceAuthorization'),
              activation: sql.includes('campaignActivation'),
              enrollment: sql.includes('campaignEnrollment'),
              occurrence:
                sql.includes('campaignOccurrence') && sql.includes('SELECT'),
              'mailbox-advisory': sql.includes('hashtextextended'),
              attempt: sql.includes('outboundEmailAttempt'),
              update: sql.includes("SET state='UNKNOWN'"),
            })[name],
        ),
      ),
    ).toEqual([
      'workspace',
      'advisory',
      'campaign',
      'authorization',
      'activation',
      'enrollment',
      'occurrence',
      'mailbox-advisory',
      'mailbox-advisory',
      'mailbox-advisory',
      'attempt',
      'update',
    ]);
  });

  it('captures exact verified inbound reply evidence in the terminalization transaction', async () => {
    const terminalAt = new Date('2026-09-16T14:00:00.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: ids.workspaceId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ids.campaignId }])
      .mockResolvedValueOnce([
        {
          id: ids.enrollmentId,
          state: 'ACTIVE',
          creatorId: ids.connectedAccountId,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ terminalAt }])
      .mockResolvedValueOnce([]);
    const writer = { writeInTransaction: jest.fn() };
    const service = new CampaignProgressionService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      writer as never,
    );
    const inboundEvidenceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await expect(
      service.terminalizeReplyInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          enrollmentId: ids.enrollmentId,
          inboundEvidenceId,
        },
        managerWith(query) as never,
      ),
    ).resolves.toEqual({ status: 'REPLIED' });

    expect(writer.writeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ manager: expect.anything() }),
      expect.objectContaining({
        businessEventKey: `reply:${inboundEvidenceId}`,
        eventKind: 'REPLIED',
        happenedAt: terminalAt.toISOString(),
        messageId: inboundEvidenceId,
        sourceId: inboundEvidenceId,
        sourceType: 'MESSAGE',
      }),
    );
    expect(query.mock.calls[7][1]).toEqual([ids.enrollmentId, terminalAt]);
  });

  it.each([
    [{ attemptId: ids.attemptId }, { status: 'DISPATCHABLE_REPLAY' }],
    [[], { status: 'NOT_DISPATCHABLE' }],
  ] as const)(
    'classifies reserved replay rows without rerendering',
    async (row, expected) => {
      const query = jest
        .fn()
        .mockResolvedValue(Array.isArray(row) ? row : [row]);
      const service = new CampaignProgressionService();

      await expect(
        service.inspectDispatchableReservationInTransaction(
          ids.attemptId,
          managerWith(query),
        ),
      ).resolves.toEqual(expected);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('a."attemptState"=\'RESERVED\'');
    },
  );

  it('projects both retained terminal transitions for Campaign eligibility exclusion', async () => {
    const observedAt = new Date('2026-09-15T20:00:00.000Z');
    const messageId = '20202020-dddd-4ddd-8ddd-dddddddddddd';
    const campaignCreatorId = '20202020-eeee-4eee-8eee-eeeeeeeeeeee';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM core.workspace'))
        return [
          { activationStatus: 'ACTIVE', suspendedAt: null, deletedAt: null },
        ];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('.campaign WHERE'))
        return [
          {
            id: ids.campaignId,
            lifecycleStatus: 'ACTIVE',
            sequenceAuthorization: {
              authorizationId: ids.authorizationId,
              workflowVersionId: ids.workflowVersionId,
              generation: 1,
              state: 'ACTIVE',
              preparedFingerprint: 'fingerprint',
            },
          },
        ];
      if (sql.includes('campaignSequenceAuthorization'))
        return [
          {
            authorizationId: ids.authorizationId,
            state: 'ACTIVE',
            preparedFingerprint: 'fingerprint',
            binding: {
              request: { preparedProof: { orderedMessageIds: [messageId] } },
            },
          },
        ];
      if (sql.includes('campaignActivation'))
        return [{ campaignExecutionId: ids.campaignExecutionId }];
      if (sql.includes('SELECT "enrollmentId"'))
        return [{ enrollmentId: ids.enrollmentId }];
      if (sql.includes('SELECT id,state'))
        return [
          {
            id: ids.enrollmentId,
            state: 'ACTIVE',
            terminalReason: null,
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            creatorId: ids.creatorId,
          },
        ];
      if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
        return [
          {
            id: ids.enrollmentId,
            campaignCreatorId,
            creatorId: ids.creatorId,
            state: 'ACTIVE',
            nextAuthoredMessageIndex: 0,
          },
        ];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [
          {
            id: ids.occurrenceId,
            enrollmentId: ids.enrollmentId,
            state: 'HELD',
            holdReason: 'SENDER_NOT_READY',
            authoredMessageIndex: 0,
            messageId,
            dueAt: new Date(observedAt.getTime() - 1_000),
          },
        ];
      if (sql.includes('outboundEmailAttempt')) return [];
      if (sql.includes('clock_timestamp() AS')) return [{ observedAt }];
      if (sql.includes("SET state='SKIPPED'"))
        return sql.includes("state IN ('PENDING','HELD')")
          ? [{ terminalAt: observedAt }]
          : [];
      if (sql.includes("SET state='EXCLUDED'"))
        return [{ terminalAt: observedAt }];
      return [];
    });
    const writer = { writeInTransaction: jest.fn() };
    const service = new CampaignProgressionService(
      {} as never,
      {} as never,
      {
        loadExecutionPlanInTransaction: jest.fn().mockResolvedValue({
          kind: 'READY',
          nodes: [{ messageId }],
        }),
      } as never,
      {
        reviewInTransaction: jest.fn().mockResolvedValue({
          eligible: [],
          excluded: [{ campaignCreatorId, reasons: ['INVALID_EMAIL'] }],
        }),
      } as never,
      {} as never,
      {} as never,
      writer as never,
    );

    await expect(
      service.claimAndReserveDueOccurrenceInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          occurrenceId: ids.occurrenceId,
        },
        managerWith(query) as never,
      ),
    ).resolves.toEqual({ status: 'EXCLUDED', reason: 'INVALID_EMAIL' });
    expect(writer.writeInTransaction).toHaveBeenCalledTimes(2);
    expect(writer.writeInTransaction).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        eventKind: 'TERMINAL',
        sourceType: 'OCCURRENCE',
        reason: 'INVALID_EMAIL',
      }),
    );
    expect(writer.writeInTransaction).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        eventKind: 'TERMINAL',
        sourceType: 'ENROLLMENT',
        reason: 'INVALID_EMAIL',
      }),
    );
  });

  it.each(['WINDOW', 'CAPACITY', 'RESERVATION'] as const)(
    'recovers a HELD occurrence into a consistent pending %s deferral',
    async (deferAt) => {
      const observedAt = new Date('2026-09-15T20:00:00.000Z');
      const nextDueAt = new Date('2026-09-15T21:00:00.000Z');
      const messageId = '20202020-dddd-4ddd-8ddd-dddddddddddd';
      const campaignCreatorId = '20202020-eeee-4eee-8eee-eeeeeeeeeeee';
      const sender = {
        status: 'READY',
        bindingStatus: 'RESOLVED_BINDING',
        connectedAccountId: ids.connectedAccountId,
        messageChannelId: ids.messageChannelId,
        senderHandle: 'sender@example.com',
        provider: ConnectedAccountProvider.GOOGLE,
      };
      const query = jest.fn(async (sql: string) => {
        if (sql.includes('FROM core.workspace'))
          return [
            { activationStatus: 'ACTIVE', suspendedAt: null, deletedAt: null },
          ];
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('.campaign WHERE'))
          return [
            {
              id: ids.campaignId,
              lifecycleStatus: 'ACTIVE',
              sequenceAuthorization: {
                authorizationId: ids.authorizationId,
                workflowVersionId: ids.workflowVersionId,
                generation: 1,
                state: 'ACTIVE',
                preparedFingerprint: 'fingerprint',
              },
            },
          ];
        if (sql.includes('campaignSequenceAuthorization'))
          return [
            {
              authorizationId: ids.authorizationId,
              state: 'ACTIVE',
              preparedFingerprint: 'fingerprint',
              binding: {
                request: {
                  preparedProof: {
                    orderedMessageIds: [messageId],
                    senderPoolFingerprint: 'sender-pool',
                    senderPoolSerializationRevision: 'sender-pool/v1',
                    senderPoolRotationPolicyId: 'rotate/v1',
                  },
                },
              },
            },
          ];
        if (sql.includes('campaignActivation'))
          return [{ campaignExecutionId: ids.campaignExecutionId }];
        if (sql.includes('SELECT "enrollmentId"'))
          return [{ enrollmentId: ids.enrollmentId }];
        if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
          return [
            {
              id: ids.enrollmentId,
              campaignCreatorId,
              creatorId: ids.creatorId,
              state: 'ACTIVE',
              holdReason: 'SENDER_NOT_READY',
              nextAuthoredMessageIndex: 0,
            },
          ];
        if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
          return [
            {
              id: ids.occurrenceId,
              enrollmentId: ids.enrollmentId,
              state: 'HELD',
              holdReason: 'SENDER_NOT_READY',
              authoredMessageIndex: 0,
              messageId,
              dueAt: new Date(observedAt.getTime() - 1_000),
            },
          ];
        if (sql.includes('outboundEmailAttempt')) return [];
        if (sql.includes('clock_timestamp() AS')) return [{ observedAt }];
        if (sql.includes('FROM core."campaignExecution"'))
          return [
            {
              campaignCapacityTimeZone: 'UTC',
              insideWindow: deferAt !== 'WINDOW',
              nextWindowAt: nextDueAt,
            },
          ];
        if (sql.includes('UPDATE core."campaignOccurrence"'))
          return sql.includes("state IN ('PENDING','HELD')")
            ? [{ updatedAt: observedAt }]
            : [];
        return [];
      });
      const writer = { writeInTransaction: jest.fn() };
      const service = new CampaignProgressionService(
        {
          reserveWithMailboxCapacity: jest
            .fn()
            .mockResolvedValue(
              deferAt === 'RESERVATION'
                ? { status: 'NOT_READY', nextEligibleAt: nextDueAt }
                : { status: 'UNUSED' },
            ),
        } as never,
        {
          lockAndRankForReservation: jest
            .fn()
            .mockResolvedValue(
              deferAt === 'CAPACITY'
                ? { status: 'NOT_READY', nextEligibleAt: nextDueAt }
                : { status: 'ELIGIBLE_NOW', selected: { sender } },
            ),
        } as never,
        {
          loadExecutionPlanInTransaction: jest.fn().mockResolvedValue({
            kind: 'READY',
            nodes: [{ messageId, channel: 'EMAIL', replyToThread: false }],
          }),
        } as never,
        {
          reviewInTransaction: jest.fn().mockResolvedValue({
            eligible: [
              { campaignCreatorId, normalizedEmail: 'creator@example.com' },
            ],
            excluded: [],
          }),
        } as never,
        {
          getCampaignEmailSenderPoolInTransaction: jest.fn().mockResolvedValue({
            senderPoolFingerprint: 'sender-pool',
            serializationRevision: 'sender-pool/v1',
            rotationPolicyId: 'rotate/v1',
            mailboxes: [sender],
          }),
        } as never,
        {
          renderSequenceEmail: jest.fn().mockResolvedValue({
            kind: 'READY',
            render: { renderDigest: 'digest' },
          }),
        } as never,
        writer as never,
      );

      await expect(
        service.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            occurrenceId: ids.occurrenceId,
          },
          managerWith(query) as never,
        ),
      ).resolves.toEqual({ status: 'DEFERRED', nextDueAt });
      const statements = query.mock.calls.map(([sql]) => String(sql));
      expect(statements).toEqual(
        expect.arrayContaining([
          expect.stringContaining("SET state='PENDING'"),
          expect.stringContaining('SET "holdReason"=NULL'),
        ]),
      );
      expect(writer.writeInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventKind: 'HOLD_RECOVERED',
          reason: 'SENDER_NOT_READY',
        }),
      );

      const recoveryKey =
        writer.writeInTransaction.mock.calls[0][1].businessEventKey;
      writer.writeInTransaction.mockRejectedValueOnce(
        new Error('hold recovery projection failed'),
      );
      await expect(
        service.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            occurrenceId: ids.occurrenceId,
          },
          managerWith(query) as never,
        ),
      ).rejects.toThrow('hold recovery projection failed');
      expect(writer.writeInTransaction.mock.calls[1][1].businessEventKey).toBe(
        recoveryKey,
      );
    },
  );

  it('does not report a deferral when the occurrence CAS changes no row', async () => {
    const nextDueAt = new Date('2026-09-15T21:00:00.000Z');
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM core.workspace'))
        return [
          { activationStatus: 'ACTIVE', suspendedAt: null, deletedAt: null },
        ];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('.campaign WHERE'))
        return [
          {
            lifecycleStatus: 'ACTIVE',
            sequenceAuthorization: {
              authorizationId: ids.authorizationId,
              workflowVersionId: ids.workflowVersionId,
              generation: 1,
              state: 'ACTIVE',
              preparedFingerprint: 'fingerprint',
            },
          },
        ];
      if (sql.includes('campaignSequenceAuthorization'))
        return [
          {
            authorizationId: ids.authorizationId,
            state: 'ACTIVE',
            preparedFingerprint: 'fingerprint',
            binding: {
              request: { preparedProof: { orderedMessageIds: ['message'] } },
            },
          },
        ];
      if (sql.includes('campaignActivation'))
        return [{ campaignExecutionId: ids.campaignExecutionId }];
      if (sql.includes('SELECT "enrollmentId"'))
        return [{ enrollmentId: ids.enrollmentId }];
      if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
        return [
          {
            id: ids.enrollmentId,
            campaignCreatorId: 'creator-row',
            creatorId: ids.creatorId,
            state: 'ACTIVE',
            nextAuthoredMessageIndex: 0,
          },
        ];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [
          {
            id: ids.occurrenceId,
            enrollmentId: ids.enrollmentId,
            state: 'PENDING',
            holdReason: null,
            authoredMessageIndex: 0,
            messageId: 'message',
            dueAt: new Date(0),
          },
        ];
      if (sql.includes('outboundEmailAttempt')) return [];
      if (sql.includes('clock_timestamp() AS'))
        return [{ observedAt: new Date('2026-09-15T20:00:00.000Z') }];
      if (sql.includes('FROM core."campaignExecution"'))
        return [{ insideWindow: false, nextWindowAt: nextDueAt }];
      return [];
    });
    const service = new CampaignProgressionService(
      {} as never,
      {} as never,
      {
        loadExecutionPlanInTransaction: jest.fn().mockResolvedValue({
          kind: 'READY',
          nodes: [{ messageId: 'message' }],
        }),
      } as never,
      {
        reviewInTransaction: jest.fn().mockResolvedValue({
          eligible: [{ campaignCreatorId: 'creator-row' }],
          excluded: [],
        }),
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.claimAndReserveDueOccurrenceInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          occurrenceId: ids.occurrenceId,
        },
        managerWith(query) as never,
      ),
    ).resolves.toEqual({ status: 'TERMINAL' });
  });

  it('reserves through the real materializer, renderer, and composer before provider I/O', async () => {
    const campaignCreatorId = '20202020-cccc-4ccc-8ccc-cccccccccccc';
    const messageId = '20202020-dddd-4ddd-8ddd-dddddddddddd';
    const workflowId = '20202020-eeee-4eee-8eee-eeeeeeeeeeee';
    const initiatingUserWorkspaceId = '20202020-ffff-4fff-8fff-ffffffffffff';
    const creatorId = '30303030-1111-4111-8111-111111111111';
    const senderHandle = 'sender@example.com';
    const recipient = 'creator@example.com';
    const senderPoolFingerprint = 'sender-pool-fingerprint';
    const fixedMaterialDigest = 'fixed-material-digest';
    const senderPoolSerializationRevision = 'sender-pool/v1';
    const senderPoolRotationPolicyId = 'rotate/v1';
    const preparedFingerprint = 'prepared-fingerprint';
    const observedAt = new Date('2026-09-15T21:00:00.000Z');
    const email = {
      workspaceId: ids.workspaceId,
      campaignId: ids.campaignId,
      workflowId,
      workflowVersionId: ids.workflowVersionId,
      messageId,
      subject: 'Hello {{creator.name}}',
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A controlled message' }],
          },
        ],
      }),
      files: [],
      replyToThread: false,
      issues: [],
    };
    const sender = {
      bindingStatus: 'RESOLVED_BINDING',
      status: 'READY',
      connectedAccountId: ids.connectedAccountId,
      messageChannelId: ids.messageChannelId,
      senderHandle,
      provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
      dailySendLimit: 50,
      minimumSendIntervalMs: 300_000,
    } as const;
    const sequenceService = {
      loadExecutionPlanInTransaction: jest.fn().mockResolvedValue({
        kind: 'READY',
        nodes: [
          {
            messageId,
            channel: 'EMAIL',
            replyToThread: false,
          },
        ],
      }),
      loadEmailByVersionInTransaction: jest.fn().mockResolvedValue(email),
    } as unknown as CampaignSequenceService;
    const materializer = new CampaignMessageMaterializerService(
      sequenceService,
      {
        load: jest.fn().mockResolvedValue({
          kind: 'READY',
          value: {
            creatorId,
            normalizedRecipient: recipient,
            variables: {
              'creator.name': 'Ada Creator',
              'creator.email': recipient,
            },
          },
        }),
      },
      {
        load: jest.fn().mockResolvedValue({ kind: 'READY', value: null }),
      },
      {
        load: jest.fn().mockResolvedValue({
          kind: 'READY',
          value: {
            connectedAccountId: ids.connectedAccountId,
            messageChannelId: ids.messageChannelId,
            handle: senderHandle,
            provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
            senderPoolFingerprint,
            authorizedEmailSenderPool: [],
            projectedSlotAt: observedAt,
            isPreviewProjection: false,
          },
        }),
      },
      { load: jest.fn() },
      {
        load: jest.fn().mockResolvedValue({
          kind: 'READY',
          value: { kind: 'NEW_THREAD' },
        }),
      },
    );
    const composer = new EmailComposerService(
      {
        executeInWorkspaceContext: jest.fn(),
        getRepository: jest.fn(),
      } as never,
      { findOne: jest.fn(), find: jest.fn() } as never,
      { find: jest.fn() } as never,
      {} as never,
    );
    const renderer = new CampaignMessageRenderService(materializer, composer);
    const renderSequenceEmail = jest.spyOn(renderer, 'renderSequenceEmail');
    const attemptService = {
      reserveWithMailboxCapacity: jest
        .fn()
        .mockResolvedValue({ status: 'RESERVED' }),
    };
    const capacityService = {
      lockAndRankForReservation: jest.fn().mockResolvedValue({
        status: 'ELIGIBLE_NOW',
        observedAt,
        selected: { sender },
        lockedCandidates: [],
      }),
    };
    const audienceService = {
      reviewInTransaction: jest.fn().mockResolvedValue({
        eligible: [{ campaignCreatorId, normalizedEmail: recipient }],
        excluded: [],
      }),
    };
    const senderService = {
      getCampaignEmailSenderPoolInTransaction: jest.fn().mockResolvedValue({
        senderPoolFingerprint,
        serializationRevision: senderPoolSerializationRevision,
        rotationPolicyId: senderPoolRotationPolicyId,
        mailboxes: [sender],
      }),
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM core.workspace'))
        return [
          { activationStatus: 'ACTIVE', suspendedAt: null, deletedAt: null },
        ];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('.campaign WHERE'))
        return [
          {
            id: ids.campaignId,
            lifecycleStatus: 'ACTIVE',
            sequenceAuthorization: {
              authorizationId: ids.authorizationId,
              workflowVersionId: ids.workflowVersionId,
              generation: 1,
              state: 'ACTIVE',
              preparedFingerprint,
            },
          },
        ];
      if (sql.includes('campaignSequenceAuthorization'))
        return [
          {
            authorizationId: ids.authorizationId,
            state: 'ACTIVE',
            preparedFingerprint,
            initiatingUserWorkspaceId,
            binding: {
              request: {
                preparedProof: {
                  orderedMessageIds: [messageId],
                  senderPoolFingerprint,
                  senderPoolSerializationRevision,
                  senderPoolRotationPolicyId,
                  fixedMaterialDigest,
                  signatureDigest: null,
                  fixedMaterialProofs: [
                    { messageId, orderedAttachmentProofs: [] },
                  ],
                },
              },
            },
          },
        ];
      if (sql.includes('campaignActivation'))
        return [{ campaignExecutionId: ids.campaignExecutionId }];
      if (sql.includes('SELECT "enrollmentId"'))
        return [{ enrollmentId: ids.enrollmentId }];
      if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
        return [
          {
            id: ids.enrollmentId,
            campaignCreatorId,
            state: 'ACTIVE',
            nextAuthoredMessageIndex: 0,
          },
        ];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [
          {
            id: ids.occurrenceId,
            enrollmentId: ids.enrollmentId,
            state: 'PENDING',
            authoredMessageIndex: 0,
            messageId,
            dueAt: new Date(observedAt.getTime() - 1_000),
          },
        ];
      if (sql.includes('outboundEmailAttempt')) return [];
      if (sql.includes('clock_timestamp() AS')) return [{ observedAt }];
      if (sql.includes('FROM core."campaignExecution"'))
        return [
          {
            campaignCapacityTimeZone: 'UTC',
            insideWindow: true,
            nextWindowAt: null,
          },
        ];
      if (sql.includes('FROM core."connectedAccount"'))
        return [
          {
            id: ids.connectedAccountId,
            workspaceId: ids.workspaceId,
            handle: senderHandle,
            provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
            scopes: ['email'],
            hasImapConfiguration: true,
            hasSmtpConfiguration: true,
            messageChannels: [
              { id: ids.messageChannelId, handle: senderHandle },
            ],
          },
        ];
      if (sql.includes('INSERT INTO core."campaignOutboundRender"'))
        return [{ attemptId: ids.attemptId }];
      if (sql.includes("SET state='IN_FLIGHT'"))
        return [{ id: ids.occurrenceId }];
      return [];
    });
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [],
    }) as GlobalWorkspaceDataSource;
    const queryRunnerShape = {
      connection: dataSource,
      isTransactionActive: true,
      isReleased: false,
      query,
      manager: undefined as unknown as WorkspaceEntityManager,
    };
    const queryRunner = queryRunnerShape as unknown as QueryRunner;
    const manager = new WorkspaceEntityManager(dataSource, queryRunner);

    queryRunnerShape.manager = manager;
    const providerNetworkSeam = jest
      .spyOn(MessagingMessageOutboundService.prototype, 'sendMessage')
      .mockRejectedValue(new Error('Provider network I/O is forbidden'));
    const service = new CampaignProgressionService(
      attemptService as never,
      capacityService as never,
      sequenceService,
      audienceService as never,
      senderService as never,
      renderer,
    );

    try {
      const result = await service.claimAndReserveDueOccurrenceInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          occurrenceId: ids.occurrenceId,
        },
        manager,
      );

      expect(result).toEqual({
        status: 'RESERVED',
        attemptId: expect.any(String),
      });
      expect(providerNetworkSeam).not.toHaveBeenCalled();
    } finally {
      providerNetworkSeam.mockRestore();
    }

    expect(renderSequenceEmail).toHaveBeenCalledTimes(1);
    expect(
      sequenceService.loadEmailByVersionInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(attemptService.reserveWithMailboxCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ids.workspaceId,
        campaignId: ids.campaignId,
        occurrenceId: ids.occurrenceId,
        connectedAccountId: ids.connectedAccountId,
        messageChannelId: ids.messageChannelId,
        renderDigest: expect.any(String),
      }),
      manager,
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO core."campaignOutboundRender"'),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET state='IN_FLIGHT'"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('FROM core."connectedAccount"'),
      ),
    ).toBe(true);
  });

  it('replays an unexpired RESERVED claim without reserving or rendering again', async () => {
    const unknownAfter = new Date(Date.now() + 120_000);
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('core.workspace'))
        return [
          { activationStatus: 'ACTIVE', suspendedAt: null, deletedAt: null },
        ];
      if (sql.includes('.campaign WHERE'))
        return [
          {
            id: ids.campaignId,
            lifecycleStatus: 'ACTIVE',
            sequenceAuthorization: {
              authorizationId: ids.authorizationId,
              generation: 1,
              workflowVersionId: ids.workflowVersionId,
            },
          },
        ];
      if (sql.includes('campaignSequenceAuthorization'))
        return [{ authorizationId: ids.authorizationId }];
      if (sql.includes('campaignActivation'))
        return [{ campaignExecutionId: ids.campaignExecutionId }];
      if (sql.includes('SELECT "enrollmentId"'))
        return [{ enrollmentId: ids.enrollmentId }];
      if (sql.includes('campaignEnrollment'))
        return [
          {
            id: ids.enrollmentId,
            state: 'ACTIVE',
            nextAuthoredMessageIndex: 0,
          },
        ];
      if (sql.includes('campaignOccurrence'))
        return [
          {
            id: ids.occurrenceId,
            enrollmentId: ids.enrollmentId,
            state: 'IN_FLIGHT',
            authoredMessageIndex: 0,
          },
        ];
      if (sql.includes('outboundEmailAttempt'))
        return [
          projectAttemptLikeQueueWorker(sql, {
            ...routing,
            source: 'CAMPAIGN_SEQUENCE',
            attemptState: 'RESERVED',
            capacityState: 'RESERVED',
            attemptNumber: 1,
            renderDigest: 'digest',
            unknownAfter,
          }),
        ];
      if (sql.includes('clock_timestamp')) return [{ observedAt: new Date() }];
      if (sql.includes('campaignOutboundRender'))
        return [{ attemptId: ids.attemptId }];
      return [];
    });
    const render = { renderSequenceEmail: jest.fn() };
    const reserve = { reserveAttempt: jest.fn() };
    const service = new CampaignProgressionService(
      reserve as never,
      undefined,
      undefined,
      undefined,
      undefined,
      render as never,
    );

    await expect(
      service.claimAndReserveDueOccurrenceInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          occurrenceId: ids.occurrenceId,
        },
        managerWith(query) as never,
      ),
    ).resolves.toEqual({
      status: 'DISPATCHABLE_REPLAY',
      attemptId: ids.attemptId,
    });
    expect(render.renderSequenceEmail).not.toHaveBeenCalled();
    expect(reserve.reserveAttempt).not.toHaveBeenCalled();
    expect(
      query.mock.calls.find(([sql]) =>
        String(sql).includes('outboundEmailAttempt'),
      )?.[0],
    ).toContain('"localDate"::text AS "localDate"');
  });

  it('blocks an expired RESERVED claim and holds its occurrence', async () => {
    const blockReservedAttemptBeforeProvider = jest
      .fn()
      .mockResolvedValue({ status: 'RECORDED' });
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('core.workspace'))
        return [
          { activationStatus: 'ACTIVE', suspendedAt: null, deletedAt: null },
        ];
      if (sql.includes('.campaign WHERE'))
        return [
          {
            id: ids.campaignId,
            lifecycleStatus: 'ACTIVE',
            sequenceAuthorization: {
              authorizationId: ids.authorizationId,
              generation: 1,
              workflowVersionId: ids.workflowVersionId,
            },
          },
        ];
      if (sql.includes('campaignSequenceAuthorization'))
        return [{ authorizationId: ids.authorizationId }];
      if (sql.includes('campaignActivation'))
        return [{ campaignExecutionId: ids.campaignExecutionId }];
      if (sql.includes('SELECT "enrollmentId"'))
        return [{ enrollmentId: ids.enrollmentId }];
      if (sql.includes('campaignEnrollment'))
        return [
          {
            id: ids.enrollmentId,
            state: 'ACTIVE',
            nextAuthoredMessageIndex: 0,
          },
        ];
      if (sql.includes('campaignOccurrence'))
        return [
          { id: ids.occurrenceId, state: 'IN_FLIGHT', authoredMessageIndex: 0 },
        ];
      if (sql.includes('outboundEmailAttempt'))
        return [
          projectAttemptLikeQueueWorker(sql, {
            ...routing,
            source: 'CAMPAIGN_SEQUENCE',
            attemptState: 'RESERVED',
            capacityState: 'RESERVED',
            attemptNumber: 1,
            renderDigest: 'digest',
            unknownAfter: new Date(0),
          }),
        ];
      if (sql.includes('clock_timestamp')) return [{ observedAt: new Date() }];
      return [];
    });
    const service = new CampaignProgressionService({
      blockReservedAttemptBeforeProvider,
    } as never);

    await expect(
      service.claimAndReserveDueOccurrenceInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          occurrenceId: ids.occurrenceId,
        },
        managerWith(query) as never,
      ),
    ).resolves.toEqual({
      status: 'HELD',
      reason: 'DISPATCH_CONTRACT_CONFLICT',
    });
    expect(blockReservedAttemptBeforeProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'RESERVATION_EXPIRED',
        reservation: expect.objectContaining({ localDate }),
      }),
      expect.anything(),
    );
    expect(query.mock.calls.map(([sql]) => String(sql)).join('\n')).toContain(
      "state='HELD'",
    );
  });

  it.each([
    'CAMPAIGN_PAUSED',
    'CAMPAIGN_COMPLETED',
    'AUTHORIZATION_REVOKED',
  ] as const)(
    'normalizes reserved attempt dates and requires a HELD %s cancellation CAS',
    async (reason) => {
      const blockReservedAttemptBeforeProvider = jest
        .fn()
        .mockResolvedValue({ status: 'RECORDED' });
      const queryImplementation = async (sql: string) => {
        if (sql.includes('FROM core.workspace'))
          return [{ id: ids.workspaceId }];
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('.campaign WHERE')) return [{ id: ids.campaignId }];
        if (sql.includes('SELECT "enrollmentId"'))
          return [{ enrollmentId: ids.enrollmentId }];
        if (sql.includes('JOIN core."campaignEnrollment"'))
          return [
            {
              id: ids.occurrenceId,
              state: 'HELD',
              terminalReason: null,
              workspaceId: ids.workspaceId,
              campaignId: ids.campaignId,
              creatorId: ids.creatorId,
            },
          ];
        if (sql.includes('campaignEnrollment'))
          return [{ id: ids.enrollmentId }];
        if (
          sql.includes('campaignOccurrence') &&
          sql.includes('SELECT id, state')
        )
          return [{ id: ids.occurrenceId, state: 'HELD' }];
        if (sql.includes('campaignOccurrence') && sql.includes('SELECT *'))
          return [{ id: ids.occurrenceId, state: 'HELD' }];
        if (sql.includes('outboundEmailAttempt'))
          return [
            projectAttemptLikeQueueWorker(sql, {
              ...routing,
              attemptNumber: 1,
              claimedAt: new Date('2026-09-11T00:00:00.000Z'),
              messageId: '20202020-cccc-4ccc-8ccc-cccccccccccc',
              normalizedRecipient: 'recipient@example.com',
              normalizedSenderHandle: 'sender@example.com',
              priorAcceptedEvidenceId: null,
              provider: 'google',
              renderDigest: 'a'.repeat(64),
              selectionConstraintKind: 'ROTATE',
              senderPoolFingerprint: 'b'.repeat(64),
              slotAt: new Date('2026-09-11T00:00:01.000Z'),
              source: 'CAMPAIGN_SEQUENCE',
              attemptState: 'RESERVED',
              capacityState: 'RESERVED',
              unknownAfter: new Date('2026-09-11T00:01:00.000Z'),
            }),
          ];
        if (sql.includes('UPDATE core."campaignOccurrence"'))
          return [{ id: ids.occurrenceId }];
        return [];
      };
      const query = jest.fn(queryImplementation);
      const service = new CampaignProgressionService({
        blockReservedAttemptBeforeProvider,
      } as never);

      await expect(
        service.cancelBeforeSubmissionInTransaction(
          {
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            occurrenceId: ids.occurrenceId,
            reason,
          },
          managerWith(query) as never,
        ),
      ).resolves.toEqual({ status: 'CANCELLED' });
      expect(blockReservedAttemptBeforeProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          reservation: expect.objectContaining({ localDate }),
        }),
        expect.anything(),
      );
      expect(
        query.mock.calls.find(([sql]) =>
          String(sql).includes('outboundEmailAttempt'),
        )?.[0],
      ).toContain('"localDate"::text AS "localDate"');

      const noChangeQuery = jest.fn(async (sql: string) =>
        sql.includes('UPDATE core."campaignOccurrence"')
          ? []
          : queryImplementation(sql),
      );
      await expect(
        service.cancelBeforeSubmissionInTransaction(
          {
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            occurrenceId: ids.occurrenceId,
            reason,
          },
          managerWith(noChangeQuery) as never,
        ),
      ).rejects.toThrow('Campaign occurrence cancellation CAS failed');
    },
  );

  it.each([
    'CAMPAIGN_PAUSED',
    'CAMPAIGN_COMPLETED',
    'AUTHORIZATION_REVOKED',
  ] as const)(
    'writes one deterministic terminal event for %s cancellation and none for exact replay',
    async (reason) => {
      const terminalAt = new Date('2026-09-11T00:02:00.000Z');
      let cancelled = false;
      const query = jest.fn(async (sql: string) => {
        if (sql.includes('JOIN core."campaignEnrollment"'))
          return [
            {
              id: ids.occurrenceId,
              state: cancelled ? 'CANCELLED' : 'HELD',
              terminalReason: cancelled ? reason : null,
              workspaceId: ids.workspaceId,
              campaignId: ids.campaignId,
              creatorId: ids.creatorId,
            },
          ];
        if (sql.includes('UPDATE core."campaignOccurrence"')) {
          if (!sql.includes("state IN ('PENDING','IN_FLIGHT','HELD')"))
            return [];
          cancelled = true;
          return [{ terminalAt }];
        }
        return [];
      });
      const writer = { writeInTransaction: jest.fn() };
      const service = new CampaignProgressionService(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        writer as never,
      );
      const manager = managerWith(query);

      await expect(
        service.cancelOccurrenceInTransaction(
          ids.occurrenceId,
          reason,
          manager,
        ),
      ).resolves.toEqual({ status: 'CHANGED' });
      await expect(
        service.cancelOccurrenceInTransaction(
          ids.occurrenceId,
          reason,
          manager,
        ),
      ).resolves.toEqual({ status: 'EXACT_REPLAY' });
      expect(writer.writeInTransaction).toHaveBeenCalledTimes(1);
      expect(writer.writeInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
        }),
        expect.objectContaining({
          businessEventKey: `terminal:occurrence:${ids.occurrenceId}:${terminalAt.toISOString()}:${reason}`,
          eventKind: 'TERMINAL',
          creatorId: ids.creatorId,
          reason,
        }),
      );
    },
  );

  it('writes one terminal event for eligibility enrollment exclusion and none for exact replay', async () => {
    const terminalAt = new Date('2026-09-11T00:03:00.000Z');
    let excluded = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id,state'))
        return [
          {
            id: ids.enrollmentId,
            state: excluded ? 'EXCLUDED' : 'ACTIVE',
            terminalReason: excluded ? 'INVALID_EMAIL' : null,
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            creatorId: ids.creatorId,
          },
        ];
      if (sql.includes('UPDATE core."campaignEnrollment"')) {
        excluded = true;
        return [{ terminalAt }];
      }
      return [];
    });
    const writer = { writeInTransaction: jest.fn() };
    const service = new CampaignProgressionService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      writer as never,
    );
    const manager = managerWith(query);

    await expect(
      service.excludeEnrollmentInTransaction(
        ids.enrollmentId,
        'INVALID_EMAIL',
        manager,
      ),
    ).resolves.toEqual({ status: 'CHANGED' });
    await expect(
      service.excludeEnrollmentInTransaction(
        ids.enrollmentId,
        'INVALID_EMAIL',
        manager,
      ),
    ).resolves.toEqual({ status: 'EXACT_REPLAY' });
    expect(writer.writeInTransaction).toHaveBeenCalledTimes(1);
    expect(writer.writeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessEventKey: `terminal:enrollment:${ids.enrollmentId}:${terminalAt.toISOString()}:INVALID_EMAIL`,
        eventKind: 'TERMINAL',
        creatorId: ids.creatorId,
        reason: 'INVALID_EMAIL',
      }),
    );
  });

  it('propagates a HELD terminal projection failure from the source transaction', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('JOIN core."campaignEnrollment"'))
        return [
          {
            id: ids.occurrenceId,
            state: 'HELD',
            terminalReason: null,
            workspaceId: ids.workspaceId,
            campaignId: ids.campaignId,
            creatorId: ids.creatorId,
          },
        ];
      if (sql.includes('UPDATE core."campaignOccurrence"'))
        return sql.includes("state IN ('PENDING','IN_FLIGHT','HELD')")
          ? [{ terminalAt: new Date('2026-09-11T00:02:00.000Z') }]
          : [];
      return [];
    });
    const service = new CampaignProgressionService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        writeInTransaction: jest
          .fn()
          .mockRejectedValue(new Error('terminal projection failed')),
      } as never,
    );

    await expect(
      service.cancelOccurrenceInTransaction(
        ids.occurrenceId,
        'AUTHORIZATION_REVOKED',
        managerWith(query),
      ),
    ).rejects.toThrow('terminal projection failed');
  });

  it.each([
    ['cancelOccurrenceInTransaction', 'CAMPAIGN_PAUSED', 'CANCELLED'],
    ['markUnknownInTransaction', undefined, 'UNKNOWN'],
  ] as const)('applies %s with a locked CAS', async (_, reason, state) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: ids.occurrenceId, state: 'IN_FLIGHT' }])
      .mockResolvedValueOnce([{ id: ids.occurrenceId }]);
    const service = new CampaignProgressionService();
    const manager = managerWith(query);

    const result =
      reason === undefined
        ? await service.markUnknownInTransaction(ids.occurrenceId, manager)
        : await service.cancelOccurrenceInTransaction(
            ids.occurrenceId,
            reason,
            manager,
          );

    expect(result).toEqual({ status: 'CHANGED' });
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain(`state='${state}'`);
  });

  it('progresses accepted evidence once, CASes READY to CONTACTED, preserves later stages, and finishes', async () => {
    let succeeded = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('campaignEnrollment') && sql.includes('SELECT'))
        return [
          {
            id: ids.enrollmentId,
            state: 'ACTIVE',
            creatorId: ids.creatorId,
            nextAuthoredMessageIndex: succeeded ? 1 : 0,
          },
        ];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [
          {
            id: ids.occurrenceId,
            state: succeeded ? 'SUCCEEDED' : 'IN_FLIGHT',
          },
        ];
      if (sql.includes('outboundEmailAttempt'))
        return [
          projectAttemptLikeQueueWorker(sql, {
            attemptId: ids.attemptId,
            attemptState: 'ACCEPTED',
            projectedMessageId: 'message',
            projectedMessageThreadId: 'thread',
          }),
        ];
      if (sql.includes("SET state='SUCCEEDED'")) {
        succeeded = true;
        return [{ id: ids.occurrenceId }];
      }
      if (sql.includes('campaignCreator')) return [];
      if (sql.includes("SET state='FINISHED'"))
        return [{ terminalAt: inputAcceptedAt }];
      return [];
    });
    const writer = { writeInTransaction: jest.fn() };
    const service = new CampaignProgressionService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      writer as never,
    );
    const manager = managerWith(query);
    const inputAcceptedAt = new Date('2026-09-11T00:00:00.000Z');
    const input = {
      workspaceId: ids.workspaceId,
      campaignId: ids.campaignId,
      enrollmentId: ids.enrollmentId,
      occurrenceId: ids.occurrenceId,
      attemptId: ids.attemptId,
      campaignCreatorId: '20202020-cccc-4ccc-8ccc-cccccccccccc',
      acceptedAuthoredMessageIndex: 0,
      acceptedAt: inputAcceptedAt,
      nextOccurrence: null,
    };
    const reconcile = (
      service as unknown as {
        reconcileAcceptedWithSnapshotInTransaction: (
          value: typeof input,
          owner: EntityManager,
        ) => Promise<unknown>;
      }
    ).reconcileAcceptedWithSnapshotInTransaction.bind(service);

    await expect(reconcile(input, manager)).resolves.toEqual({
      status: 'CHANGED',
    });
    await expect(reconcile(input, manager)).resolves.toEqual({
      status: 'EXACT_REPLAY',
    });
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.find((sql) => sql.includes('outboundEmailAttempt')),
    ).toContain('"localDate"::text AS "localDate"');
    expect(
      statements.filter((sql) => sql.includes("SET state='SUCCEEDED'")),
    ).toHaveLength(1);
    const stageSql = statements.find((sql) => sql.includes('campaignCreator'));
    expect(stageSql).toContain("SET stage='CONTACTED'");
    expect(stageSql).toContain("stage='READY'");
    expect(
      statements.filter((sql) => sql.includes("SET state='FINISHED'")),
    ).toHaveLength(1);
    expect(writer.writeInTransaction).toHaveBeenCalledTimes(1);
    expect(writer.writeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessEventKey: `terminal:enrollment:${ids.enrollmentId}:${inputAcceptedAt.toISOString()}:SEQUENCE_COMPLETED`,
        eventKind: 'TERMINAL',
        creatorId: ids.creatorId,
        reason: 'SEQUENCE_COMPLETED',
      }),
    );
  });

  it.each([
    [
      'PAUSED',
      {
        hasEnrollments: true,
        enrollmentsTerminal: true,
        occurrencesResolved: true,
        attemptsResolved: true,
      },
    ],
    [
      'ACTIVE',
      {
        hasEnrollments: true,
        enrollmentsTerminal: false,
        occurrencesResolved: true,
        attemptsResolved: true,
      },
    ],
    [
      'ACTIVE',
      {
        hasEnrollments: true,
        enrollmentsTerminal: true,
        occurrencesResolved: false,
        attemptsResolved: true,
      },
    ],
    [
      'ACTIVE',
      {
        hasEnrollments: true,
        enrollmentsTerminal: true,
        occurrencesResolved: true,
        attemptsResolved: false,
      },
    ],
  ] as const)(
    'strict completion refuses lifecycle/held/unresolved case %#',
    async (lifecycle, census) => {
      const query = jest.fn(async (sql: string) => {
        if (sql.includes('core.workspace')) return [{ id: ids.workspaceId }];
        if (sql.includes('pg_advisory')) return [];
        if (sql.includes('.campaign WHERE'))
          return [{ id: ids.campaignId, lifecycleStatus: lifecycle }];
        if (sql.includes('SELECT\n          EXISTS')) return [census];
        return [];
      });
      const service = new CampaignProgressionService();

      await expect(
        service.tryCompleteCampaignInTransaction(
          { workspaceId: ids.workspaceId, campaignId: ids.campaignId },
          managerWith(query) as never,
        ),
      ).resolves.toEqual({ status: 'NOT_COMPLETE' });
      expect(
        query.mock.calls.map(([sql]) => String(sql)).join('\n'),
      ).not.toContain('SET "lifecycleStatus"=\'COMPLETED\'');
    },
  );
});
