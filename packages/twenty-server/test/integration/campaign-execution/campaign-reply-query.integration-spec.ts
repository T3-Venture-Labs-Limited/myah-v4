import { randomUUID } from 'node:crypto';

import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';
import { CampaignExecutionApplicationService } from 'src/modules/campaign-execution/services/campaign-execution-application.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
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
  it('preserves CONTACTED stage for unclassified inbound while terminalizing the exact match', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const campaignId = randomUUID();
    const campaignCreatorId = randomUUID();
    const creatorId = randomUUID();
    const progression = {
      terminalizeReplyInTransaction: jest
        .fn()
        .mockResolvedValue({ status: 'REPLIED' }),
    };
    const service = new CampaignReplyService(progression as never);
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
          await runner.query(
            `INSERT INTO "${schemaName}"."campaign" (id,name) VALUES ($1,'MYAH-400')`,
            [campaignId],
          );
          await runner.query(
            `INSERT INTO "${schemaName}"."creator" (id,name) VALUES ($1,'MYAH-400 Creator')`,
            [creatorId],
          );
          await runner.query(
            `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage)
             VALUES ($1,$2,$3,'CONTACTED')`,
            [campaignCreatorId, campaignId, creatorId],
          );
          const realQuery = runner.query.bind(runner);
          const query = jest
            .spyOn(runner, 'query')
            .mockImplementation((sql, parameters) =>
              String(sql).includes('FROM core."outboundEmailAttempt"')
                ? Promise.resolve([
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
                      enrollmentState: 'ACTIVE',
                    },
                  ])
                : realQuery(sql, parameters),
            );

          await expect(
            service.reconcileInboundMessageInTransaction(
              {
                workspaceId,
                messageChannelId: randomUUID(),
                threadExternalId: 'matched-thread',
                fromHandle: 'sender@example.com',
                inboundEvidenceId: randomUUID(),
              },
              runner.manager,
            ),
          ).resolves.toBeUndefined();

          const [creator] = await runner.query(
            `SELECT stage FROM "${schemaName}"."campaignCreator" WHERE id=$1`,
            [campaignCreatorId],
          );
          expect(creator.stage).toBe('CONTACTED');
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

  it('terminalizes one exact active enrollment and cancels pending and held work', async () => {
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

    await orm.executeInWorkspaceContext(async () => {
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

        await runner.query(
          `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,'MYAH-400'),($2,'MYAH-400 control')`,
          [ids.campaign, ids.controlCampaign],
        );
        await runner.query(
          `INSERT INTO "${schemaName}".creator (id,name,email) VALUES ($1,'MYAH-400 Creator','reply-stop@example.test')`,
          [ids.creator],
        );
        await runner.query(
          `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage,"selectedContactMethod")
             VALUES ($1,$2,$3,'CONTACTED','EMAIL'),($4,$5,$3,'CONTACTED','EMAIL')`,
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
             VALUES ($1,$2,$3,$4,$5,1,$6,$7,4,1,'ACTIVE',now())`,
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
              "providerMessageId","providerMessageExternalId","providerAcceptedAt",retryable,"resolvedThreadExternalId")
             VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google',$5,'creator@example.com',
              'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$6,$7,$8,$9,$10,$11,1,
              repeat('c',64),repeat('d',64),'provider-message','provider-message-external',now(),false,'matched-thread')`,
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

        const audience =
          getDomainService<CampaignOutreachAudienceReviewService>(
            'CampaignOutreachAudienceReviewService',
          );
        const [adminRole] = await runner.query(
          `SELECT id FROM core.role WHERE "workspaceId"=$1 AND label='Admin'`,
          [workspaceId],
        );
        expect(adminRole?.id).toBeDefined();
        const audienceInput = {
          workspaceId,
          campaignId: ids.campaign,
          schemaName,
          manager: runner.manager,
          rolePermissionConfig: { intersectionOf: [adminRole.id] },
        };
        expect(
          (await audience.reviewInTransaction(audienceInput)).eligible.map(
            ({ campaignCreatorId }) => campaignCreatorId,
          ),
        ).toContain(ids.campaignCreator);

        await service.reconcileInboundMessageInTransaction(
          {
            workspaceId,
            messageChannelId: routing.messageChannelId,
            threadExternalId: 'matched-thread',
            fromHandle: 'creator@example.com',
            inboundEvidenceId: ids.evidence,
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
        const afterReply = await audience.reviewInTransaction(audienceInput);
        expect(afterReply.eligible).toEqual([]);
        expect(afterReply.excluded).toEqual([
          expect.objectContaining({
            campaignCreatorId: ids.campaignCreator,
            reasons: ['REPLY_RECEIVED'],
          }),
        ]);
        const controlAudience = await audience.reviewInTransaction({
          ...audienceInput,
          campaignId: ids.controlCampaign,
        });
        expect(controlAudience.eligible).toEqual([
          expect.objectContaining({
            campaignCreatorId: ids.controlCampaignCreator,
          }),
        ]);
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
        const [unmaterialized] = await runner.query(
          `SELECT count(*)::int AS count FROM core."campaignOccurrence" WHERE "enrollmentId"=$1 AND "authoredMessageIndex"=3`,
          [ids.enrollment],
        );
        expect(unmaterialized.count).toBe(0);
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
          [ids.campaignCreator]: 'CONTACTED',
          [ids.controlCampaignCreator]: 'CONTACTED',
        });

        await service.reconcileInboundMessageInTransaction(
          {
            workspaceId,
            messageChannelId: routing.messageChannelId,
            threadExternalId: 'matched-thread',
            fromHandle: 'creator@example.com',
            inboundEvidenceId: ids.evidence,
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
    }, buildSystemAuthContext(workspaceId));

    const [rolledBack] = await global.testDataSource.query(
      `SELECT
       (SELECT count(*)::int FROM core."campaignEnrollment" WHERE id=$1) enrollments,
       (SELECT count(*)::int FROM "${schemaName}"."campaignCreator" WHERE id=ANY($2::uuid[])) creators`,
      [ids.enrollment, [ids.campaignCreator, ids.controlCampaignCreator]],
    );
    expect(rolledBack).toEqual({ enrollments: 0, creators: 0 });
  });

  it('withholds attribution when active and historical Campaigns have accepted evidence for the same thread', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const service = new CampaignReplyService(new CampaignProgressionService());
    const creatorId = randomUUID();
    const campaigns = [
      {
        id: randomUUID(),
        membership: randomUUID(),
        execution: randomUUID(),
        authorization: randomUUID(),
        activation: randomUUID(),
        enrollment: randomUUID(),
        workflow: randomUUID(),
        version: randomUUID(),
        accepted: randomUUID(),
        future: randomUUID(),
        held: randomUUID(),
        attempt: randomUUID(),
        state: 'ACTIVE',
      },
      {
        id: randomUUID(),
        membership: randomUUID(),
        execution: randomUUID(),
        authorization: randomUUID(),
        activation: randomUUID(),
        enrollment: randomUUID(),
        workflow: randomUUID(),
        version: randomUUID(),
        accepted: randomUUID(),
        future: randomUUID(),
        held: randomUUID(),
        attempt: randomUUID(),
        state: 'REPLIED',
      },
    ];
    await orm.executeInWorkspaceContext(async () => {
      const runner = (
        await orm.getGlobalWorkspaceDataSource()
      ).createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        const [routing] = await runner.query(
          `SELECT mc.id AS "messageChannelId", ca.id AS "connectedAccountId", lower(ca.handle) AS sender,
                  (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
             FROM core."messageChannel" mc JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
            WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
          [workspaceId],
        );
        expect(routing).toBeDefined();
        await runner.query(
          `INSERT INTO "${schemaName}".creator (id,name) VALUES ($1,'Shared thread Creator')`,
          [creatorId],
        );
        for (const [index, campaign] of campaigns.entries()) {
          await runner.query(
            `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,$2)`,
            [campaign.id, `Shared thread ${index}`],
          );
          await runner.query(
            `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage)
             VALUES ($1,$2,$3,'CONTACTED')`,
            [campaign.membership, campaign.id, creatorId],
          );
          await runner.query(
            `INSERT INTO core."campaignExecution" (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
             VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
            [campaign.execution, workspaceId, campaign.id],
          );
          await runner.query(
            `INSERT INTO core."campaignSequenceAuthorization"
             ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey",
              "preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
             VALUES ($1,$2,$3,$4,1,$5,repeat('a',64),$6,$7,$8,'ACTIVE',now(),'{}'::jsonb)`,
            [
              campaign.authorization,
              workspaceId,
              campaign.id,
              campaign.execution,
              randomUUID(),
              campaign.workflow,
              campaign.version,
              routing.userWorkspaceId,
            ],
          );
          await runner.query(
            `INSERT INTO core."campaignActivation"
             (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
              "workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
             VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,$7)`,
            [
              campaign.activation,
              workspaceId,
              campaign.id,
              campaign.execution,
              campaign.authorization,
              campaign.version,
              index === 0 ? 3 : 1,
            ],
          );
          await runner.query(
            `INSERT INTO core."campaignEnrollment"
             (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
              "campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt","terminalReason","terminalAt")
             VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,1,$9,now(),$10,$11)`,
            [
              campaign.enrollment,
              workspaceId,
              campaign.id,
              campaign.execution,
              campaign.authorization,
              campaign.membership,
              creatorId,
              index === 0 ? 3 : 1,
              campaign.state,
              index === 0 ? null : 'REPLY_RECEIVED',
              index === 0 ? null : new Date(),
            ],
          );
          const occurrenceRows =
            index === 0
              ? ([
                  [campaign.accepted, 'SUCCEEDED', 0],
                  [campaign.future, 'PENDING', 1],
                  [campaign.held, 'HELD', 2],
                ] as const)
              : ([[campaign.accepted, 'SUCCEEDED', 0]] as const);
          for (const [occurrenceId, state, authoredIndex] of occurrenceRows) {
            await runner.query(
              `INSERT INTO core."campaignOccurrence"
               (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt","holdReason","terminalReason","terminalAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11)`,
              [
                occurrenceId,
                workspaceId,
                campaign.id,
                campaign.enrollment,
                campaign.version,
                randomUUID(),
                authoredIndex,
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
              "providerMessageId","providerMessageExternalId","providerAcceptedAt",retryable,"resolvedThreadExternalId")
             VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google',$5,'creator@example.com',
              'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$6,$7,$8,$9,$10,$11,1,
              repeat('c',64),repeat('d',64),$12,$12,now(),false,'shared-thread')`,
            [
              campaign.attempt,
              workspaceId,
              routing.connectedAccountId,
              routing.messageChannelId,
              routing.sender,
              campaign.id,
              campaign.enrollment,
              campaign.accepted,
              campaign.authorization,
              campaign.version,
              // Use the same message identity as the accepted occurrence.
              (
                await runner.query(
                  `SELECT "messageId" FROM core."campaignOccurrence" WHERE id=$1`,
                  [campaign.accepted],
                )
              )[0].messageId,
              `provider-${campaign.attempt}`,
            ],
          );
        }
        const snapshot = async () => ({
          enrollments: await runner.query(
            `SELECT id,state,"terminalReason","terminalAt" FROM core."campaignEnrollment" WHERE id=ANY($1::uuid[]) ORDER BY id`,
            [campaigns.map(({ enrollment }) => enrollment)],
          ),
          occurrences: await runner.query(
            `SELECT id,state,"holdReason","terminalReason","terminalAt" FROM core."campaignOccurrence" WHERE "enrollmentId"=ANY($1::uuid[]) ORDER BY id`,
            [campaigns.map(({ enrollment }) => enrollment)],
          ),
          attempts: await runner.query(
            `SELECT "attemptId","attemptState","providerMessageId" FROM core."outboundEmailAttempt" WHERE "attemptId"=ANY($1::uuid[]) ORDER BY "attemptId"`,
            [campaigns.map(({ attempt }) => attempt)],
          ),
          stages: await runner.query(
            `SELECT id,stage FROM "${schemaName}"."campaignCreator" WHERE id=ANY($1::uuid[]) ORDER BY id`,
            [campaigns.map(({ membership }) => membership)],
          ),
          timeline: await runner.query(
            `SELECT id FROM "${schemaName}"."timelineActivity" WHERE properties->'campaignEvent'->>'campaignId'=ANY($1::text[]) ORDER BY id`,
            [campaigns.map(({ id }) => id)],
          ),
        });
        const before = await snapshot();
        expect(before.enrollments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: campaigns[0].enrollment,
              state: 'ACTIVE',
            }),
            expect.objectContaining({
              id: campaigns[1].enrollment,
              state: 'REPLIED',
              terminalReason: 'REPLY_RECEIVED',
            }),
          ]),
        );
        expect(before.occurrences).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: campaigns[0].future,
              state: 'PENDING',
            }),
            expect.objectContaining({ id: campaigns[0].held, state: 'HELD' }),
          ]),
        );
        expect(before.attempts).toHaveLength(2);
        const candidates = await runner.query(
          `SELECT e.id,e.state FROM core."outboundEmailAttempt" a
           JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId"
           JOIN core."campaignSequenceAuthorization" auth ON auth."authorizationId"=a."authorizationId" AND auth."workspaceId"=a."workspaceId" AND auth."campaignId"=a."campaignId"
           JOIN core."campaignActivation" act ON act."workspaceId"=a."workspaceId" AND act."campaignId"=a."campaignId" AND act."authorizationId"=a."authorizationId" AND act."authorizationGeneration"=auth.generation AND act."workflowVersionId"=a."workflowVersionId"
           WHERE a."workspaceId"=$1 AND a."messageChannelId"=$2 AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
             AND a."resolvedThreadExternalId"='shared-thread' AND a."normalizedRecipient"='creator@example.com'`,
          [workspaceId, routing.messageChannelId],
        );
        expect(candidates).toEqual(
          expect.arrayContaining([
            { id: campaigns[0].enrollment, state: 'ACTIVE' },
            { id: campaigns[1].enrollment, state: 'REPLIED' },
          ]),
        );
        expect(candidates).toHaveLength(2);
        await service.reconcileInboundMessageInTransaction(
          {
            workspaceId,
            messageChannelId: routing.messageChannelId,
            threadExternalId: 'shared-thread',
            fromHandle: 'creator@example.com',
            inboundEvidenceId: randomUUID(),
          },
          runner.manager,
        );
        expect(await snapshot()).toEqual(before);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    }, buildSystemAuthContext(workspaceId));
  });

  it('previews committed REPLIED history without leaking it through a role-hidden Creator', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const ids = {
      campaign: randomUUID(),
      controlCampaign: randomUUID(),
      creator: randomUUID(),
      visibleCreator: randomUUID(),
      campaignCreator: randomUUID(),
      visibleCampaignCreator: randomUUID(),
      controlCampaignCreator: randomUUID(),
      message: randomUUID(),
      attempt: randomUUID(),
      inboundEvidence: randomUUID(),
      campaignAccount: randomUUID(),
      connectedAccount: randomUUID(),
      messageChannel: randomUUID(),
    };
    const audience = getDomainService<CampaignOutreachAudienceReviewService>(
      'CampaignOutreachAudienceReviewService',
    );
    const [member] = await global.testDataSource.query(
      `SELECT uw.id AS "userWorkspaceId", uw."userId", wm.id AS "workspaceMemberId"
         FROM core."userWorkspace" uw
         JOIN core."roleTarget" rt ON rt."userWorkspaceId"=uw.id
         JOIN core.role r ON r.id=rt."roleId" AND r.label='Admin'
         JOIN "${schemaName}"."workspaceMember" wm ON wm."userId"=uw."userId"
        WHERE uw."workspaceId"=$1 AND wm."deletedAt" IS NULL LIMIT 1`,
      [workspaceId],
    );
    expect(member).toBeDefined();
    const authContext = {
      type: 'user',
      workspace: { id: workspaceId },
      userWorkspaceId: member.userWorkspaceId,
      user: { id: member.userId },
      workspaceMemberId: member.workspaceMemberId,
      workspaceMember: { id: member.workspaceMemberId },
    } as UserWorkspaceAuthContext;

    try {
      await global.testDataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,'Reply preview'),($2,'Control preview')`,
          [ids.campaign, ids.controlCampaign],
        );
        await manager.query(
          `INSERT INTO "${schemaName}".creator (id,name,email) VALUES ($1,'Synthetic reply preview',$2)`,
          [ids.creator, `reply-${ids.creator}@example.test`],
        );
        await manager.query(
          `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage,"selectedContactMethod")
           VALUES ($1,$2,$3,'CONTACTED','EMAIL'),($4,$5,$3,'CONTACTED','EMAIL')`,
          [
            ids.campaignCreator,
            ids.campaign,
            ids.creator,
            ids.controlCampaignCreator,
            ids.controlCampaign,
          ],
        );
        const senderHandle = `reply-${ids.connectedAccount}@example.test`;
        await manager.query(
          `INSERT INTO core."connectedAccount"
           (id,"workspaceId","userWorkspaceId",handle,name,provider,visibility,scopes)
           VALUES ($1,$2,$3,$4,'Synthetic reply sender',$5,'workspace',$6)`,
          [
            ids.connectedAccount,
            workspaceId,
            member.userWorkspaceId,
            senderHandle,
            ConnectedAccountProvider.GOOGLE,
            ['https://www.googleapis.com/auth/gmail.send'],
          ],
        );
        await manager.query(
          `INSERT INTO core."messageChannel"
           (id,"workspaceId","connectedAccountId",handle,visibility,type,
            "pendingGroupEmailsAction","isSyncEnabled","syncStatus","syncStage","syncedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10)`,
          [
            ids.messageChannel,
            workspaceId,
            ids.connectedAccount,
            senderHandle,
            MessageChannelVisibility.SHARE_EVERYTHING,
            MessageChannelType.EMAIL,
            MessageChannelPendingGroupEmailsAction.NONE,
            MessageChannelSyncStatus.ONGOING,
            MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
            new Date('2026-09-16T00:00:00.000Z'),
          ],
        );
        await manager.query(
          `INSERT INTO "${schemaName}"."campaignAccount"
           (id,"campaignId","connectedAccountId","messageChannelId",channel,"isDefault")
           VALUES ($1,$2,$3,$4,'EMAIL',true)`,
          [
            ids.campaignAccount,
            ids.campaign,
            ids.connectedAccount,
            ids.messageChannel,
          ],
        );
        // History is created by the real Start/reply/Stop services below.
        // A hand-authored authorization binding or lifecycle projection would
        // make a new key fail before the audience is revalidated.
      });

      // A positive control must actually activate before the same saved
      // sequence/ready mailbox can discriminate reply history at new-key Start.
      expect(
        (
          await audience.preview({
            authContext,
            campaignId: ids.campaign,
          })
        ).eligible,
      ).toEqual([
        expect.objectContaining({ campaignCreatorId: ids.campaignCreator }),
      ]);
      // Preparation and Start persist metadata/graph only; no worker or
      // outbound provider operation is invoked by this fixture.
      const sequence = getDomainService<CampaignSequenceService>(
        'CampaignSequenceService',
      );
      const scope = { workspaceId, campaignId: ids.campaign, authContext };
      const initial = await sequence.createInitial(scope);
      const saved = await sequence.save({
        ...scope,
        expectedVersionId: initial.versionId,
        sequence: {
          schemaVersion: 1,
          messages: [
            {
              id: ids.message,
              channel: 'EMAIL',
              subject: 'Synthetic reply-stop proof',
              body: JSON.stringify({
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Synthetic' }],
                  },
                ],
              }),
              files: [],
              replyToThread: false,
            },
          ],
          delaysSeconds: [],
        },
      });
      expect(saved.issues).toEqual([]);
      const published = await sequence.publish({
        ...scope,
        expectedVersionId: saved.versionId,
      });
      expect(published.versionId).toBe(saved.versionId);
      expect(published.versionStatus).toBe('ACTIVE');
      const application = getDomainService<CampaignExecutionApplicationService>(
        'CampaignExecutionApplicationService',
      );
      expect(
        await application.start(ids.campaign, randomUUID(), authContext),
      ).toMatchObject({
        status: 'STARTED',
        lifecycleStatus: 'ACTIVE',
        changed: true,
        replayed: false,
      });
      const [graph] = await global.testDataSource.query(
        `SELECT e.id AS "enrollmentId", e."authorizationId", o."workflowVersionId",
                o.id AS "occurrenceId", o."messageId", o.state AS "occurrenceState"
           FROM core."campaignEnrollment" e
           JOIN core."campaignOccurrence" o ON o."enrollmentId"=e.id
          WHERE e."workspaceId"=$1 AND e."campaignId"=$2 AND e."campaignCreatorId"=$3`,
        [workspaceId, ids.campaign, ids.campaignCreator],
      );
      expect(graph).toMatchObject({
        messageId: ids.message,
        occurrenceState: 'PENDING',
      });
      const recipient = `reply-${ids.creator}@example.test`;
      const sender = `reply-${ids.connectedAccount}@example.test`;
      const thread = `synthetic-${ids.attempt}`;
      await global.testDataSource.transaction(async (manager) => {
        // Synthetic accepted receipt only: no provider adapter or send runs.
        await manager.query(
          `UPDATE core."campaignOccurrence"
             SET state='SUCCEEDED', "terminalReason"='PROVIDER_ACCEPTED', "terminalAt"=now()
           WHERE id=$1 AND state='PENDING'`,
          [graph.occurrenceId],
        );
        await manager.query(
          `INSERT INTO core."outboundEmailAttempt"
           ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
            provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
            "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
            "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
            "providerMessageId","providerMessageExternalId","providerAcceptedAt",retryable,"resolvedThreadExternalId")
           VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google',$5,$6,
            'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$7,$8,$9,$10,$11,$12,1,
            repeat('c',64),repeat('d',64),$13,$13,now(),false,$14)`,
          [
            ids.attempt,
            workspaceId,
            ids.connectedAccount,
            ids.messageChannel,
            sender,
            recipient,
            ids.campaign,
            graph.enrollmentId,
            graph.occurrenceId,
            graph.authorizationId,
            graph.workflowVersionId,
            graph.messageId,
            `provider-${ids.attempt}`,
            thread,
          ],
        );
      });
      const orm = getDomainService<GlobalWorkspaceOrmManager>(
        'GlobalWorkspaceOrmManager',
      );
      await orm.executeInWorkspaceContext(async () => {
        const dataSource = await orm.getGlobalWorkspaceDataSource();
        await dataSource.transaction(async (manager) => {
          await new CampaignReplyService(
            new CampaignProgressionService(),
          ).reconcileInboundMessageInTransaction(
            {
              workspaceId,
              messageChannelId: ids.messageChannel,
              threadExternalId: thread,
              fromHandle: recipient,
              inboundEvidenceId: ids.inboundEvidence,
            },
            manager as never,
          );
        });
      }, buildSystemAuthContext(workspaceId));
      expect(
        (
          await global.testDataSource.query(
            `SELECT state,"terminalReason" FROM core."campaignEnrollment" WHERE id=$1`,
            [graph.enrollmentId],
          )
        )[0],
      ).toEqual({ state: 'REPLIED', terminalReason: 'REPLY_RECEIVED' });
      const target = await audience.preview({
        authContext,
        campaignId: ids.campaign,
      });
      expect(target.eligible).toEqual([]);
      expect(target.excluded).toEqual([
        expect.objectContaining({
          campaignCreatorId: ids.campaignCreator,
          reasons: ['REPLY_RECEIVED'],
        }),
      ]);
      expect(
        (
          await audience.preview({
            authContext,
            campaignId: ids.controlCampaign,
          })
        ).eligible,
      ).toEqual([
        expect.objectContaining({
          campaignCreatorId: ids.controlCampaignCreator,
        }),
      ]);
      expect(await application.stop(ids.campaign, authContext)).toMatchObject({
        status: 'STOPPED',
        lifecycleStatus: 'STOPPED',
      });
      const startKey = randomUUID();
      expect(
        await application.start(ids.campaign, startKey, authContext),
      ).toMatchObject({
        status: 'BLOCKED',
        reason: 'CURRENT_REVIEW_INVALID',
        changed: false,
        replayed: false,
      });
      const [newGraph] = await global.testDataSource.query(
        `SELECT
           (SELECT count(*)::int FROM core."campaignSequenceAuthorization"
             WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "startIdempotencyKey"=$3) AS "newAuthorizations",
           (SELECT count(*)::int FROM core."campaignEnrollment"
             WHERE "workspaceId"=$1 AND "campaignId"=$2) AS enrollments,
           (SELECT count(*)::int FROM core."campaignOccurrence"
             WHERE "workspaceId"=$1 AND "campaignId"=$2) AS occurrences`,
        [workspaceId, ids.campaign, startKey],
      );
      expect(newGraph).toEqual({
        newAuthorizations: 0,
        enrollments: 1,
        occurrences: 1,
      });

      // Keep the replied membership readable while denying its Creator. A
      // second, distinct Creator proves the restricted preview is not empty
      // merely because the role cannot read any audience records.
      await global.testDataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO "${schemaName}".creator (id,name,email)
           VALUES ($1,'Visible reply preview',$2)`,
          [ids.visibleCreator, `visible-${ids.visibleCreator}@example.test`],
        );
        await manager.query(
          `INSERT INTO "${schemaName}"."campaignCreator"
           (id,"campaignId","creatorId",stage,"selectedContactMethod")
           VALUES ($1,$2,$3,'CONTACTED','EMAIL')`,
          [ids.visibleCampaignCreator, ids.campaign, ids.visibleCreator],
        );
      });
      const adminPreview = await audience.preview({
        authContext,
        campaignId: ids.campaign,
      });
      expect(adminPreview.eligible).toEqual([
        expect.objectContaining({
          campaignCreatorId: ids.visibleCampaignCreator,
          creatorId: ids.visibleCreator,
        }),
      ]);
      expect(adminPreview.excluded).toEqual([
        expect.objectContaining({
          campaignCreatorId: ids.campaignCreator,
          creatorId: ids.creator,
          reasons: ['REPLY_RECEIVED'],
        }),
      ]);

      const roleTargets = await global.testDataSource.query(
        `SELECT id, "roleId" FROM core."roleTarget"
          WHERE "workspaceId"=$1 AND "userWorkspaceId"=$2`,
        [workspaceId, member.userWorkspaceId],
      );
      expect(roleTargets).toHaveLength(1);
      const [roleTarget] = roleTargets;
      const roleId = randomUUID();
      const [applicationRow] = await global.testDataSource.query(
        `SELECT id FROM core.application WHERE "workspaceId"=$1 LIMIT 1`,
        [workspaceId],
      );
      expect(applicationRow).toBeDefined();
      const metadata = await global.testDataSource.query(
        `SELECT id, "nameSingular" FROM core."objectMetadata"
          WHERE "workspaceId"=$1 AND "nameSingular"=ANY($2::text[])`,
        [workspaceId, ['campaign', 'campaignCreator', 'creator']],
      );
      expect(metadata).toHaveLength(3);
      const objectId = (name: string): string => {
        const row = metadata.find(
          (item: { nameSingular: string }) => item.nameSingular === name,
        );
        if (!row) throw new Error(`Missing ${name} metadata`);
        return row.id;
      };
      const [creatorIdField] = await global.testDataSource.query(
        `SELECT id FROM core."fieldMetadata"
          WHERE "workspaceId"=$1 AND "objectMetadataId"=$2 AND name='id'`,
        [workspaceId, objectId('creator')],
      );
      expect(creatorIdField).toBeDefined();
      const cache = getDomainService<{
        invalidateAndRecompute: (
          workspace: string,
          keys: string[],
        ) => Promise<void>;
      }>('WorkspaceCacheService');
      const actor = getDomainService<{
        buildUserAndAgentActorContext: (
          userWorkspace: string,
          workspace: string,
        ) => Promise<{ authContext: UserWorkspaceAuthContext }>;
      }>('AgentActorContextService');
      const cacheKeys = [
        'rolesPermissions',
        'userWorkspaceRoleMap',
        'flatRoleMaps',
        'flatRoleTargetMaps',
        'flatObjectPermissionMaps',
        'flatRowLevelPermissionPredicateMaps',
        'flatRowLevelPermissionPredicateGroupMaps',
      ];
      try {
        await global.testDataSource.transaction(async (manager) => {
          await manager.query(
            `INSERT INTO core.role
             (id,"workspaceId","universalIdentifier","applicationId",label,
              "canReadAllObjectRecords","canUpdateAllObjectRecords",
              "canSoftDeleteAllObjectRecords","canDestroyAllObjectRecords")
             VALUES ($1,$2,$3,$4,$5,false,false,false,false)`,
            [
              roleId,
              workspaceId,
              randomUUID(),
              applicationRow.id,
              `MYAH-392 preview ${roleId}`,
            ],
          );
          for (const name of ['campaign', 'campaignCreator', 'creator']) {
            await manager.query(
              `INSERT INTO core."objectPermission"
               (id,"workspaceId","universalIdentifier","applicationId","roleId",
                "objectMetadataId","canReadObjectRecords","canUpdateObjectRecords",
                "canSoftDeleteObjectRecords","canDestroyObjectRecords")
               VALUES ($1,$2,$3,$4,$5,$6,true,false,false,false)`,
              [
                randomUUID(),
                workspaceId,
                randomUUID(),
                applicationRow.id,
                roleId,
                objectId(name),
              ],
            );
          }
          await manager.query(
            `INSERT INTO core."rowLevelPermissionPredicate"
             (id,"workspaceId","universalIdentifier","applicationId","roleId",
              "objectMetadataId","fieldMetadataId",operand,value)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'IS',$8::jsonb)`,
            [
              randomUUID(),
              workspaceId,
              randomUUID(),
              applicationRow.id,
              roleId,
              objectId('creator'),
              creatorIdField.id,
              JSON.stringify(ids.visibleCreator),
            ],
          );
          await manager.query(
            `UPDATE core."roleTarget" SET "roleId"=$1 WHERE id=$2`,
            [roleId, roleTarget.id],
          );
        });
        await cache.invalidateAndRecompute(workspaceId, cacheKeys);
        const restrictedAuthContext = (
          await actor.buildUserAndAgentActorContext(
            member.userWorkspaceId,
            workspaceId,
          )
        ).authContext;
        const restrictedPreview = await audience.preview({
          authContext: restrictedAuthContext,
          campaignId: ids.campaign,
        });
        expect(restrictedPreview.eligible).toEqual([
          expect.objectContaining({
            campaignCreatorId: ids.visibleCampaignCreator,
            creatorId: ids.visibleCreator,
          }),
        ]);
        expect(restrictedPreview.excluded).toEqual([
          expect.objectContaining({
            campaignCreatorId: ids.campaignCreator,
            creatorId: ids.creator,
            creatorName: null,
            reasons: ['MISSING_CREATOR'],
          }),
        ]);
      } finally {
        await global.testDataSource.transaction(async (manager) => {
          await manager.query(
            `UPDATE core."roleTarget" SET "roleId"=$1 WHERE id=$2`,
            [roleTarget.roleId, roleTarget.id],
          );
          await manager.query(`DELETE FROM core.role WHERE id=$1`, [roleId]);
        });
        await cache.invalidateAndRecompute(workspaceId, cacheKeys);
      }
    } finally {
      await global.testDataSource.transaction(async (manager) => {
        await manager.query(
          `DELETE FROM "${schemaName}"."timelineActivity"
            WHERE properties->'campaignEvent'->>'campaignId'=$1`,
          [ids.campaign],
        );
        for (const table of [
          'outboundEmailAttempt',
          'campaignOccurrence',
          'campaignEnrollment',
          'campaignActivation',
          'campaignSequenceAuthorization',
          'campaignExecution',
        ]) {
          // Allowlisted core table identifiers; every delete is restricted to
          // the UUID-unique synthetic Campaign, never the whole workspace.
          await manager.query(
            `DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND "campaignId"=$2`,
            [workspaceId, ids.campaign],
          );
        }
        await manager.query(
          `DELETE FROM "${schemaName}"."workflowVersion"
           WHERE "workflowId" IN (SELECT id FROM "${schemaName}".workflow WHERE "outreachCampaignId"=$1)`,
          [ids.campaign],
        );
        await manager.query(
          `DELETE FROM "${schemaName}".workflow WHERE "outreachCampaignId"=$1`,
          [ids.campaign],
        );
        await manager.query(
          `DELETE FROM "${schemaName}"."campaignAccount" WHERE id=$1`,
          [ids.campaignAccount],
        );
        await manager.query(`DELETE FROM core."messageChannel" WHERE id=$1`, [
          ids.messageChannel,
        ]);
        await manager.query(`DELETE FROM core."connectedAccount" WHERE id=$1`, [
          ids.connectedAccount,
        ]);
        await manager.query(
          `DELETE FROM "${schemaName}"."campaignCreator" WHERE id=ANY($1::uuid[])`,
          [
            [
              ids.campaignCreator,
              ids.controlCampaignCreator,
              ids.visibleCampaignCreator,
            ],
          ],
        );
        await manager.query(
          `DELETE FROM "${schemaName}".creator WHERE id=ANY($1::uuid[])`,
          [[ids.creator, ids.visibleCreator]],
        );
        await manager.query(
          `DELETE FROM "${schemaName}".campaign WHERE id=ANY($1::uuid[])`,
          [[ids.campaign, ids.controlCampaign]],
        );
      });
      const [remaining] = await global.testDataSource.query(
        `SELECT count(*)::int AS count FROM core."campaignEnrollment" WHERE "workspaceId"=$1 AND "campaignId"=$2`,
        [workspaceId, ids.campaign],
      );
      expect(remaining.count).toBe(0);
    }
  });

  it('waits for the workspace lock before querying even an unmatched inbound thread', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const holding = global.testDataSource.createQueryRunner();
    const replying = global.testDataSource.createQueryRunner();
    await Promise.all([holding.connect(), replying.connect()]);
    let replyPromise: Promise<void> | undefined;
    try {
      await holding.startTransaction();
      await holding.query(
        'SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE',
        [workspaceId],
      );
      const [{ pid }] = await replying.query('SELECT pg_backend_pid() AS pid');
      await replying.startTransaction();
      const service = new CampaignReplyService(
        new CampaignProgressionService(),
      );
      replyPromise = service.reconcileInboundMessageInTransaction(
        {
          workspaceId,
          messageChannelId: randomUUID(),
          threadExternalId: `unmatched-${randomUUID()}`,
          fromHandle: 'synthetic@example.test',
          inboundEvidenceId: randomUUID(),
        },
        replying.manager as never,
      );

      let blockers: number[] = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        [{ blockers }] = await global.testDataSource.query(
          'SELECT pg_blocking_pids($1)::int[] AS blockers',
          [pid],
        );
        if (blockers.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const [{ holdingPid }] = await holding.query(
        'SELECT pg_backend_pid() AS "holdingPid"',
      );
      expect(blockers).toContain(holdingPid);
      await holding.rollbackTransaction();
      await replyPromise;
      await replying.rollbackTransaction();
    } finally {
      if (holding.isTransactionActive) await holding.rollbackTransaction();
      if (replyPromise) await replyPromise;
      if (replying.isTransactionActive) await replying.rollbackTransaction();
      await Promise.all([holding.release(), replying.release()]);
    }
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
            workspaceId: randomUUID(),
            messageChannelId: randomUUID(),
            threadExternalId: 'ordinary-thread',
            fromHandle: 'sender@example.com',
            inboundEvidenceId: randomUUID(),
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
