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
      'sentFolder',
      'archiveFolder',
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
      external: '<myah-400-duplicate-import@example.com>',
      thread: '<myah-400-duplicate-import@example.com>',
    },
  } as const;

  const persistOrdinaryImport = async ({
    identity,
    messageChannelId = ids.channel,
    connectedAccountId = ids.account,
    sender = 'myah-400-sender@example.com',
    receivedAt,
    copies,
  }: {
    identity: (typeof evidence)[keyof typeof evidence];
    messageChannelId?: string;
    connectedAccountId?: string;
    sender?: string;
    receivedAt: Date;
    copies?: Array<{ externalId: string; messageFolderIds: string[] }>;
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
          (
            copies ?? [{ externalId: identity.external, messageFolderIds: [] }]
          ).map((copy) => ({
            externalId: copy.externalId,
            headerMessageId: identity.header,
            messageThreadExternalId: identity.thread,
            subject: 'Subject',
            text: 'Body',
            receivedAt,
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
            messageFolderIds: copy.messageFolderIds,
            isDraft: false,
          })),
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
        `INSERT INTO core."messageFolder"
         (id,"workspaceId",name,"isSentFolder","isSynced","externalId","messageChannelId")
         VALUES
         ($1,$2,'Sent',true,true,'Sent:1',$3),
         ($4,$2,'Archive',false,true,'Archive:1',$3)`,
        [ids.sentFolder, workspaceId, ids.channel, ids.archiveFolder],
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
        `DELETE FROM core."messageFolder" WHERE id=ANY($1::uuid[])`,
        [[ids.sentFolder, ids.archiveFolder]],
      );
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
    // Keep the Date in the application realm used by the real workspace ORM.
    persistedBeforeReplay.providerAcceptedAt.setTime(
      persistedBeforeReplay.providerAcceptedAt.getTime() + 1000,
    );
    const ordinaryImport = await persistOrdinaryImport({
      identity: evidence.projectionFirst,
      receivedAt: persistedBeforeReplay.providerAcceptedAt,
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
    const importedReceivedAt = attemptBeforeImport.providerAcceptedAt;
    importedReceivedAt.setTime(importedReceivedAt.getTime() + 1000);
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

  it('adopts the unique Sent copy after one IMAP batch imports distinct folder UIDs for the same header', async () => {
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const projection = getDomainService<CampaignSentProjectionService>(
      'CampaignSentProjectionService',
    );
    await global.testDataSource.query(
      `UPDATE core."connectedAccount" SET provider='imap_smtp_caldav' WHERE id=$1`,
      [ids.account],
    );
    await global.testDataSource.query(
      `UPDATE core."outboundEmailAttempt"
          SET provider='imap_smtp_caldav',"providerMessageExternalId"=NULL,
              "providerThreadExternalId"=NULL,"resolvedThreadExternalId"="providerHeaderMessageId"
        WHERE "attemptId"=$1`,
      [ids.duplicateAttempt],
    );
    const [attempt] = await global.testDataSource.query(
      `SELECT "providerAcceptedAt" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids.duplicateAttempt],
    );
    const imported = await persistOrdinaryImport({
      identity: evidence.duplicateImport,
      receivedAt: attempt.providerAcceptedAt,
      copies: [
        { externalId: 'Archive:101', messageFolderIds: [ids.archiveFolder] },
        { externalId: 'Sent:202', messageFolderIds: [ids.sentFolder] },
      ],
    });
    const archiveMessageId =
      imported?.messageExternalIdsAndIdsMap.get('Archive:101');
    const sentMessageId = imported?.messageExternalIdsAndIdsMap.get('Sent:202');
    expect(archiveMessageId).toEqual(expect.any(String));
    expect(sentMessageId).toEqual(expect.any(String));
    expect(archiveMessageId).not.toBe(sentMessageId);

    const mailboxCopiesQuery = `SELECT m.id,association."messageExternalId",folder.id AS "folderId",folder."isSentFolder"
         FROM "${schemaName}".message m
         JOIN "${schemaName}"."messageChannelMessageAssociation" association ON association."messageId"=m.id
         JOIN "${schemaName}"."messageChannelMessageAssociationMessageFolder" link
           ON link."messageChannelMessageAssociationId"=association.id
         JOIN core."messageFolder" folder ON folder.id=link."messageFolderId"
        WHERE m."headerMessageId"=$1 ORDER BY association."messageExternalId"`;
    const beforeProjection = await global.testDataSource.query(
      mailboxCopiesQuery,
      [evidence.duplicateImport.header],
    );
    expect(beforeProjection).toEqual([
      {
        id: archiveMessageId,
        messageExternalId: 'Archive:101',
        folderId: ids.archiveFolder,
        isSentFolder: false,
      },
      {
        id: sentMessageId,
        messageExternalId: 'Sent:202',
        folderId: ids.sentFolder,
        isSentFolder: true,
      },
    ]);

    const coordinate = {
      workspaceId,
      campaignId: ids.campaign,
      connectedAccountId: ids.account,
      messageChannelId: ids.channel,
      attemptId: ids.duplicateAttempt,
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

    const [afterProjection] = await global.testDataSource.query(
      `SELECT "projectedMessageId","projectedMessageThreadId",
              (SELECT count(*)::int FROM "${schemaName}".message WHERE "headerMessageId"=$2) owners,
              (SELECT count(*)::int FROM "${schemaName}"."messageChannelMessageAssociation"
                WHERE "messageExternalId"=ANY($3::text[])) mailbox_associations
         FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [
        ids.duplicateAttempt,
        evidence.duplicateImport.header,
        ['Archive:101', 'Sent:202'],
      ],
    );
    expect(afterProjection).toEqual({
      projectedMessageId: sentMessageId,
      projectedMessageThreadId: expect.any(String),
      owners: 2,
      mailbox_associations: 2,
    });
    expect(
      await global.testDataSource.query(mailboxCopiesQuery, [
        evidence.duplicateImport.header,
      ]),
    ).toEqual(beforeProjection);
  });
});
