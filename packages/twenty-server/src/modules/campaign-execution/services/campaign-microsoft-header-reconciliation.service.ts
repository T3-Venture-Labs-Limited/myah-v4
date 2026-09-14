import { Injectable } from '@nestjs/common';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';

import { campaignMailboxAdvisoryKeys } from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Injectable()
export class CampaignMicrosoftHeaderReconciliationService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly messagingMessageService: MessagingMessageService,
  ) {}

  async reconcileImportedSentHeader(input: {
    workspaceId: string;
    connectedAccountId: string;
    messageChannelId: string;
    provider: ConnectedAccountProvider;
    direction: MessageDirection;
    providerMessageExternalId: string;
    trustedHeaderMessageId: string;
  }): Promise<'UPDATED' | 'EXACT_REPLAY' | 'DEFERRED'> {
    if (
      ![
        input.workspaceId,
        input.connectedAccountId,
        input.messageChannelId,
      ].every((value) => UUID.test(value)) ||
      input.provider !== ConnectedAccountProvider.MICROSOFT ||
      input.direction !== MessageDirection.OUTGOING ||
      input.providerMessageExternalId.trim().length === 0 ||
      input.trustedHeaderMessageId.trim().length === 0
    )
      return 'DEFERRED';
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    return dataSource.transaction(async (manager) => {
      const runner = manager.queryRunner;
      if (
        !runner?.isTransactionActive ||
        runner.isReleased ||
        runner.manager !== manager
      )
        throw new Error(
          'Microsoft Campaign reconciliation requires active manager',
        );
      const workspace = await runner.query(
        `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
        [input.workspaceId],
      );
      if (!Array.isArray(workspace) || workspace.length !== 1)
        return 'DEFERRED';
      for (const key of campaignMailboxAdvisoryKeys({
        workspaceId: input.workspaceId,
        connectedAccountId: input.connectedAccountId,
        messageChannelIds: [input.messageChannelId],
      }))
        await runner.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
          [key],
        );
      const account = await runner.query(
        `SELECT id FROM core."connectedAccount" WHERE id=$1 AND "workspaceId"=$2 AND provider=$3 FOR UPDATE`,
        [
          input.connectedAccountId,
          input.workspaceId,
          ConnectedAccountProvider.MICROSOFT,
        ],
      );
      const channel = await runner.query(
        `SELECT id FROM core."messageChannel" WHERE id=$1 AND "workspaceId"=$2 AND "connectedAccountId"=$3 FOR UPDATE`,
        [input.messageChannelId, input.workspaceId, input.connectedAccountId],
      );
      if (
        !Array.isArray(account) ||
        account.length !== 1 ||
        !Array.isArray(channel) ||
        channel.length !== 1
      )
        return 'DEFERRED';
      return this.messagingMessageService.reconcileMicrosoftCampaignHeaderInTransaction(
        {
          workspaceId: input.workspaceId,
          connectedAccountId: input.connectedAccountId,
          messageChannelId: input.messageChannelId,
          providerMessageExternalId: input.providerMessageExternalId.trim(),
          trustedHeaderMessageId: input.trustedHeaderMessageId.trim(),
        },
        manager as WorkspaceEntityManager,
      );
    });
  }
}
