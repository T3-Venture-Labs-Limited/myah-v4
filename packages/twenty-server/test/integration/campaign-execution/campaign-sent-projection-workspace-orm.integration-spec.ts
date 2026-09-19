import { randomUUID } from 'node:crypto';

import { MessageParticipantRole } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignSentProjectionService } from 'src/modules/campaign-execution/services/campaign-sent-projection.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';

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
      'message',
      'importFirstOccurrence',
      'importFirstAttempt',
      'importFirstMessage',
      'crossAccountOccurrence',
      'crossAccountAttempt',
      'crossAccountMessage',
      'duplicateOccurrence',
      'duplicateAttempt',
      'duplicateMessage',
      'duplicateOwnerA',
      'duplicateOwnerB',
      'duplicateThreadA',
      'duplicateThreadB',
      'duplicateAssociationA',
      'duplicateAssociationB',
      'workflow',
      'workflowVersion',
      'account',
      'channel',
      'otherAccount',
      'otherChannel',
    ].map((key) => [key, randomUUID()]),
  ) as Record<string, string>;
  const projectedMessageId = computeCampaignProjectedMessageId(ids.attempt);
  const evidence = {
    projectionFirst: {
      header: '<myah-400-projection-first@example.com>',
      external: 'myah-400-projection-first',
      thread: 'myah-400-projection-first-thread',
    },
    importFirst: {
      header: '<myah-400-import-first@example.com>',
      external: 'myah-400-import-first',
      thread: 'myah-400-import-first-thread',
    },
    crossAccount: {
      header: '<myah-400-cross-account@example.com>',
      external: 'myah-400-cross-account',
      thread: 'myah-400-cross-account-thread',
    },
    duplicateImport: {
      header: '<myah-400-duplicate-import@example.com>',
      external: 'myah-400-duplicate-dispatch',
      mailboxExternal: 'myah-400-duplicate-mailbox',
      thread: 'myah-400-duplicate-thread',
    },
  } as const;

  const persistOrdinaryImport = async ({
    identity,
    messageChannelId = ids.channel,
    connectedAccountId = ids.account,
    sender = 'myah-400-sender@example.com',
    receivedAt,
  }: {
    identity: (typeof evidence)[keyof typeof evidence];
    messageChannelId?: string;
    connectedAccountId?: string;
    sender?: string;
    receivedAt: Date;
  }) => {
    const save =
      getDomainService<MessagingSaveMessagesAndEnqueueContactCreationService>(
        'MessagingSaveMessagesAndEnqueueContactCreationService',
      );

    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );

    return orm.executeInWorkspaceContext(
      () =>
        save.saveMessagesAndEnqueueContactCreation(
          [
            {
              externalId: identity.external,
              headerMessageId: identity.header,
              messageThreadExternalId: identity.thread,
              subject: 'Subject',
              text: 'Body',
              receivedAt: receivedAt.toISOString() as never,
              providerOccurredAt: receivedAt.toISOString(),
              direction: MessageDirection.OUTGOING,
              attachments: [],
              participants: [
                {
                  role: MessageParticipantRole.FROM,
                  handle: sender.toUpperCase(),
                  displayName: 'Imported Sender',
                },
                {
                  role: MessageParticipantRole.TO,
                  handle: 'Creator@Example.com',
                  displayName: 'Imported Creator',
                },
              ],
              isDraft: false,
            },
          ],
          {
            id: messageChannelId,
            isContactAutoCreationEnabled: false,
            excludeNonProfessionalEmails: false,
          } as never,
          {
            id: connectedAccountId,
            workspaceId,
            handle: sender,
            handleAliases: [],
          } as never,
          workspaceId,
          { mode: 'LIVE', generationId: `myah-400-${identity.external}` },
        ),
      buildSystemAuthContext(workspaceId),
    );
  };

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
         VALUES
         ($1,$2,'myah-400-sender@example.com','google',$3,$4,100,0),
         ($5,$2,'myah-400-other@example.com','google',$3,$4,100,0)`,
        [
          ids.account,
          workspaceId,
          template.userWorkspaceId,
          template.account_visibility,
          ids.otherAccount,
        ],
      );
      await manager.query(
        `INSERT INTO core."messageChannel"
         (id,"workspaceId",visibility,handle,type,"pendingGroupEmailsAction","syncStage","connectedAccountId","isContactAutoCreationEnabled")
         VALUES
         ($1,$2,$3,'myah-400-sender@example.com','EMAIL',$4,$5,$6,false),
         ($7,$2,$3,'myah-400-other@example.com','EMAIL',$4,$5,$8,false)`,
        [
          ids.channel,
          workspaceId,
          template.channel_visibility,
          template.pendingGroupEmailsAction,
          template.syncStage,
          ids.account,
          ids.otherChannel,
          ids.otherAccount,
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
         VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,4)`,
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
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,4,4,'ACTIVE',now())`,
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
      const attempts = [
        {
          attemptId: ids.attempt,
          occurrenceId: ids.occurrence,
          messageId: ids.message,
          authoredMessageIndex: 0,
          evidence: evidence.projectionFirst,
        },
        {
          attemptId: ids.importFirstAttempt,
          occurrenceId: ids.importFirstOccurrence,
          messageId: ids.importFirstMessage,
          authoredMessageIndex: 1,
          evidence: evidence.importFirst,
        },
        {
          attemptId: ids.crossAccountAttempt,
          occurrenceId: ids.crossAccountOccurrence,
          messageId: ids.crossAccountMessage,
          authoredMessageIndex: 2,
          evidence: evidence.crossAccount,
        },
        {
          attemptId: ids.duplicateAttempt,
          occurrenceId: ids.duplicateOccurrence,
          messageId: ids.duplicateMessage,
          authoredMessageIndex: 3,
          evidence: evidence.duplicateImport,
        },
      ];
      for (const attempt of attempts) {
        await manager.query(
          `INSERT INTO core."campaignOccurrence"
           (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",
            state,"dueAt","terminalReason","terminalAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'SUCCEEDED',now(),'PROVIDER_ACCEPTED',now())`,
          [
            attempt.occurrenceId,
            workspaceId,
            ids.campaign,
            ids.enrollment,
            ids.workflowVersion,
            attempt.messageId,
            attempt.authoredMessageIndex,
          ],
        );
        await manager.query(
          `INSERT INTO core."outboundEmailAttempt"
           ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
            provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
            "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
            "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
            "providerMessageId","providerMessageExternalId","providerThreadExternalId","providerHeaderMessageId",
            "providerAcceptedAt",retryable,"resolvedThreadExternalId","providerDeliveredRecipients")
           VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google','myah-400-sender@example.com',
            'creator@example.com','ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$5,$6,$7,$8,$9,$10,1,
            repeat('c',64),repeat('d',64),$11,$12,$13,$14,clock_timestamp(),false,$13,
            '{"to":["creator@example.com"],"cc":[],"bcc":[]}'::jsonb)`,
          [
            attempt.attemptId,
            workspaceId,
            ids.account,
            ids.channel,
            ids.campaign,
            ids.enrollment,
            attempt.occurrenceId,
            ids.authorization,
            ids.workflowVersion,
            attempt.messageId,
            attempt.evidence.header,
            attempt.evidence.external,
            attempt.evidence.thread,
            attempt.evidence.header,
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
            attempt.attemptId,
            workspaceId,
            ids.campaign,
            ids.enrollment,
            attempt.occurrenceId,
            ids.authorization,
            ids.workflowVersion,
            attempt.messageId,
          ],
        );
      }
    });
  });

  afterAll(async () => {
    await global.testDataSource.transaction(async (manager) => {
      const channelIds = [ids.channel, ids.otherChannel];
      const attemptIds = [
        ids.attempt,
        ids.importFirstAttempt,
        ids.crossAccountAttempt,
        ids.duplicateAttempt,
      ];
      const occurrenceIds = [
        ids.occurrence,
        ids.importFirstOccurrence,
        ids.crossAccountOccurrence,
        ids.duplicateOccurrence,
      ];
      const persisted = (await manager.query(
        `SELECT DISTINCT m.id,m."messageThreadId"
           FROM "${schemaName}".message m
           JOIN "${schemaName}"."messageChannelMessageAssociation" a ON a."messageId"=m.id
          WHERE a."messageChannelId"=ANY($1::uuid[])`,
        [channelIds],
      )) as Array<{ id: string; messageThreadId: string }>;
      const messageIds = persisted.map((message) => message.id);
      const threadIds = [
        ...new Set(persisted.map((message) => message.messageThreadId)),
      ];
      await manager.query(
        `DELETE FROM "${schemaName}"."messageParticipant" WHERE "messageId"=ANY($1::uuid[])`,
        [messageIds],
      );
      await manager.query(
        `DELETE FROM "${schemaName}"."messageChannelMessageAssociation" WHERE "messageChannelId"=ANY($1::uuid[])`,
        [channelIds],
      );
      await manager.query(
        `DELETE FROM "${schemaName}".message WHERE id=ANY($1::uuid[])`,
        [messageIds],
      );
      await manager.query(
        `DELETE FROM "${schemaName}"."messageThread" WHERE id=ANY($1::uuid[])`,
        [threadIds],
      );
      await manager.query(
        `DELETE FROM core."campaignOutboundRender" WHERE "attemptId"=ANY($1::uuid[])`,
        [attemptIds],
      );
      await manager.query(
        `DELETE FROM core."outboundEmailAttempt" WHERE "attemptId"=ANY($1::uuid[])`,
        [attemptIds],
      );
      await manager.query(
        `DELETE FROM core."campaignOccurrence" WHERE id=ANY($1::uuid[])`,
        [occurrenceIds],
      );
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
      await manager.query(
        `DELETE FROM core."messageChannel" WHERE id=ANY($1::uuid[])`,
        [channelIds],
      );
      await manager.query(
        `DELETE FROM core."connectedAccount" WHERE id=ANY($1::uuid[])`,
        [[ids.account, ids.otherAccount]],
      );
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

  it('reuses one deterministic Message when projection wins the arrival race', async () => {
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
        headerMessageId: evidence.projectionFirst.header,
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
        headerMessageId: evidence.projectionFirst.header,
        subject: 'Subject',
        text: 'Body',
        isDraft: false,
        receivedAt: persistedBeforeReplay.providerAcceptedAt,
      }),
    );
    const ordinaryImport = await persistOrdinaryImport({
      identity: evidence.projectionFirst,
      receivedAt: new Date(
        persistedBeforeReplay.providerAcceptedAt.getTime() + 1000,
      ),
    });
    expect(
      ordinaryImport?.messageExternalIdsAndIdsMap.get(
        evidence.projectionFirst.external,
      ),
    ).toBe(projectedMessageId);
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

  it('adopts one fully verified Message when ordinary import wins the arrival race', async () => {
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const projection = getDomainService<CampaignSentProjectionService>(
      'CampaignSentProjectionService',
    );
    const [attemptBeforeImport] = await global.testDataSource.query(
      `SELECT "providerAcceptedAt" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids.importFirstAttempt],
    );
    const importedReceivedAt = new Date(
      attemptBeforeImport.providerAcceptedAt.getTime() + 1000,
    );
    const [ordinaryImport, concurrentReplay] = await Promise.all([
      persistOrdinaryImport({
        identity: evidence.importFirst,
        receivedAt: importedReceivedAt,
      }),
      persistOrdinaryImport({
        identity: evidence.importFirst,
        receivedAt: importedReceivedAt,
      }),
    ]);
    const importedMessageId = ordinaryImport?.messageExternalIdsAndIdsMap.get(
      evidence.importFirst.external,
    );
    expect(importedMessageId).toEqual(expect.any(String));
    expect(
      concurrentReplay?.messageExternalIdsAndIdsMap.get(
        evidence.importFirst.external,
      ),
    ).toBe(importedMessageId);
    expect(importedMessageId).not.toBe(
      computeCampaignProjectedMessageId(ids.importFirstAttempt),
    );

    const coordinate = {
      workspaceId,
      campaignId: ids.campaign,
      connectedAccountId: ids.account,
      messageChannelId: ids.channel,
      attemptId: ids.importFirstAttempt,
    };
    await expect(
      orm.executeInWorkspaceContext(
        () => projection.reconcile(coordinate),
        buildSystemAuthContext(workspaceId),
      ),
    ).resolves.toBe('PROJECTED');
    await expect(
      orm.executeInWorkspaceContext(
        () => projection.reconcile(coordinate),
        buildSystemAuthContext(workspaceId),
      ),
    ).resolves.toBe('EXACT_REPLAY');

    const [persisted] = await global.testDataSource.query(
      `SELECT a."projectedMessageId",a."projectedMessageThreadId",m."receivedAt",
              (SELECT count(*)::int FROM "${schemaName}".message WHERE "headerMessageId"=$2) messages,
              (SELECT count(*)::int FROM "${schemaName}"."messageChannelMessageAssociation"
                WHERE "messageId"=a."projectedMessageId" AND "messageChannelId"=$3) associations,
              (SELECT count(*)::int FROM "${schemaName}"."messageParticipant"
                WHERE "messageId"=a."projectedMessageId") participants
         FROM core."outboundEmailAttempt" a
         JOIN "${schemaName}".message m ON m.id=a."projectedMessageId"
        WHERE a."attemptId"=$1`,
      [ids.importFirstAttempt, evidence.importFirst.header, ids.channel],
    );
    expect(persisted).toMatchObject({
      projectedMessageId: importedMessageId,
      messages: 1,
      associations: 1,
      participants: 2,
    });
    expect(persisted.projectedMessageThreadId).toEqual(expect.any(String));
    expect(persisted.receivedAt.getTime()).toBe(importedReceivedAt.getTime());
  });

  it('rolls back instead of attaching a same-header Message from another account', async () => {
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const projection = getDomainService<CampaignSentProjectionService>(
      'CampaignSentProjectionService',
    );
    const [attemptBeforeImport] = await global.testDataSource.query(
      `SELECT "providerAcceptedAt" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids.crossAccountAttempt],
    );
    const ordinaryImport = await persistOrdinaryImport({
      identity: evidence.crossAccount,
      messageChannelId: ids.otherChannel,
      connectedAccountId: ids.otherAccount,
      sender: 'myah-400-other@example.com',
      receivedAt: attemptBeforeImport.providerAcceptedAt,
    });
    const otherMessageId = ordinaryImport?.messageExternalIdsAndIdsMap.get(
      evidence.crossAccount.external,
    );
    expect(otherMessageId).toEqual(expect.any(String));

    await expect(
      orm.executeInWorkspaceContext(
        () =>
          projection.reconcile({
            workspaceId,
            campaignId: ids.campaign,
            connectedAccountId: ids.account,
            messageChannelId: ids.channel,
            attemptId: ids.crossAccountAttempt,
          }),
        buildSystemAuthContext(workspaceId),
      ),
    ).rejects.toThrow(
      'Expected Message association conflicts with persisted identity',
    );

    const [evidenceAfterRollback] = await global.testDataSource.query(
      `SELECT a."projectedMessageId",a."projectedMessageThreadId",
              (SELECT count(*)::int FROM "${schemaName}".message WHERE "headerMessageId"=$2) messages,
              (SELECT count(*)::int FROM "${schemaName}"."messageChannelMessageAssociation"
                WHERE "messageId"=$3 AND "messageChannelId"=$4) original_associations,
              (SELECT count(*)::int FROM "${schemaName}"."messageChannelMessageAssociation"
                WHERE "messageId"=$3 AND "messageChannelId"=$5) campaign_associations,
              (SELECT count(*)::int FROM "${schemaName}".message WHERE id=$6) deterministic_messages
         FROM core."outboundEmailAttempt" a WHERE a."attemptId"=$1`,
      [
        ids.crossAccountAttempt,
        evidence.crossAccount.header,
        otherMessageId,
        ids.otherChannel,
        ids.channel,
        computeCampaignProjectedMessageId(ids.crossAccountAttempt),
      ],
    );
    expect(evidenceAfterRollback).toEqual({
      projectedMessageId: null,
      projectedMessageThreadId: null,
      messages: 1,
      original_associations: 1,
      campaign_associations: 0,
      deterministic_messages: 0,
    });
  });

  it('fails closed for two same-window import owners matching everything except provider external identity', async () => {
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const projection = getDomainService<CampaignSentProjectionService>(
      'CampaignSentProjectionService',
    );
    const [attempt] = await global.testDataSource.query(
      `SELECT "providerAcceptedAt" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids.duplicateAttempt],
    );

    await global.testDataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "${schemaName}"."messageThread" (id,subject)
         VALUES ($1,'Subject'),($2,'Subject')`,
        [ids.duplicateThreadA, ids.duplicateThreadB],
      );
      await manager.query(
        `INSERT INTO "${schemaName}".message
         (id,"headerMessageId",subject,text,"receivedAt","messageThreadId","isDraft")
         VALUES
         ($1,$3,'Subject','Body',$4,$5,false),
         ($2,$3,'Subject','Body',$4,$6,false)`,
        [
          ids.duplicateOwnerA,
          ids.duplicateOwnerB,
          evidence.duplicateImport.header,
          attempt.providerAcceptedAt,
          ids.duplicateThreadA,
          ids.duplicateThreadB,
        ],
      );
      await manager.query(
        `INSERT INTO "${schemaName}"."messageChannelMessageAssociation"
         (id,"messageChannelId","messageId","messageExternalId","messageThreadExternalId",direction)
         VALUES
         ($1,$3,$4,$6,$7,'OUTGOING'),
         ($2,$3,$5,$6,$7,'OUTGOING')`,
        [
          ids.duplicateAssociationA,
          ids.duplicateAssociationB,
          ids.channel,
          ids.duplicateOwnerA,
          ids.duplicateOwnerB,
          evidence.duplicateImport.mailboxExternal,
          evidence.duplicateImport.thread,
        ],
      );
      await manager.query(
        `INSERT INTO "${schemaName}"."messageParticipant"
         ("messageId",role,handle,"displayName") VALUES
         ($1,'FROM','myah-400-sender@example.com','Imported Sender'),
         ($1,'TO','creator@example.com','Imported Creator'),
         ($2,'FROM','myah-400-sender@example.com','Imported Sender'),
         ($2,'TO','creator@example.com','Imported Creator')`,
        [ids.duplicateOwnerA, ids.duplicateOwnerB],
      );
    });

    const owners = (await global.testDataSource.query(
      `SELECT m.id,
              count(DISTINCT association.id)::int associations,
              bool_and(association."messageChannelId"=$2) exact_channel,
              bool_and(association."messageExternalId"=$3) external_exact,
              bool_and(association."messageThreadExternalId"=$4) thread_exact,
              bool_and(association.direction='OUTGOING') outgoing,
              count(participant.id)::int participants,
              count(participant.id) FILTER (
                WHERE (participant.role='FROM' AND lower(btrim(participant.handle))='myah-400-sender@example.com')
                   OR (participant.role='TO' AND lower(btrim(participant.handle))='creator@example.com')
              )::int expected_participants
         FROM "${schemaName}".message m
         JOIN "${schemaName}"."messageChannelMessageAssociation" association ON association."messageId"=m.id
         JOIN "${schemaName}"."messageParticipant" participant ON participant."messageId"=m.id
        WHERE m."headerMessageId"=$1
        GROUP BY m.id ORDER BY m.id`,
      [
        evidence.duplicateImport.header,
        ids.channel,
        evidence.duplicateImport.external,
        evidence.duplicateImport.thread,
      ],
    )) as Array<{
      id: string;
      associations: number;
      exact_channel: boolean;
      external_exact: boolean;
      thread_exact: boolean;
      outgoing: boolean;
      participants: number;
      expected_participants: number;
    }>;
    expect(owners).toHaveLength(2);
    expect(owners.map(({ id: _id, ...owner }) => owner)).toEqual([
      {
        associations: 1,
        exact_channel: true,
        external_exact: false,
        thread_exact: true,
        outgoing: true,
        participants: 2,
        expected_participants: 2,
      },
      {
        associations: 1,
        exact_channel: true,
        external_exact: false,
        thread_exact: true,
        outgoing: true,
        participants: 2,
        expected_participants: 2,
      },
    ]);
    const [aggregate] = await global.testDataSource.query(
      `SELECT count(DISTINCT m.id)::int owners,count(participant.id)::int participants,
              count(*) FILTER (WHERE m.id=$2)::int deterministic_rows,
              date_trunc('second',min(m."createdAt"))=date_trunc('second',max(m."createdAt")) same_window
         FROM "${schemaName}".message m
         JOIN "${schemaName}"."messageParticipant" participant ON participant."messageId"=m.id
        WHERE m."headerMessageId"=$1`,
      [
        evidence.duplicateImport.header,
        computeCampaignProjectedMessageId(ids.duplicateAttempt),
      ],
    );
    expect(aggregate).toEqual({
      owners: 2,
      participants: 4,
      deterministic_rows: 0,
      same_window: true,
    });

    await expect(
      orm.executeInWorkspaceContext(
        () =>
          projection.reconcile({
            workspaceId,
            campaignId: ids.campaign,
            connectedAccountId: ids.account,
            messageChannelId: ids.channel,
            attemptId: ids.duplicateAttempt,
          }),
        buildSystemAuthContext(workspaceId),
      ),
    ).rejects.toThrow('Expected Message header identity is not unique');
    const [afterRollback] = await global.testDataSource.query(
      `SELECT "projectedMessageId","projectedMessageThreadId",
              (SELECT count(*)::int FROM "${schemaName}".message WHERE "headerMessageId"=$2) owners
         FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids.duplicateAttempt, evidence.duplicateImport.header],
    );
    expect(afterRollback).toEqual({
      projectedMessageId: null,
      projectedMessageThreadId: null,
      owners: 2,
    });
  });
});
