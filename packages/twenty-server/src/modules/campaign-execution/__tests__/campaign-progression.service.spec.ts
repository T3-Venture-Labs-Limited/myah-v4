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
};

const routing = { ...ids, authorizationGeneration: 1 };

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
            localDate: '2026-09-11',
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
        ];
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
      expect.objectContaining({ reason: 'WORKSPACE_NOT_ACTIVE' }),
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
      'PENDING',
      'IN_FLIGHT',
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

  it('locks the full routing graph in canonical order before marking UNKNOWN', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('core.workspace')) return [{ id: ids.workspaceId }];
      if (sql.includes('.campaign WHERE')) return [{ id: ids.campaignId }];
      if (sql.includes('campaignSequenceAuthorization'))
        return [{ id: 'auth' }];
      if (sql.includes('campaignActivation')) return [{ id: ids.activationId }];
      if (sql.includes('campaignEnrollment')) return [{ id: ids.enrollmentId }];
      if (sql.includes('campaignOccurrence') && sql.includes('SELECT'))
        return [{ id: ids.occurrenceId, state: 'IN_FLIGHT' }];
      if (sql.includes('outboundEmailAttempt'))
        return [{ ...routing, attemptState: 'UNKNOWN' }];
      return [];
    });
    const service = new CampaignProgressionService();

    await expect(
      service.reconcileUnknownInTransaction(
        routing,
        managerWith(query) as never,
      ),
    ).resolves.toEqual({ status: 'UNKNOWN' });
    const statements = query.mock.calls.map(([sql]) => String(sql));
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
          {
            ...routing,
            source: 'CAMPAIGN_SEQUENCE',
            attemptState: 'RESERVED',
            capacityState: 'RESERVED',
            attemptNumber: 1,
            renderDigest: 'digest',
            unknownAfter,
          },
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
          {
            ...routing,
            source: 'CAMPAIGN_SEQUENCE',
            attemptState: 'RESERVED',
            capacityState: 'RESERVED',
            attemptNumber: 1,
            renderDigest: 'digest',
            unknownAfter: new Date(0),
          },
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
      expect.objectContaining({ reason: 'RESERVATION_EXPIRED' }),
      expect.anything(),
    );
    expect(query.mock.calls.map(([sql]) => String(sql)).join('\n')).toContain(
      "state='HELD'",
    );
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
          {
            attemptId: ids.attemptId,
            attemptState: 'ACCEPTED',
            projectedMessageId: 'message',
            projectedMessageThreadId: 'thread',
          },
        ];
      if (sql.includes("SET state='SUCCEEDED'")) {
        succeeded = true;
        return [{ id: ids.occurrenceId }];
      }
      if (sql.includes('campaignCreator')) return [];
      if (sql.includes("SET state='FINISHED'"))
        return [{ id: ids.enrollmentId }];
      return [];
    });
    const service = new CampaignProgressionService();
    const manager = managerWith(query);
    const input = {
      workspaceId: ids.workspaceId,
      campaignId: ids.campaignId,
      enrollmentId: ids.enrollmentId,
      occurrenceId: ids.occurrenceId,
      attemptId: ids.attemptId,
      campaignCreatorId: '20202020-cccc-4ccc-8ccc-cccccccccccc',
      acceptedAuthoredMessageIndex: 0,
      acceptedAt: new Date('2026-09-11T00:00:00.000Z'),
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
      statements.filter((sql) => sql.includes("SET state='SUCCEEDED'")),
    ).toHaveLength(1);
    const stageSql = statements.find((sql) => sql.includes('campaignCreator'));
    expect(stageSql).toContain("SET stage='CONTACTED'");
    expect(stageSql).toContain("stage='READY'");
    expect(
      statements.filter((sql) => sql.includes("SET state='FINISHED'")),
    ).toHaveLength(1);
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
