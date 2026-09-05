import { randomUUID } from 'node:crypto';

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';
import { DataSource } from 'typeorm';

import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { OutreachEmailActionDefinition } from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MyahE2eFixtureRegistryService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture-registry.service';

const EXPECTED_SUBJECT = 'MYAH-270 fixture subject';
const EXPECTED_BODY = 'MYAH-270 fixture body';
const EXPECTED_RECIPIENT = 'creator@myah-e2e.fixture.test';
const CAMPAIGN_OPERATIONS_HASH = 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba';

type AuthenticatedFixtureContext = {
  workspaceId: string;
  userWorkspaceId: string;
};

type CreatedMailbox = {
  connectedAccountId: string;
  messageChannelId: string;
  email: string;
};

@Injectable()
export class MyahE2eFixtureService implements OnModuleDestroy {
  constructor(
    private readonly dataSource: DataSource,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly actionApprovalService: ActionApprovalService,
    private readonly outreachEmailActionDefinition: OutreachEmailActionDefinition,
    private readonly registry: MyahE2eFixtureRegistryService,
  ) {}

  async createCampaignMailboxFixture(
    context: AuthenticatedFixtureContext,
    campaignId: string,
  ) {
    await this.assertCampaign(context.workspaceId, campaignId);

    const fixtureNonce = randomUUID();
    const defaultMailbox = await this.createMailbox(
      context,
      fixtureNonce,
      'default',
      false,
    );
    const firstAvailable = await this.createMailbox(
      context,
      fixtureNonce,
      'available-1',
      false,
    );
    const secondAvailable = await this.createMailbox(
      context,
      fixtureNonce,
      'available-2',
      false,
    );
    const unavailable = await this.createMailbox(
      context,
      fixtureNonce,
      'reconnect',
      true,
    );
    const schemaName = getWorkspaceSchemaName(context.workspaceId);
    const campaignAccountId = randomUUID();
    const creatorId = randomUUID();
    const campaignCreatorId = randomUUID();
    const outreachActionId = randomUUID();
    const threadId = randomUUID();
    const messageId = randomUUID();
    const partId = randomUUID();

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO "${schemaName}"."campaignAccount" (
            "id", "campaignId", "connectedAccountId", "messageChannelId", "channel", "isDefault"
          ) VALUES ($1, $2, $3, $4, 'EMAIL', true)`,
          [
            campaignAccountId,
            campaignId,
            defaultMailbox.connectedAccountId,
            defaultMailbox.messageChannelId,
          ],
        );
        await manager.query(
          `INSERT INTO "${schemaName}"."creator" ("id", "name", "email")
           VALUES ($1, 'MYAH-270 fixture creator', $2)`,
          [creatorId, EXPECTED_RECIPIENT],
        );
        await manager.query(
          `INSERT INTO "${schemaName}"."campaignCreator" (
            "id", "name", "creatorId", "campaignId", "selectedContactMethod", "assignedManagedMailboxId"
          ) VALUES ($1, 'MYAH-270 fixture campaign creator', $2, $3, 'EMAIL', NULL)`,
          [campaignCreatorId, creatorId, campaignId],
        );
        await manager.query(
          `INSERT INTO "${schemaName}"."outreachAction" (
            "id", "name", "campaignCreatorId", "channel", "status", "subject", "body",
            "contentDigest", "recipientEmail", "campaignAccountId", "connectedAccountId",
            "messageChannelId", "senderEmail", "senderDisplayName", "providerDraftExternalId"
          ) VALUES (
            $1, 'MYAH-270 fixture outreach action', $2, 'EMAIL', 'PENDING', $3, $4,
            $5, $6, $7, $8, $9, $10,
            'MYAH-270 fixture sender', $11
          )`,
          [
            outreachActionId,
            campaignCreatorId,
            EXPECTED_SUBJECT,
            EXPECTED_BODY,
            computeActionContentDigest(
              JSON.stringify([EXPECTED_SUBJECT, EXPECTED_BODY]),
            ),
            EXPECTED_RECIPIENT,
            campaignAccountId,
            defaultMailbox.connectedAccountId,
            defaultMailbox.messageChannelId,
            defaultMailbox.email,
            `myah-e2e-draft-${fixtureNonce}`,
          ],
        );
        await manager.query(
          `INSERT INTO core."agentChatThread" ("id", "workspaceId", "userWorkspaceId", "title")
           VALUES ($1, $2, $3, 'MYAH-270 E2E fixture')`,
          [threadId, context.workspaceId, context.userWorkspaceId],
        );
      });

      const proposal = await this.outreachEmailActionDefinition.propose({
        workspaceId: context.workspaceId,
        initiatorUserWorkspaceId: context.userWorkspaceId,
        threadId,
        input: { outreachActionId },
      });
      const binding = await this.actionApprovalService.createPendingBinding(
        proposal.expectedActionBinding,
      );
      await this.outreachEmailActionDefinition.recordApprovalBinding({
        expectedActionBinding: proposal.expectedActionBinding,
        approvalBindingId: binding.id,
      });
      await this.dataSource.query(
        `INSERT INTO core."agentMessage" (
          "id", "workspaceId", "threadId", "role", "status"
        ) VALUES ($1, $2, $3, 'assistant', 'sent')`,
        [messageId, context.workspaceId, threadId],
      );
      await this.dataSource.query(
        `INSERT INTO core."agentMessagePart" (
          "id", "workspaceId", "messageId", "orderIndex", "type", "toolName",
          "toolCallId", "toolInput", "toolOutput", "state"
        ) VALUES ($1, $2, $3, 0, 'tool-request_approval', 'request_approval',
          'myah-e2e-approval', '{}'::jsonb, $4::jsonb, 'output-available')`,
        [
          partId,
          context.workspaceId,
          messageId,
          JSON.stringify({
            result: { status: 'pending', actionApprovalBindingId: binding.id },
          }),
        ],
      );

      const fixture = this.registry.register(context.workspaceId, {
        connectedAccountIds: [
          defaultMailbox.connectedAccountId,
          firstAvailable.connectedAccountId,
          secondAvailable.connectedAccountId,
          unavailable.connectedAccountId,
        ],
        messageChannelIds: [
          defaultMailbox.messageChannelId,
          firstAvailable.messageChannelId,
          secondAvailable.messageChannelId,
          unavailable.messageChannelId,
        ],
        campaignAccountIds: [campaignAccountId],
        creatorIds: [creatorId],
        campaignCreatorIds: [campaignCreatorId],
        outreachActionIds: [outreachActionId],
        actionApprovalBindingIds: [binding.id],
        agentChatThreadIds: [threadId],
        agentMessageIds: [messageId],
        agentMessagePartIds: [partId],
      });

      return {
        id: fixture.id,
        availableAccountIds: [
          firstAvailable.connectedAccountId,
          secondAvailable.connectedAccountId,
        ],
        unavailableAccountId: unavailable.connectedAccountId,
        approvalThreadId: threadId,
        actionApprovalBindingId: binding.id,
        expectedFrom: defaultMailbox.email,
        expectedTo: `MYAH-270 fixture creator <${EXPECTED_RECIPIENT}>`,
        expectedSubject: EXPECTED_SUBJECT,
        expectedBody: EXPECTED_BODY,
      };
    } catch (error) {
      await this.deleteRecords(context.workspaceId, {
        connectedAccountIds: [
          defaultMailbox.connectedAccountId,
          firstAvailable.connectedAccountId,
          secondAvailable.connectedAccountId,
          unavailable.connectedAccountId,
        ],
        messageChannelIds: [
          defaultMailbox.messageChannelId,
          firstAvailable.messageChannelId,
          secondAvailable.messageChannelId,
          unavailable.messageChannelId,
        ],
        campaignAccountIds: [campaignAccountId],
        creatorIds: [creatorId],
        campaignCreatorIds: [campaignCreatorId],
        outreachActionIds: [outreachActionId],
        agentChatThreadIds: [threadId],
        agentMessageIds: [messageId],
        agentMessagePartIds: [partId],
      }).catch(() => undefined);
      throw error;
    }
  }

  async createCallbackFixture(
    context: AuthenticatedFixtureContext,
    fixtureId: string,
    campaignId: string,
  ) {
    if (!this.registry.get(context.workspaceId, fixtureId)) {
      throw new Error('E2E fixture was not found');
    }
    await this.assertCampaign(context.workspaceId, campaignId);
    const mailbox = await this.createMailbox(
      context,
      randomUUID(),
      'callback',
      false,
    );
    const fixture = this.registry.get(context.workspaceId, fixtureId);
    if (!fixture) throw new Error('E2E fixture was not found');
    fixture.records.connectedAccountIds.push(mailbox.connectedAccountId);
    fixture.records.messageChannelIds?.push(mailbox.messageChannelId);

    return {
      connectedAccountId: mailbox.connectedAccountId,
      callbackPath: `/object/campaign/${campaignId}?linkConnectedAccount=1&connectedAccountId=${mailbox.connectedAccountId}#${CAMPAIGN_OPERATIONS_HASH}`,
    };
  }

  async cleanup(
    context: AuthenticatedFixtureContext,
    fixtureId: string,
  ): Promise<boolean> {
    const fixture = this.registry.get(context.workspaceId, fixtureId);
    if (!fixture) return false;
    await this.deleteRecords(context.workspaceId, fixture.records);
    this.registry.release(context.workspaceId, fixtureId);

    return true;
  }

  async onModuleDestroy(): Promise<void> {
    // Fixture cleanup is intentionally best effort; isolated E2E database reset
    // handles process interruption before this hook can complete.
    await Promise.all(
      this.registry.entries().map(async (fixture) => {
        try {
          await this.deleteRecords(fixture.workspaceId, fixture.records);
          this.registry.release(fixture.workspaceId, fixture.id);
        } catch {
          // A shutdown error must not prevent the isolated E2E process exit.
        }
      }),
    );
  }

  private async createMailbox(
    context: AuthenticatedFixtureContext,
    nonce: string,
    label: string,
    reconnectRequired: boolean,
  ): Promise<CreatedMailbox> {
    const connectedAccountId = randomUUID();
    const messageChannelId = randomUUID();
    const email =
      label === 'default'
        ? 'myah-e2e-sender@fixture.test'
        : `${label}-${nonce}@myah-e2e.fixture.test`;
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO core."connectedAccount" (
          "id", "workspaceId", "userWorkspaceId", "handle", "name", "provider", "visibility", "authFailedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, 'workspace', $7)`,
        [
          connectedAccountId,
          context.workspaceId,
          context.userWorkspaceId,
          email,
          `MYAH-270 ${label}`,
          ConnectedAccountProvider.GOOGLE,
          reconnectRequired ? new Date() : null,
        ],
      );
      await manager.query(
        `INSERT INTO core."messageChannel" (
          "id", "workspaceId", "connectedAccountId", "handle", "visibility", "type",
          "pendingGroupEmailsAction", "syncStatus", "syncStage"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          messageChannelId,
          context.workspaceId,
          connectedAccountId,
          email,
          MessageChannelVisibility.SHARE_EVERYTHING,
          MessageChannelType.EMAIL,
          MessageChannelPendingGroupEmailsAction.NONE,
          reconnectRequired
            ? MessageChannelSyncStatus.FAILED_UNKNOWN
            : MessageChannelSyncStatus.ACTIVE,
          MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
        ],
      );
    });

    return { connectedAccountId, messageChannelId, email };
  }

  private async assertCampaign(
    workspaceId: string,
    campaignId: string,
  ): Promise<void> {
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const rows = await dataSource.query(
      `SELECT "id" FROM "${getWorkspaceSchemaName(workspaceId)}"."campaign" WHERE "id" = $1 LIMIT 1`,
      [campaignId],
    );
    if (rows.length !== 1) throw new Error('Campaign was not found');
  }

  private async deleteRecords(
    workspaceId: string,
    records: Parameters<MyahE2eFixtureRegistryService['register']>[1],
  ): Promise<void> {
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const schemaName = getWorkspaceSchemaName(workspaceId);
    await dataSource.transaction(async (manager) => {
      const remove = async (table: string, ids?: string[]) => {
        if (!ids?.length) return;
        await manager.query(
          `DELETE FROM ${table} WHERE "id" = ANY($1::uuid[])`,
          [ids],
        );
      };
      await remove('core."agentMessagePart"', records.agentMessagePartIds);
      await remove('core."agentMessage"', records.agentMessageIds);
      if (records.actionApprovalBindingIds?.length) {
        await manager.query(
          `DELETE FROM core."actionApprovalBindingEvidenceLink" WHERE "actionApprovalBindingId" = ANY($1::uuid[])`,
          [records.actionApprovalBindingIds],
        );
        await remove(
          'core."actionApprovalBinding"',
          records.actionApprovalBindingIds,
        );
      }
      await remove(
        `"${schemaName}"."outreachAction"`,
        records.outreachActionIds,
      );
      await remove(
        `"${schemaName}"."campaignCreator"`,
        records.campaignCreatorIds,
      );
      await remove(`"${schemaName}"."creator"`, records.creatorIds);
      await remove(
        `"${schemaName}"."campaignAccount"`,
        records.campaignAccountIds,
      );
      await remove('core."agentChatThread"', records.agentChatThreadIds);
      await remove('core."messageChannel"', records.messageChannelIds);
      await remove('core."connectedAccount"', records.connectedAccountIds);
    });
  }
}
