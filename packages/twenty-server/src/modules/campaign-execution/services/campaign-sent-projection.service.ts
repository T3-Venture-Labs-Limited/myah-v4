import { Injectable } from '@nestjs/common';

import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { campaignMailboxAdvisoryKeys } from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' && CANONICAL_UUID.test(value);

export type CampaignSentProjectionCoordinate = Readonly<{
  workspaceId: string;
  campaignId: string;
  connectedAccountId: string;
  messageChannelId: string;
  attemptId: string;
}>;

@Injectable()
export class CampaignSentProjectionService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly sentPersistence: SentMessagePersistenceService,
  ) {}

  async reconcile(
    input: CampaignSentProjectionCoordinate,
  ): Promise<'PROJECTED' | 'EXACT_REPLAY' | 'DEFERRED'> {
    if (
      ![
        input.workspaceId,
        input.campaignId,
        input.connectedAccountId,
        input.messageChannelId,
        input.attemptId,
      ].every(isCanonicalUuid)
    )
      return 'DEFERRED';
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();

    return dataSource.transaction(async (manager) => {
      const runner = manager.queryRunner;
      if (!runner?.isTransactionActive || runner.manager !== manager)
        throw new Error('Campaign projection requires active manager');
      const workspace = await runner.query(
        `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      );
      if (!Array.isArray(workspace) || workspace.length !== 1)
        return 'DEFERRED';
      await runner.query(
        `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
        [input.workspaceId, input.campaignId],
      );
      const campaign = await runner.query(
        `SELECT id FROM "${getWorkspaceSchemaName(input.workspaceId)}".campaign WHERE id=$1 FOR UPDATE`,
        [input.campaignId],
      );
      if (!Array.isArray(campaign) || campaign.length !== 1) return 'DEFERRED';
      for (const key of campaignMailboxAdvisoryKeys({
        workspaceId: input.workspaceId,
        connectedAccountId: input.connectedAccountId,
        messageChannelIds: [input.messageChannelId],
      })) {
        await runner.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
          [key],
        );
      }
      const accountLocks = await runner.query(
        `SELECT id FROM core."connectedAccount" WHERE id=$1 AND "workspaceId"=$2 FOR UPDATE`,
        [input.connectedAccountId, input.workspaceId],
      );
      const channelLocks = await runner.query(
        `SELECT id FROM core."messageChannel" WHERE id=$1 AND "connectedAccountId"=$2 AND "workspaceId"=$3 FOR UPDATE`,
        [input.messageChannelId, input.connectedAccountId, input.workspaceId],
      );
      if (
        !Array.isArray(accountLocks) ||
        accountLocks.length !== 1 ||
        !Array.isArray(channelLocks) ||
        channelLocks.length !== 1
      )
        return 'DEFERRED';
      const attempts = await runner.query(
        `SELECT a.*, r.subject, r.text, r."toRecipient", r."inReplyTo", r."threadExternalId"
           FROM core."outboundEmailAttempt" a
           JOIN core."campaignOutboundRender" r ON r."attemptId"=a."attemptId" AND r."workspaceId"=a."workspaceId"
          WHERE a."attemptId"=$1 AND a."workspaceId"=$2 AND a."campaignId"=$3
            AND a."connectedAccountId"=$4 AND a."messageChannelId"=$5
          FOR UPDATE OF a`,
        [
          input.attemptId,
          input.workspaceId,
          input.campaignId,
          input.connectedAccountId,
          input.messageChannelId,
        ],
      );
      if (!Array.isArray(attempts) || attempts.length !== 1) return 'DEFERRED';
      const attempt = attempts[0];
      if (
        attempt.source !== 'CAMPAIGN_SEQUENCE' ||
        attempt.attemptState !== 'ACCEPTED'
      )
        return 'DEFERRED';
      const expectedMessageId = computeCampaignProjectedMessageId(
        input.attemptId,
      );
      const pointerReplay =
        attempt.projectedMessageId === expectedMessageId &&
        typeof attempt.projectedMessageThreadId === 'string';
      if (
        (!pointerReplay &&
          (attempt.projectedMessageId !== null ||
            attempt.projectedMessageThreadId !== null)) ||
        !(attempt.providerAcceptedAt instanceof Date) ||
        typeof attempt.providerMessageId !== 'string' ||
        typeof attempt.resolvedThreadExternalId !== 'string'
      )
        return 'DEFERRED';
      const connectedAccount = await manager
        .getRepository(ConnectedAccountEntity)
        .findOneOrFail({
          where: {
            id: input.connectedAccountId,
            workspaceId: input.workspaceId,
          },
        });
      const persisted = await this.sentPersistence.persistSentMessage({
        sendResult: {
          headerMessageId:
            attempt.reconciledProviderHeaderMessageId ??
            attempt.providerHeaderMessageId ??
            null,
          ...(attempt.providerMessageExternalId === null
            ? {}
            : { messageExternalId: attempt.providerMessageExternalId }),
          ...(attempt.providerThreadExternalId === null
            ? {}
            : { threadExternalId: attempt.providerThreadExternalId }),
          ...(attempt.providerDeliveredRecipients === null
            ? {}
            : { deliveredRecipients: attempt.providerDeliveredRecipients }),
        },
        subject: attempt.subject,
        body: attempt.text,
        recipients: { to: [attempt.toRecipient], cc: [], bcc: [] },
        connectedAccount,
        messageChannelId: input.messageChannelId,
        ...(attempt.inReplyTo === null ? {} : { inReplyTo: attempt.inReplyTo }),
        ...(attempt.threadExternalId === null
          ? {}
          : { parentThreadExternalId: attempt.threadExternalId }),
        workspaceId: input.workspaceId,
        expectedMessageId,
        providerAcceptedAt: attempt.providerAcceptedAt,
        transactionManager: manager as WorkspaceEntityManager,
      });
      if (!persisted || persisted.messageId !== expectedMessageId)
        throw new Error('Campaign sent projection identity conflict');
      if (pointerReplay) {
        if (persisted.messageThreadId !== attempt.projectedMessageThreadId)
          throw new Error('Campaign sent projection identity conflict');
        return 'EXACT_REPLAY';
      }
      const changedResult = await runner.query(
        `UPDATE core."outboundEmailAttempt"
            SET "projectedMessageId"=$2,"projectedMessageThreadId"=$3,"updatedAt"=clock_timestamp()
          WHERE "attemptId"=$1 AND "projectedMessageId" IS NULL AND "projectedMessageThreadId" IS NULL
          RETURNING "attemptId"`,
        [input.attemptId, persisted.messageId, persisted.messageThreadId],
        true,
      );
      const changed = Array.isArray(changedResult)
        ? changedResult
        : changedResult.records;
      if (!Array.isArray(changed) || changed.length !== 1) {
        const replay = await runner.query(
          `SELECT "projectedMessageId","projectedMessageThreadId"
             FROM core."outboundEmailAttempt" WHERE "attemptId"=$1 FOR UPDATE`,
          [input.attemptId],
        );
        if (
          Array.isArray(replay) &&
          replay.length === 1 &&
          replay[0].projectedMessageId === persisted.messageId &&
          replay[0].projectedMessageThreadId === persisted.messageThreadId
        )
          return 'EXACT_REPLAY';
        throw new Error('Campaign sent projection CAS failed');
      }
      return 'PROJECTED';
    });
  }
}
