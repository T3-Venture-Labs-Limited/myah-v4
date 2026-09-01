import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldActorSource } from 'twenty-shared/types';
import { DataSource, type EntityManager, Repository } from 'typeorm';

import { type ActionReceiptProjectionWriter } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';
import { MyahInboxReplyReceiptProjectionService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-receipt-projection.service';

type ProjectionInput = Parameters<ActionReceiptProjectionWriter['project']>[0];

type OutreachActionProjectionRow = {
  subject: string | null;
  body: string | null;
  recipientEmail: string | null;
  campaignCreatorId: string | null;
  creatorId: string | null;
  campaignId: string | null;
  connectedAccountId: string | null;
  messageChannelId: string | null;
  senderEmail: string | null;
  senderDisplayName: string | null;
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
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    private readonly sentMessagePersistenceService: SentMessagePersistenceService,
    private readonly myahInboxReplyReceiptProjectionService: MyahInboxReplyReceiptProjectionService,
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

    if (input.actionName === 'send_inbox_reply') {
      await this.myahInboxReplyReceiptProjectionService.project(input);
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
    const { receiptId, workspaceId, draftId, providerMessageId } = input;

    if (!isNonEmptyString(providerMessageId)) {
      throw new Error(
        'The sent outreach Message is unavailable for projection',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `outreach-action-projection:${workspaceId}:${draftId}`,
      ]);

      if (await this.hasOutreachProjection(manager, schemaName, receiptId)) {
        return;
      }

      await this.ensureSentOutreachMessage(input, schemaName, manager);

      if (await this.hasOutreachProjection(manager, schemaName, receiptId)) {
        return;
      }

      const [action] = await manager.query<OutreachActionProjectionRow[]>(
        `SELECT
          outreach_action."subject",
          outreach_action."body",
          outreach_action."recipientEmail",
          outreach_action."campaignCreatorId",
          campaign_creator."creatorId",
          campaign_creator."campaignId",
          outreach_action."connectedAccountId",
          outreach_action."messageChannelId",
          outreach_action."senderEmail",
          outreach_action."senderDisplayName",
          outreach_action."providerDraftExternalId",
          outreach_action."providerThreadExternalId",
          outreach_action."messageThreadId",
          outreach_action."inReplyTo",
          outreach_action."executionReceiptId"
        FROM "${schemaName}"."outreachAction" outreach_action
        INNER JOIN "${schemaName}"."campaignCreator" campaign_creator
          ON campaign_creator."id" = outreach_action."campaignCreatorId"
        WHERE outreach_action."id" = $1
          AND outreach_action."status" = 'PENDING'
        FOR UPDATE OF outreach_action`,
        [draftId],
      );

      if (!this.isProjectableOutreachAction(action, input)) {
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
        !this.isMatchingSentMessage(action, sentMessages[0], input)
      ) {
        throw new Error(
          'The sent outreach Message is unavailable for projection',
        );
      }

      const [sentMessage] = sentMessages;
      const campaignCreatorObjectMetadataRows = await manager.query<
        { id: string }[]
      >(
        `SELECT "id"
         FROM core."objectMetadata"
         WHERE "workspaceId" = $1
           AND "universalIdentifier" = $2
         LIMIT 2`,
        [
          workspaceId,
          MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
        ],
      );

      if (
        campaignCreatorObjectMetadataRows.length !== 1 ||
        !isNonEmptyString(campaignCreatorObjectMetadataRows[0].id)
      ) {
        throw new Error(
          'Campaign Creator metadata is unavailable for outreach projection',
        );
      }

      const [campaignCreatorObjectMetadata] = campaignCreatorObjectMetadataRows;

      await manager.query(
        `UPDATE "${schemaName}"."outreachAction"
          SET
            "status" = 'APPLIED',
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
            AND "status" = 'PENDING'
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
          workspaceMemberId: null,
          linkedRecordCachedName: '',
          linkedRecordId: action.campaignCreatorId,
          linkedObjectMetadataId: campaignCreatorObjectMetadata.id,
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

  private async ensureSentOutreachMessage(
    input: ProjectionInput,
    schemaName: string,
    manager: EntityManager,
  ): Promise<void> {
    const { workspaceId, draftId, providerMessageId } = input;
    const [action] = await manager.query<OutreachActionProjectionRow[]>(
      `SELECT
        outreach_action."subject",
        outreach_action."body",
        outreach_action."recipientEmail",
        outreach_action."campaignCreatorId",
        campaign_creator."creatorId",
        campaign_creator."campaignId",
        outreach_action."connectedAccountId",
        outreach_action."messageChannelId",
        outreach_action."senderEmail",
        outreach_action."senderDisplayName",
        outreach_action."providerDraftExternalId",
        outreach_action."providerThreadExternalId",
        outreach_action."messageThreadId",
        outreach_action."inReplyTo",
        outreach_action."executionReceiptId"
      FROM "${schemaName}"."outreachAction" outreach_action
      INNER JOIN "${schemaName}"."campaignCreator" campaign_creator
        ON campaign_creator."id" = outreach_action."campaignCreatorId"
      WHERE outreach_action."id" = $1
        AND outreach_action."status" = 'PENDING'`,
      [draftId],
    );

    if (
      !this.isProjectableOutreachAction(action, input) ||
      !isNonEmptyString(action.recipientEmail) ||
      !isNonEmptyString(providerMessageId)
    ) {
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

    if (sentMessages.length === 1) {
      if (this.isMatchingSentMessage(action, sentMessages[0], input)) {
        return;
      }

      throw new Error(
        'The sent outreach Message is unavailable for projection',
      );
    }

    if (sentMessages.length > 1) {
      throw new Error(
        'The sent outreach Message is unavailable for projection',
      );
    }

    const connectedAccount = await this.connectedAccountRepository.findOne({
      where: { id: action.connectedAccountId, workspaceId },
    });

    if (
      !connectedAccount ||
      connectedAccount.archivedAt !== null ||
      connectedAccount.handle !== action.senderEmail
    ) {
      throw new Error(
        'The sent outreach Message is unavailable for projection',
      );
    }

    const persisted =
      await this.sentMessagePersistenceService.persistSentMessage({
        sendResult: {
          headerMessageId: providerMessageId,
          messageExternalId: input.providerExternalMessageId ?? undefined,
          threadExternalId: input.providerThreadExternalId ?? undefined,
        },
        subject: action.subject,
        body: action.body,
        recipients: { to: [action.recipientEmail], cc: [], bcc: [] },
        connectedAccount,
        messageChannelId: action.messageChannelId,
        inReplyTo: action.inReplyTo ?? undefined,
        parentThreadExternalId: action.providerThreadExternalId ?? undefined,
        workspaceId,
      });

    if (!persisted) {
      throw new Error(
        'The sent outreach Message is unavailable for projection',
      );
    }
  }

  private isProjectableOutreachAction(
    action: OutreachActionProjectionRow | undefined,
    input: ProjectionInput,
  ): action is OutreachActionProjectionRow & {
    subject: string;
    body: string;
    recipientEmail: string;
    campaignCreatorId: string;
    creatorId: string;
    campaignId: string;
    connectedAccountId: string;
    messageChannelId: string;
    senderEmail: string;
  } {
    if (
      !action ||
      !isNonEmptyString(action.subject) ||
      !isNonEmptyString(action.body) ||
      !isNonEmptyString(action.campaignCreatorId) ||
      !isNonEmptyString(action.creatorId) ||
      !isNonEmptyString(action.campaignId) ||
      !isNonEmptyString(action.connectedAccountId) ||
      !isNonEmptyString(action.messageChannelId) ||
      !isNonEmptyString(action.senderEmail) ||
      !isNonEmptyString(action.recipientEmail) ||
      !isNonEmptyString(action.providerDraftExternalId) ||
      !isNonEmptyString(input.recipientFingerprint) ||
      !isNonEmptyString(input.sendingAccountFingerprint) ||
      !isNonEmptyString(input.actionContextFingerprint) ||
      (action.executionReceiptId !== null &&
        action.executionReceiptId !== input.receiptId)
    ) {
      return false;
    }

    const evidenceFor = (role: string, recordId: string): boolean => {
      const matchingRole = input.evidenceLinks.filter(
        (evidenceLink) => evidenceLink.role === role,
      );

      return matchingRole.length === 1 && matchingRole[0].recordId === recordId;
    };
    const threadParentEvidence = input.evidenceLinks.filter(
      (evidenceLink) => evidenceLink.role === 'thread_parent',
    );
    const senderDisplayName = action.senderDisplayName?.trim() || null;

    return (
      computeActionContentDigest(
        JSON.stringify([action.subject, action.body]),
      ) === input.contentDigest &&
      computeActionContentDigest(JSON.stringify([action.recipientEmail])) ===
        input.recipientFingerprint &&
      computeActionContentDigest(
        JSON.stringify([
          action.connectedAccountId,
          action.messageChannelId,
          action.senderEmail,
          senderDisplayName,
        ]),
      ) === input.sendingAccountFingerprint &&
      computeActionContentDigest(
        JSON.stringify([
          action.inReplyTo,
          action.messageThreadId,
          action.providerThreadExternalId,
        ]),
      ) === input.actionContextFingerprint &&
      evidenceFor('campaign_creator', action.campaignCreatorId) &&
      evidenceFor('creator', action.creatorId) &&
      evidenceFor('campaign', action.campaignId) &&
      threadParentEvidence.length ===
        (isNonEmptyString(action.inReplyTo) ? 1 : 0)
    );
  }

  private isMatchingSentMessage(
    action: OutreachActionProjectionRow,
    message: SentOutreachMessageRow,
    input: ProjectionInput,
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
      (!isNonEmptyString(action.providerThreadExternalId) ||
        action.providerThreadExternalId === message.messageThreadExternalId) &&
      (!isNonEmptyString(input.providerExternalMessageId) ||
        input.providerExternalMessageId === message.messageExternalId) &&
      (!isNonEmptyString(input.providerThreadExternalId) ||
        input.providerThreadExternalId === message.messageThreadExternalId)
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
