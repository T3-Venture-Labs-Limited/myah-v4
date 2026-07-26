import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { FieldActorSource } from 'twenty-shared/types';
import { type DataSource, type EntityManager } from 'typeorm';

import { type ActionReceiptProjectionWriter } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

type ProjectionInput = Parameters<ActionReceiptProjectionWriter['project']>[0];

type OutreachActionProjectionRow = {
  subject: string | null;
  body: string | null;
  campaignCreatorId: string | null;
  creatorId: string | null;
  campaignId: string | null;
  connectedAccountId: string | null;
  messageChannelId: string | null;
  senderEmail: string | null;
  providerDraftExternalId: string | null;
  providerThreadExternalId: string | null;
  messageThreadId: string | null;
  inReplyTo: string | null;
  executionReceiptId: string | null;
};

type SentOutreachMessageRow = {
  id: string;
  messageThreadId: string | null;
  messageExternalId: string | null;
  messageThreadExternalId: string | null;
};

@Injectable()
export class ActionReceiptWorkspaceProjectionWriterService implements ActionReceiptProjectionWriter {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async project(input: ProjectionInput): Promise<void> {
    const schemaName = getWorkspaceSchemaName(input.workspaceId);

    if (input.actionName === 'send_instagram_reply') {
      await this.projectInstagramReply(input, schemaName);
      return;
    }

    if (input.actionName === 'send_outreach_email') {
      await this.projectOutreachEmail(input, schemaName);
      return;
    }

    throw new Error('Unsupported action receipt projection');
  }

