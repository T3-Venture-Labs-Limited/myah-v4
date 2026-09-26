import { randomUUID } from 'node:crypto';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

type ProviderWrapper = {
  instance?: unknown;
  metatype?: { name?: string };
};

const getDomainService = <T>(serviceName: string): T => {
  const appContainer = (
    global.app as typeof global.app & {
      container: {
        getModules: () => Map<
          unknown,
          { providers: Map<unknown, ProviderWrapper> }
        >;
      };
    }
  ).container;

  for (const moduleRef of appContainer.getModules().values()) {
    for (const [token, provider] of moduleRef.providers) {
      const tokenName =
        typeof token === 'function'
          ? token.name
          : typeof token === 'string'
            ? token
            : undefined;

      if (
        provider.instance &&
        (tokenName === serviceName || provider.metatype?.name === serviceName)
      )
        return provider.instance as T;
    }
  }

  throw new Error(`Integration provider ${serviceName} was not found`);
};

describe('Campaign reply PostgreSQL query', () => {
  it('updates the matched Campaign Creator through the real workspace manager when evidence schema is absent', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const campaignId = randomUUID();
    const campaignCreatorId = randomUUID();
    const creatorId = randomUUID();
    const progression = {
      terminalizeReplyInTransaction: jest
        .fn()
        .mockResolvedValue({ status: 'REPLIED' }),
    };
    const timelineEventWriter = {
      writeInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CampaignReplyService(
      progression as never,
      timelineEventWriter as never,
    );
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const schemaName = getWorkspaceSchemaName(workspaceId);

    await orm.executeInWorkspaceContext(
      async () => {
        const dataSource = await orm.getGlobalWorkspaceDataSource();
        const runner = dataSource.createQueryRunner();

        await runner.connect();
        await runner.startTransaction();

        try {
          expect(runner.manager.constructor.name).toBe(
            'WorkspaceEntityManager',
          );
          expect(runner.manager.queryRunner).toBe(runner);
          // UUID-derived workspace schema identifier; values remain bound.
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}"."campaign" (id,name) VALUES ($1,'MYAH-400')`,
            [campaignId],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}"."creator" (id,name) VALUES ($1,'MYAH-400 Creator')`,
            [creatorId],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage)
             VALUES ($1,$2,$3,'CONTACTED')`,
            [campaignCreatorId, campaignId, creatorId],
          );
          const actualQuery = runner.query.bind(runner);
          const query = jest
            .spyOn(runner, 'query')
            .mockImplementation(async (sql: string, parameters?: unknown[]) =>
              sql.includes('to_regclass')
                ? [{ exists: false }]
                : sql.includes('FROM core."outboundEmailAttempt"') &&
                    sql.includes("e.state='ACTIVE'")
                  ? [
                      {
                        workspaceId,
                        campaignId,
                        enrollmentId: randomUUID(),
                        authorizationId: randomUUID(),
                        authorizationGeneration: 1,
                        activationId: randomUUID(),
                        workflowVersionId: randomUUID(),
                        occurrenceId: randomUUID(),
                        connectedAccountId: randomUUID(),
                        messageChannelId: randomUUID(),
                        attemptId: randomUUID(),
                        campaignCreatorId,
                        creatorId,
                      },
                    ]
                  : actualQuery(sql, parameters),
            );

          await expect(
            service.reconcileInboundMessageInTransaction(
              {
                workspaceId,
                messageChannelId: randomUUID(),
                threadExternalId: 'matched-thread',
                fromHandle: 'sender@example.com',
                inboundEvidenceId: randomUUID(),
                inboundMessageThreadId: randomUUID(),
              },
              runner.manager,
            ),
          ).resolves.toBeUndefined();

          // pi-lens-ignore: sql-injection, no-sql-in-code
          const [creator] = await runner.query(
            `SELECT stage FROM "${schemaName}"."campaignCreator" WHERE id=$1`,
            [campaignCreatorId],
          );
          expect(creator.stage).toBe('NEGOTIATING');
          expect(timelineEventWriter.writeInTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ manager: runner.manager, workspaceId }),
            expect.objectContaining({
              eventKind: 'STAGE_CHANGED',
              messageId: expect.any(String),
              stageValue: 'NEGOTIATING',
            }),
          );
          query.mockRestore();
        } finally {
          await runner.rollbackTransaction();
          await runner.release();
        }
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );
  });

  it('terminalizes one exact active enrollment and cancels only its pending work', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const ids = Object.fromEntries(
      [
        'campaign',
        'controlCampaign',
        'creator',
        'campaignCreator',
        'controlCampaignCreator',
        'execution',
        'authorization',
        'activation',
        'enrollment',
        'acceptedOccurrence',
        'pendingOccurrence',
        'heldOccurrence',
        'attempt',
        'workflow',
        'workflowVersion',
        'message',
        'pendingMessage',
        'heldMessage',
        'evidence',
      ].map((key) => [key, randomUUID()]),
    ) as Record<string, string>;
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const service = new CampaignReplyService(new CampaignProgressionService());
    const inboundThreadId = randomUUID();

    await orm.executeInWorkspaceContext(
      async () => {
        const dataSource = await orm.getGlobalWorkspaceDataSource();
        const runner = dataSource.createQueryRunner();

        await runner.connect();
        await runner.startTransaction();

        try {
          const [routing] = await runner.query(
            `SELECT mc.id AS "messageChannelId", ca.id AS "connectedAccountId",
                    lower(ca.handle) AS sender,
                    (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
               FROM core."messageChannel" mc
               JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
              WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
            [workspaceId],
          );
          expect(routing).toBeDefined();

          // UUID-derived workspace schema identifier; values remain bound.
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,'MYAH-400'),($2,'MYAH-400 control')`,
            [ids.campaign, ids.controlCampaign],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}".creator (id,name) VALUES ($1,'MYAH-400 Creator')`,
            [ids.creator],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage)
             VALUES ($1,$2,$3,'CONTACTED'),($4,$5,$3,'CONTACTED')`,
            [
              ids.campaignCreator,
              ids.campaign,
              ids.creator,
              ids.controlCampaignCreator,
              ids.controlCampaign,
            ],
          );
          await runner.query(
            `INSERT INTO core."campaignExecution"
             (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
             VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
            [ids.execution, workspaceId, ids.campaign],
          );
          await runner.query(
            `INSERT INTO core."campaignSequenceAuthorization"
             ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,
              "startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId",
              "initiatingUserWorkspaceId",state,"authorizedAt",binding)
             VALUES ($1,$2,$3,$4,1,$5,repeat('a',64),$6,$7,$8,'ACTIVE',now(),'{}'::jsonb)`,
            [
              ids.authorization,
              workspaceId,
              ids.campaign,
              ids.execution,
              randomUUID(),
              ids.workflow,
              ids.workflowVersion,
              routing.userWorkspaceId,
            ],
          );
          await runner.query(
            `INSERT INTO core."campaignActivation"
             (id,"workspaceId","campaignId","campaignExecutionId","authorizationId",
              "authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
             VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,3)`,
            [
              ids.activation,
              workspaceId,
              ids.campaign,
              ids.execution,
              ids.authorization,
              ids.workflowVersion,
            ],
          );
          await runner.query(
            `INSERT INTO core."campaignEnrollment"
             (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
              "campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
             VALUES ($1,$2,$3,$4,$5,1,$6,$7,3,1,'ACTIVE',now())`,
            [
              ids.enrollment,
              workspaceId,
              ids.campaign,
              ids.execution,
              ids.authorization,
              ids.campaignCreator,
              ids.creator,
            ],
          );
          for (const [occurrenceId, messageId, index, state] of [
            [ids.acceptedOccurrence, ids.message, 0, 'SUCCEEDED'],
            [ids.pendingOccurrence, ids.pendingMessage, 1, 'PENDING'],
            [ids.heldOccurrence, ids.heldMessage, 2, 'HELD'],
          ]) {
            await runner.query(
              `INSERT INTO core."campaignOccurrence"
               (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt","holdReason","terminalReason","terminalAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11)`,
              [
                occurrenceId,
                workspaceId,
                ids.campaign,
                ids.enrollment,
                ids.workflowVersion,
                messageId,
                index,
                state,
                state === 'HELD' ? 'WORKSPACE_NOT_ACTIVE' : null,
                state === 'SUCCEEDED' ? 'PROVIDER_ACCEPTED' : null,
                state === 'SUCCEEDED' ? new Date() : null,
              ],
            );
          }
          await runner.query(
            `INSERT INTO core."outboundEmailAttempt"
             ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
              provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
              "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
              "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
              "providerMessageId","providerMessageExternalId","providerHeaderMessageId","providerAcceptedAt",retryable,"resolvedThreadExternalId")
             VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google',$5,'creator@example.com',
              'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$6,$7,$8,$9,$10,$11,1,
              repeat('c',64),repeat('d',64),'provider-message','provider-message-external','<accepted@campaign.test>',now(),false,'matched-thread')`,
            [
              ids.attempt,
              workspaceId,
              routing.connectedAccountId,
              routing.messageChannelId,
              routing.sender,
              ids.campaign,
              ids.enrollment,
              ids.acceptedOccurrence,
              ids.authorization,
              ids.workflowVersion,
              ids.message,
            ],
          );
          // A delayed acceptance receipt or skewed Date header must not permit a follow-up send.
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}"."messageThread" (id,subject) VALUES ($1,'Campaign reply')`,
            [inboundThreadId],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await runner.query(
            `INSERT INTO "${schemaName}".message (id,"messageThreadId","receivedAt",subject,"isDraft")
             VALUES ($1,$2,now()-interval '1 hour','Creator reply',false)`,
            [ids.evidence, inboundThreadId],
          );

          await service.reconcileInboundMessageInTransaction(
            {
              workspaceId,
              messageChannelId: routing.messageChannelId,
              threadExternalId: 'matched-thread',
              fromHandle: 'creator@example.com',
              inboundEvidenceId: ids.evidence,
              inboundMessageThreadId: inboundThreadId,
              inReplyToTokens: ['<accepted@campaign.test>'],
            },
            runner.manager,
          );

          const [enrollment] = await runner.query(
            `SELECT state,"terminalReason" FROM core."campaignEnrollment" WHERE id=$1`,
            [ids.enrollment],
          );
          expect(enrollment).toEqual({
            state: 'REPLIED',
            terminalReason: 'REPLY_RECEIVED',
          });
          const occurrences = await runner.query(
            `SELECT id,state,"terminalReason" FROM core."campaignOccurrence"
             WHERE "enrollmentId"=$1 ORDER BY "authoredMessageIndex"`,
            [ids.enrollment],
          );
          expect(occurrences).toEqual([
            {
              id: ids.acceptedOccurrence,
              state: 'SUCCEEDED',
              terminalReason: 'PROVIDER_ACCEPTED',
            },
            {
              id: ids.pendingOccurrence,
              state: 'CANCELLED',
              terminalReason: 'ENROLLMENT_REPLIED',
            },
            {
              id: ids.heldOccurrence,
              state: 'CANCELLED',
              terminalReason: 'ENROLLMENT_REPLIED',
            },
          ]);
          // pi-lens-ignore: sql-injection, no-sql-in-code
          const creators = await runner.query(
            `SELECT id,stage FROM "${schemaName}"."campaignCreator" WHERE id=ANY($1::uuid[]) ORDER BY id`,
            [[ids.campaignCreator, ids.controlCampaignCreator]],
          );
          expect(
            Object.fromEntries(
              creators.map(({ id, stage }: { id: string; stage: string }) => [
                id,
                stage,
              ]),
            ),
          ).toEqual({
            [ids.campaignCreator]: 'NEGOTIATING',
            [ids.controlCampaignCreator]: 'CONTACTED',
          });

          await service.reconcileInboundMessageInTransaction(
            {
              workspaceId,
              messageChannelId: routing.messageChannelId,
              threadExternalId: 'matched-thread',
              fromHandle: 'creator@example.com',
              inboundEvidenceId: ids.evidence,
              inboundMessageThreadId: inboundThreadId,
              inReplyToTokens: ['<accepted@campaign.test>'],
            },
            runner.manager,
          );
          const [replayed] = await runner.query(
            `SELECT state,"terminalReason" FROM core."campaignEnrollment" WHERE id=$1`,
            [ids.enrollment],
          );
          expect(replayed).toEqual(enrollment);
        } finally {
          await runner.rollbackTransaction();
          await runner.release();
        }
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );

    // UUID-derived workspace schema identifier; values remain bound.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    const [rolledBack] = await global.testDataSource.query(
      `SELECT
       (SELECT count(*)::int FROM core."campaignEnrollment" WHERE id=$1) enrollments,
       (SELECT count(*)::int FROM "${schemaName}"."campaignCreator" WHERE id=ANY($2::uuid[])) creators`,
      [ids.enrollment, [ids.campaignCreator, ids.controlCampaignCreator]],
    );
    expect(rolledBack).toEqual({ enrollments: 0, creators: 0 });
  });

  it('allows ordinary inbound evidence with no matching Campaign attempt', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const service = new CampaignReplyService(progression as never);
    const runner = global.testDataSource.createQueryRunner();

    await runner.connect();
    await runner.startTransaction();

    try {
      await expect(
        service.reconcileInboundMessageInTransaction(
          {
            workspaceId: SEED_APPLE_WORKSPACE_ID,
            messageChannelId: randomUUID(),
            threadExternalId: 'ordinary-thread',
            fromHandle: 'sender@example.com',
            inboundEvidenceId: randomUUID(),
            inboundMessageThreadId: randomUUID(),
          },
          runner.manager as never,
        ),
      ).resolves.toBeUndefined();
      expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
