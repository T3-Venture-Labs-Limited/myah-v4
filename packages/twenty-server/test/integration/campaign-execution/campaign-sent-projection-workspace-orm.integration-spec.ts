import { randomUUID } from 'node:crypto';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignSentProjectionService } from 'src/modules/campaign-execution/services/campaign-sent-projection.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

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

describe('Campaign accepted-send projection workspace ORM boundary', () => {
  const workspaceId = SEED_APPLE_WORKSPACE_ID;
  const schemaName = getWorkspaceSchemaName(workspaceId);
  const ids = Object.fromEntries(
    [
      'campaign',
      'creator',
      'campaignCreator',
      'execution',
      'authorization',
      'activation',
      'enrollment',
      'occurrence',
      'attempt',
      'workflow',
      'workflowVersion',
      'message',
      'account',
      'channel',
    ].map((key) => [key, randomUUID()]),
  ) as Record<string, string>;
  const projectedMessageId = computeCampaignProjectedMessageId(ids.attempt);

  beforeAll(async () => {
    await global.testDataSource.transaction(async (manager) => {
      const [template] = await manager.query(
        `SELECT ca."userWorkspaceId",ca.visibility account_visibility,
                mc.visibility channel_visibility,mc."pendingGroupEmailsAction",mc."syncStage"
           FROM core."connectedAccount" ca
           JOIN core."messageChannel" mc ON mc."connectedAccountId"=ca.id
          WHERE ca."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
        [workspaceId],
      );
      if (!template) throw new Error('Seed email routing fixture unavailable');

      await manager.query(
        `INSERT INTO core."connectedAccount"
         (id,"workspaceId",handle,provider,"userWorkspaceId",visibility,"dailySendLimit","minimumSendIntervalMs")
         VALUES ($1,$2,'myah-400-sender@example.com','google',$3,$4,100,0)`,
        [
          ids.account,
          workspaceId,
          template.userWorkspaceId,
          template.account_visibility,
        ],
      );
      await manager.query(
        `INSERT INTO core."messageChannel"
         (id,"workspaceId",visibility,handle,type,"pendingGroupEmailsAction","syncStage","connectedAccountId","isContactAutoCreationEnabled")
         VALUES ($1,$2,$3,'myah-400-sender@example.com','EMAIL',$4,$5,$6,false)`,
        [
          ids.channel,
          workspaceId,
          template.channel_visibility,
          template.pendingGroupEmailsAction,
          template.syncStage,
          ids.account,
        ],
      );
      await manager.query(
        `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,'MYAH-400 projection')`,
        [ids.campaign],
      );
      await manager.query(
        `INSERT INTO "${schemaName}".creator (id,name) VALUES ($1,'MYAH-400 projection creator')`,
        [ids.creator],
      );
      await manager.query(
        `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage)
         VALUES ($1,$2,$3,'CONTACTED')`,
        [ids.campaignCreator, ids.campaign, ids.creator],
      );
      await manager.query(
        `INSERT INTO core."campaignExecution"
         (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
         VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
        [ids.execution, workspaceId, ids.campaign],
      );
      await manager.query(
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
          template.userWorkspaceId,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignActivation"
         (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
          "workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
         VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,1)`,
        [
          ids.activation,
          workspaceId,
          ids.campaign,
          ids.execution,
          ids.authorization,
          ids.workflowVersion,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignEnrollment"
         (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
          "campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,1,1,'ACTIVE',now())`,
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
      await manager.query(
        `INSERT INTO core."campaignOccurrence"
         (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",
          state,"dueAt","terminalReason","terminalAt")
         VALUES ($1,$2,$3,$4,$5,$6,0,'SUCCEEDED',now(),'PROVIDER_ACCEPTED',now())`,
        [
          ids.occurrence,
          workspaceId,
          ids.campaign,
          ids.enrollment,
          ids.workflowVersion,
          ids.message,
        ],
      );
      await manager.query(
        `INSERT INTO core."outboundEmailAttempt"
         ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
          provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
          "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
          "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
          "providerMessageId","providerMessageExternalId","providerThreadExternalId","providerAcceptedAt",retryable,
          "resolvedThreadExternalId","providerDeliveredRecipients")
         VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google','myah-400-sender@example.com',
          'creator@example.com','ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$5,$6,$7,$8,$9,$10,1,
          repeat('c',64),repeat('d',64),'provider-message','myah-400-provider-message','myah-400-thread',now(),false,
          'myah-400-thread','{"to":["creator@example.com"],"cc":[],"bcc":[]}'::jsonb)`,
        [
          ids.attempt,
          workspaceId,
          ids.account,
          ids.channel,
          ids.campaign,
          ids.enrollment,
          ids.occurrence,
          ids.authorization,
          ids.workflowVersion,
          ids.message,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignOutboundRender"
         ("attemptId","workspaceId","campaignId","enrollmentId","occurrenceId","authorizationId",
          "workflowVersionId","messageId","renderDigest","rendererRevision",subject,html,text,
          "bodyWithSignature","toRecipient","references")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,repeat('c',64),'campaign-renderer/v1','Subject','<p>Body</p>',
          'Body','<p>Body</p>','creator@example.com','[]'::jsonb)`,
        [
          ids.attempt,
          workspaceId,
          ids.campaign,
          ids.enrollment,
          ids.occurrence,
          ids.authorization,
          ids.workflowVersion,
          ids.message,
        ],
      );
    });
  });

  afterAll(async () => {
    await global.testDataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "${schemaName}"."messageParticipant" WHERE "messageId"=$1`,
        [projectedMessageId],
      );
      await manager.query(
        `DELETE FROM "${schemaName}"."messageChannelMessageAssociation" WHERE "messageId"=$1`,
        [projectedMessageId],
      );
      await manager.query(`DELETE FROM "${schemaName}".message WHERE id=$1`, [
        projectedMessageId,
      ]);
      await manager.query(
        `DELETE FROM "${schemaName}"."messageThread" WHERE id=(SELECT "projectedMessageThreadId" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1)`,
        [ids.attempt],
      );
      await manager.query(
        `DELETE FROM core."campaignOutboundRender" WHERE "attemptId"=$1`,
        [ids.attempt],
      );
      await manager.query(
        `DELETE FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
        [ids.attempt],
      );
      await manager.query(`DELETE FROM core."campaignOccurrence" WHERE id=$1`, [
        ids.occurrence,
      ]);
      await manager.query(`DELETE FROM core."campaignEnrollment" WHERE id=$1`, [
        ids.enrollment,
      ]);
      await manager.query(`DELETE FROM core."campaignActivation" WHERE id=$1`, [
        ids.activation,
      ]);
      await manager.query(
        `DELETE FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
        [ids.authorization],
      );
      await manager.query(`DELETE FROM core."campaignExecution" WHERE id=$1`, [
        ids.execution,
      ]);
      await manager.query(`DELETE FROM core."messageChannel" WHERE id=$1`, [
        ids.channel,
      ]);
      await manager.query(`DELETE FROM core."connectedAccount" WHERE id=$1`, [
        ids.account,
      ]);
      await manager.query(
        `DELETE FROM "${schemaName}"."campaignCreator" WHERE id=$1`,
        [ids.campaignCreator],
      );
      await manager.query(`DELETE FROM "${schemaName}".creator WHERE id=$1`, [
        ids.creator,
      ]);
      await manager.query(`DELETE FROM "${schemaName}".campaign WHERE id=$1`, [
        ids.campaign,
      ]);
    });
  });

  it('projects accepted evidence once through real core and workspace repositories', async () => {
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const projection = getDomainService<CampaignSentProjectionService>(
      'CampaignSentProjectionService',
    );
    const coordinate = {
      workspaceId,
      campaignId: ids.campaign,
      connectedAccountId: ids.account,
      messageChannelId: ids.channel,
      attemptId: ids.attempt,
    };

    await expect(
      orm.executeInWorkspaceContext(
        () => projection.reconcile(coordinate),
        buildSystemAuthContext(workspaceId),
      ),
    ).resolves.toBe('PROJECTED');
    const [persistedBeforeReplay] = await global.testDataSource.query(
      `SELECT m."headerMessageId",m.subject,m.text,m."isDraft",m."receivedAt",
              a."providerAcceptedAt"
         FROM "${schemaName}".message m
         JOIN core."outboundEmailAttempt" a ON a."projectedMessageId"=m.id
        WHERE a."attemptId"=$1`,
      [ids.attempt],
    );
    expect(persistedBeforeReplay).toEqual(
      expect.objectContaining({
        headerMessageId: null,
        subject: 'Subject',
        text: 'Body',
        isDraft: false,
      }),
    );
    expect(persistedBeforeReplay.receivedAt.getTime()).toBe(
      persistedBeforeReplay.providerAcceptedAt.getTime(),
    );
    const [workspaceMessage] = await orm.executeInWorkspaceContext(async () => {
      const repository = await orm.getRepository<{
        id: string;
        headerMessageId: string | null;
        subject: string;
        text: string;
        isDraft: boolean;
        receivedAt: Date;
      }>(workspaceId, 'message');

      return repository.find({ where: { id: projectedMessageId } });
    }, buildSystemAuthContext(workspaceId));
    expect(workspaceMessage).toEqual(
      expect.objectContaining({
        headerMessageId: '',
        subject: 'Subject',
        text: 'Body',
        isDraft: false,
        receivedAt: persistedBeforeReplay.providerAcceptedAt,
      }),
    );
    await expect(
      orm.executeInWorkspaceContext(
        () => projection.reconcile(coordinate),
        buildSystemAuthContext(workspaceId),
      ),
    ).resolves.toBe('EXACT_REPLAY');

    const [attempt] = await global.testDataSource.query(
      `SELECT "projectedMessageId","projectedMessageThreadId","attemptState"
         FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids.attempt],
    );
    expect(attempt).toMatchObject({
      projectedMessageId,
      attemptState: 'ACCEPTED',
    });
    expect(attempt.projectedMessageThreadId).toEqual(expect.any(String));
    const [counts] = await global.testDataSource.query(
      `SELECT
       (SELECT count(*)::int FROM "${schemaName}".message WHERE id=$1) messages,
       (SELECT count(*)::int FROM "${schemaName}"."messageThread" WHERE id=$2) threads,
       (SELECT count(*)::int FROM "${schemaName}"."messageChannelMessageAssociation" WHERE "messageId"=$1) associations,
       (SELECT count(*)::int FROM "${schemaName}"."messageParticipant" WHERE "messageId"=$1) participants`,
      [projectedMessageId, attempt.projectedMessageThreadId],
    );
    expect(counts).toEqual({
      messages: 1,
      threads: 1,
      associations: 1,
      participants: 2,
    });
  });
});