  private async projectInstagramReply(
    { receiptId, draftId, contentDigest }: ProjectionInput,
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (await this.hasInstagramProjection(manager, schemaName, receiptId)) {
        return;
      }

      const [draft] = await manager.query<
        {
          body: string;
          conversationId: string | null;
        }[]
      >(
        `SELECT "body", "conversationId"
          FROM "${schemaName}"."_myahInstagramReplyDraft"
          WHERE "id" = $1
            AND "sentAt" IS NULL
            AND "status" = 'NEEDS_REVIEW'
          FOR UPDATE`,
        [draftId],
      );
      if (
        !draft ||
        !draft.conversationId ||
        computeActionContentDigest(draft.body) !== contentDigest
      ) {
        if (await this.hasInstagramProjection(manager, schemaName, receiptId)) {
          return;
        }
        throw new Error('The approved draft is unavailable for projection');
      }

      await manager.query(
        `UPDATE "${schemaName}"."_myahInstagramReplyDraft"
          SET "status" = 'SENT', "sentAt" = NOW(), "updatedAt" = NOW()
          WHERE "id" = $1
            AND "sentAt" IS NULL
            AND "status" = 'NEEDS_REVIEW'`,
        [draftId],
      );
      await manager.query(
        `INSERT INTO "${schemaName}"."_myahSocialMessage" (
          "id", "text", "conversationId", "direction", "sentVia", "createdAt", "updatedAt",
          "createdBySource", "createdByWorkspaceMemberId", "createdByName", "createdByContext",
          "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName", "updatedByContext"
        ) VALUES (
          $1, $2, $3, 'OUTBOUND', 'UNKNOWN', NOW(), NOW(),
          $4, NULL, 'System', $5::jsonb, $4, NULL, 'System', $5::jsonb
        )`,
        [
          randomUUID(),
          draft.body,
          draft.conversationId,
          FieldActorSource.SYSTEM,
          JSON.stringify({ actionReceiptId: receiptId }),
        ],
      );
    });
  }

  private async projectOutreachEmail(
    input: ProjectionInput,
    schemaName: string,
  ): Promise<void> {
    const { receiptId, draftId, contentDigest, providerMessageId } = input;

    if (!isNonEmptyString(providerMessageId)) {
      throw new Error(
        'The sent outreach Message is unavailable for projection',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (await this.hasOutreachProjection(manager, schemaName, receiptId)) {
        return;
      }

      const [action] = await manager.query<OutreachActionProjectionRow[]>(
        `SELECT
          outreach_action."subject",
          outreach_action."body",
          outreach_action."campaignCreatorId",
          campaign_creator."creatorId",
          campaign_creator."campaignId",
          outreach_action."connectedAccountId",
          outreach_action."messageChannelId",
          outreach_action."senderEmail",
          outreach_action."providerDraftExternalId",
          outreach_action."providerThreadExternalId",
          outreach_action."messageThreadId",
          outreach_action."inReplyTo",
          outreach_action."executionReceiptId"
        FROM "${schemaName}"."_outreachAction" outreach_action
        INNER JOIN "${schemaName}"."_campaignCreator" campaign_creator
          ON campaign_creator."id" = outreach_action."campaignCreatorId"
        WHERE outreach_action."id" = $1
          AND outreach_action."status" = 'DRAFT'
        FOR UPDATE OF outreach_action`,
        [draftId],
      );

      if (!this.isProjectableOutreachAction(action, contentDigest, receiptId)) {
        if (await this.hasOutreachProjection(manager, schemaName, receiptId)) {
          return;
        }
        throw new Error(
          'The approved outreach action is unavailable for projection',
        );
      }

      const sentMessages = await manager.query<SentOutreachMessageRow[]>(
        `SELECT
          message."id",
          message."messageThreadId",
          association."messageExternalId",
          association."messageThreadExternalId"
        FROM "${schemaName}"."message" message
        INNER JOIN "${schemaName}"."messageChannelMessageAssociation" association
          ON association."messageId" = message."id"
        WHERE message."headerMessageId" = $1
          AND association."messageChannelId" = $2
        LIMIT 2`,
        [providerMessageId, action.messageChannelId],
      );

      if (
        sentMessages.length !== 1 ||
        !this.isMatchingSentMessage(action, sentMessages[0])
      ) {
        throw new Error(
          'The sent outreach Message is unavailable for projection',
        );
      }

      const [sentMessage] = sentMessages;

      await manager.query(
        `UPDATE "${schemaName}"."_outreachAction"
          SET
            "status" = 'SENT',
            "completedAt" = NOW(),
            "resultSummary" = 'Sent',
            "executionReceiptId" = $1,
            "sentHeaderMessageId" = $2,
            "providerMessageExternalId" = $3,
            "providerThreadExternalId" = $4,
            "messageId" = $5,
            "messageThreadId" = $6,
            "updatedAt" = NOW()
          WHERE "id" = $7
            AND "status" = 'DRAFT'
            AND ("executionReceiptId" IS NULL OR "executionReceiptId" = $1)`,
        [
          receiptId,
          providerMessageId,
          sentMessage.messageExternalId,
          sentMessage.messageThreadExternalId,
          sentMessage.id,
          sentMessage.messageThreadId,
          draftId,
        ],
      );

      const occurredAt = new Date();
      const actorContext = { actionReceiptId: receiptId };

      await manager
        .createQueryBuilder()
        .insert()
        .into(`${schemaName}.timelineActivity`)
        .values({
          id: receiptId,
          name: 'outreachAction.sent',
          properties: {
            outreachActionId: draftId,
            creatorId: action.creatorId,
            campaignId: action.campaignId,
            messageId: sentMessage.id,
            status: 'SENT',
          },
          happensAt: occurredAt,
          targetCampaignCreatorId: action.campaignCreatorId,
          workspaceMemberId: null,
          linkedRecordCachedName: '',
          linkedRecordId: null,
          linkedObjectMetadataId: null,
          createdAt: occurredAt,
          updatedAt: occurredAt,
          createdBySource: FieldActorSource.SYSTEM,
          createdByWorkspaceMemberId: null,
          createdByName: 'System',
          createdByContext: actorContext,
          updatedBySource: FieldActorSource.SYSTEM,
          updatedByWorkspaceMemberId: null,
          updatedByName: 'System',
          updatedByContext: actorContext,
        })
        .orIgnore()
        .execute();
    });
  }

  private isProjectableOutreachAction(
    action: OutreachActionProjectionRow | undefined,
    contentDigest: string,
    receiptId: string,
  ): action is OutreachActionProjectionRow {
    return Boolean(
      action &&
      isNonEmptyString(action.subject) &&
      isNonEmptyString(action.body) &&
      isNonEmptyString(action.campaignCreatorId) &&
      isNonEmptyString(action.creatorId) &&
      isNonEmptyString(action.campaignId) &&
      isNonEmptyString(action.connectedAccountId) &&
      isNonEmptyString(action.messageChannelId) &&
      isNonEmptyString(action.senderEmail) &&
      isNonEmptyString(action.providerDraftExternalId) &&
      (action.executionReceiptId === null ||
        action.executionReceiptId === receiptId) &&
      computeActionContentDigest(
        JSON.stringify([action.subject, action.body]),
      ) === contentDigest,
    );
  }

  private isMatchingSentMessage(
    action: OutreachActionProjectionRow,
    message: SentOutreachMessageRow,
  ): boolean {
    if (
      !isNonEmptyString(message.id) ||
      !isNonEmptyString(message.messageThreadId) ||
      !isNonEmptyString(message.messageExternalId) ||
      !isNonEmptyString(message.messageThreadExternalId)
    ) {
      return false;
    }

    if (
      isNonEmptyString(action.messageThreadId) &&
      action.messageThreadId !== message.messageThreadId
    ) {
      return false;
    }

    return (
      !isNonEmptyString(action.providerThreadExternalId) ||
      action.providerThreadExternalId === message.messageThreadExternalId
    );
  }

  private async hasInstagramProjection(
    manager: EntityManager,
    schemaName: string,
    receiptId: string,
  ): Promise<boolean> {
    const projections = await manager.query<{ id: string }[]>(
      `SELECT "id" FROM "${schemaName}"."_myahSocialMessage"
        WHERE "createdByContext" ->> 'actionReceiptId' = $1
        LIMIT 1`,
      [receiptId],
    );

    return projections.length > 0;
  }

  private async hasOutreachProjection(
    manager: EntityManager,
    schemaName: string,
    receiptId: string,
  ): Promise<boolean> {
    const projections = await manager.query<{ id: string }[]>(
      `SELECT "id" FROM "${schemaName}"."timelineActivity"
        WHERE "id" = $1
        LIMIT 1`,
      [receiptId],
    );

    return projections.length > 0;
  }
}
