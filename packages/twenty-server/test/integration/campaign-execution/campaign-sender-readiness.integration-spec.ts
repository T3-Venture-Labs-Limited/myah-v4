import { randomUUID } from 'node:crypto';

import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';

describe('Campaign sender readiness PostgreSQL projection', () => {
  it('keeps routine ONGOING sync ready but blocks an incomplete initial sync', async () => {
    const runner = global.testDataSource.createQueryRunner();

    await runner.connect();
    await runner.startTransaction();

    try {
      const queryResult = await runner.query(
        `SELECT workspace.id AS "workspaceId", member.id AS "userWorkspaceId"
           FROM core.workspace workspace
           JOIN core."userWorkspace" member ON member."workspaceId" = workspace.id
          WHERE to_regclass(format('%I.%I', workspace."databaseSchema", 'campaignAccount')) IS NOT NULL
          LIMIT 1`,
      );
      const [fixture] = (Array.isArray(queryResult) &&
      Array.isArray(queryResult[0])
        ? queryResult[0]
        : queryResult) as unknown as Array<{
        workspaceId: string;
        userWorkspaceId: string;
      }>;

      if (!fixture)
        throw new Error('A workspace with CampaignAccount is required');

      const ids = {
        campaign: randomUUID(),
        campaignAccount: randomUUID(),
        connectedAccount: randomUUID(),
        messageChannel: randomUUID(),
      };
      const schemaName = getWorkspaceSchemaName(fixture.workspaceId);
      const senderHandle = `myah-385-${ids.connectedAccount}@example.com`;

      await runner.query(
        `INSERT INTO "${schemaName}"."campaign" (id, name) VALUES ($1, $2)`,
        [ids.campaign, `MYAH-385 ${ids.campaign}`],
      );
      await runner.query(
        `INSERT INTO core."connectedAccount"
          (id, "workspaceId", "userWorkspaceId", handle, name, provider, visibility, scopes)
         VALUES ($1, $2, $3, $4, 'MYAH-385 sender', $5, 'workspace', $6)`,
        [
          ids.connectedAccount,
          fixture.workspaceId,
          fixture.userWorkspaceId,
          senderHandle,
          ConnectedAccountProvider.GOOGLE,
          ['https://www.googleapis.com/auth/gmail.send'],
        ],
      );
      await runner.query(
        `INSERT INTO core."messageChannel"
          (id, "workspaceId", "connectedAccountId", handle, visibility, type,
           "pendingGroupEmailsAction", "syncStatus", "syncStage", "syncedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ids.messageChannel,
          fixture.workspaceId,
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
      await runner.query(
        `INSERT INTO "${schemaName}"."campaignAccount"
          (id, "campaignId", "connectedAccountId", "messageChannelId", channel, "isDefault")
         VALUES ($1, $2, $3, $4, 'EMAIL', true)`,
        [
          ids.campaignAccount,
          ids.campaign,
          ids.connectedAccount,
          ids.messageChannel,
        ],
      );

      const service = new CampaignSenderReadinessService({} as never);
      const snapshot = () =>
        service.getCampaignEmailSenderPoolInTransaction(
          { workspaceId: fixture.workspaceId, campaignId: ids.campaign },
          runner.manager as never,
        );

      await expect(snapshot()).resolves.toMatchObject({
        mailboxes: [{ status: 'READY', reason: null }],
      });

      await runner.query(
        `UPDATE core."messageChannel" SET "syncedAt" = NULL WHERE id = $1`,
        [ids.messageChannel],
      );
      await expect(snapshot()).resolves.toMatchObject({
        mailboxes: [
          {
            status: 'BLOCKED',
            reason: 'ACCOUNT_UNAVAILABLE',
          },
        ],
      });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
