import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { FieldActorSource } from 'twenty-shared/types';
import { type DataSource, type EntityManager, type Repository } from 'typeorm';

import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { type MyahInboxReplyExpectedActionBindingWithWorkspace } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { type ActionReceiptProjectionWriter } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

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

type SentInboxMessageRow = {
  id: string;
  messageThreadId: string | null;
  subject: string | null;
  body: string | null;
  messageChannelId: string | null;
  messageExternalId: string | null;
  messageThreadExternalId: string | null;
  recipientEmail: string | null;
  recipientCount: number | string;
  senderEmail: string | null;
  senderCount: number | string;
  senderDisplayName: string | null;
  connectedAccountId: string | null;
  parentMessageId: string | null;
  parentHeaderMessageId: string | null;
  parentMessageExternalId: string | null;
  parentThreadExternalId: string | null;
};

type InboxProjectionInput = ProjectionInput & {
  actionName: 'send_inbox_reply';
};

@Injectable()
export class ActionReceiptWorkspaceProjectionWriterService implements ActionReceiptProjectionWriter {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    private readonly sentMessagePersistenceService: SentMessagePersistenceService,
    private readonly myahInboxReplyActionDefinition: MyahInboxReplyActionDefinition,
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
      await this.projectInboxReply(input, schemaName);
      return;
    }

    throw new Error('Unsupported action receipt projection');
  }

  private async projectInboxReply(
    input: InboxProjectionInput,
    schemaName: string,
  ): Promise<void> {
    if (!isNonEmptyString(input.providerMessageId)) {
      throw new Error('The sent Inbox Message is unavailable for projection');
    }
    const providerMessageId = input.providerMessageId;
    const binding = this.toInboxProjectionBinding(input);

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `myah-inbox-reply-projection:${input.workspaceId}:${input.draftId}`,
      ]);
      const parentMessageId = await this.getInboxParentEvidenceId(
        manager,
        input,
      );
      const currentDraft = await this.loadInboxDraft(
        manager,
        schemaName,
        input.draftId,
      );
      const sentMessages = await this.findSentInboxMessages(
        manager,
        schemaName,
        providerMessageId,
        input.providerExternalMessageId,
        parentMessageId,
      );

      let existingMessage: SentInboxMessageRow | undefined;
      if (currentDraft.myahReplyDraftBody === null) {
        existingMessage = this.selectOneInboxMessage(sentMessages, (message) =>
          this.isMatchingSentInboxMessage(
            message,
            input,
            currentDraft.myahReplyDraftRevision - 1,
            parentMessageId,
          ),
        );
        if (existingMessage) {
          return;
        }

        throw new Error('The sent Inbox Message is unavailable for projection');
      }

      const authority =
        await this.myahInboxReplyActionDefinition.rebuildProjectionAuthority({
          workspaceId: input.workspaceId,
          binding,
        });
      const { canonicalGraph } = authority;

      if (
        canonicalGraph.messageThreadId !== input.threadId ||
        canonicalGraph.draftRevision !== currentDraft.myahReplyDraftRevision ||
        currentDraft.myahReplyDraftBody === null
      ) {
        throw new Error(
          'The approved Inbox reply is unavailable for projection',
        );
      }

      existingMessage = this.selectOneInboxMessage(
        sentMessages,
        (message) =>
          this.isMatchingSentInboxMessage(
            message,
            input,
            canonicalGraph.draftRevision,
            parentMessageId,
          ) &&
          message.messageChannelId === canonicalGraph.messageChannelId &&
          message.senderEmail === canonicalGraph.senderEmail,
      );
      if (sentMessages.length > 0 && !existingMessage) {
        throw new Error('The sent Inbox Message is unavailable for projection');
      }

      if (!existingMessage) {
        const persisted =
          await this.sentMessagePersistenceService.persistSentMessage({
            sendResult: {
              headerMessageId: providerMessageId,
              messageExternalId: input.providerExternalMessageId ?? undefined,
              threadExternalId: input.providerThreadExternalId ?? undefined,
            },
            subject: canonicalGraph.subject,
            body: canonicalGraph.draftBody.markdown,
            recipients: {
              to: [canonicalGraph.recipientEmail],
              cc: [],
              bcc: [],
            },
            connectedAccount: canonicalGraph.connectedAccount,
            messageChannelId: canonicalGraph.messageChannelId,
            inReplyTo: canonicalGraph.inReplyTo,
            parentThreadExternalId:
              canonicalGraph.providerThreadExternalId ?? undefined,
            workspaceId: input.workspaceId,
          });

        if (
          !persisted ||
          persisted.messageThreadId !== canonicalGraph.messageThreadId
        ) {
          throw new Error(
            'The sent Inbox Message is unavailable for projection',
          );
        }
      }

      const matchingMessages = await this.findSentInboxMessages(
        manager,
        schemaName,
        providerMessageId,
        input.providerExternalMessageId,
        parentMessageId,
      );
      const matchedMessage = this.selectOneInboxMessage(
        matchingMessages,
        (message) =>
          this.isMatchingSentInboxMessage(
            message,
            input,
            canonicalGraph.draftRevision,
            parentMessageId,
          ) &&
          message.messageChannelId === canonicalGraph.messageChannelId &&
          message.senderEmail === canonicalGraph.senderEmail,
      );
      if (!matchedMessage) {
        throw new Error('The sent Inbox Message is unavailable for projection');
      }

      const cleared = await manager.query<{ id: string }[]>(
        `UPDATE "${schemaName}"."messageThread"
          SET
            "myahReplyDraftBody" = NULL,
            "myahReplyDraftRevision" = "myahReplyDraftRevision" + 1,
            "updatedAt" = NOW()
          WHERE "id" = $1
            AND "myahReplyDraftRevision" = $2
            AND "myahReplyDraftBody" IS NOT NULL
          RETURNING "id"`,
        [input.draftId, canonicalGraph.draftRevision],
      );
      if (cleared.length !== 1) {
        throw new Error(
          'The approved Inbox reply is unavailable for projection',
        );
      }
    });
  }

  private toInboxProjectionBinding(
    input: InboxProjectionInput,
  ): MyahInboxReplyExpectedActionBindingWithWorkspace {
    if (
      input.actionVersion !== 1 ||
      input.draftId !== input.threadId ||
      !isNonEmptyString(input.contentDigest) ||
      !isNonEmptyString(input.recipientFingerprint) ||
      !isNonEmptyString(input.sendingAccountFingerprint) ||
      !isNonEmptyString(input.actionContextFingerprint) ||
      !isNonEmptyString(input.initiatorUserWorkspaceId)
    ) {
      throw new Error('The approved Inbox reply is unavailable for projection');
    }

    return {
      workspaceId: input.workspaceId,
      actionName: input.actionName,
      actionVersion: input.actionVersion,
      draftId: input.draftId,
      contentDigest: input.contentDigest,
      recipientFingerprint: input.recipientFingerprint,
      sendingAccountFingerprint: input.sendingAccountFingerprint,
      actionContextFingerprint: input.actionContextFingerprint,
      threadId: input.threadId,
      initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
      evidenceLinks: input.evidenceLinks,
    };
  }
  private async getInboxParentEvidenceId(
    manager: EntityManager,
    input: InboxProjectionInput,
  ): Promise<string> {
    const metadata = await manager.query<
      { id: string; universalIdentifier: string }[]
    >(
      `SELECT "id", "universalIdentifier"
        FROM core."objectMetadata"
        WHERE "workspaceId" = $1
          AND "universalIdentifier" IN ($2, $3)`,
      [
        input.workspaceId,
        STANDARD_OBJECTS.messageThread.universalIdentifier,
        STANDARD_OBJECTS.message.universalIdentifier,
      ],
    );
    const messageThreadMetadataId = metadata.find(
      (item) =>
        item.universalIdentifier ===
        STANDARD_OBJECTS.messageThread.universalIdentifier,
    )?.id;
    const messageMetadataId = metadata.find(
      (item) =>
        item.universalIdentifier ===
        STANDARD_OBJECTS.message.universalIdentifier,
    )?.id;
    const exactEvidence = [
      {
        objectMetadataId: messageThreadMetadataId,
        recordId: input.threadId,
        role: 'draft',
      },
      {
        objectMetadataId: messageMetadataId,
        role: 'thread_parent',
      },
    ];
    if (
      !isNonEmptyString(messageThreadMetadataId) ||
      !isNonEmptyString(messageMetadataId) ||
      input.evidenceLinks.length !== exactEvidence.length
    ) {
      throw new Error('The sent Inbox Message is unavailable for projection');
    }
    const parentEvidence = input.evidenceLinks.find(
      (evidenceLink) =>
        evidenceLink.role === 'thread_parent' &&
        evidenceLink.objectMetadataId === messageMetadataId &&
        isNonEmptyString(evidenceLink.recordId),
    );
    if (
      !parentEvidence ||
      !exactEvidence.every((expected) =>
        input.evidenceLinks.some(
          (evidenceLink) =>
            evidenceLink.role === expected.role &&
            evidenceLink.objectMetadataId === expected.objectMetadataId &&
            evidenceLink.recordId ===
              (expected.role === 'draft'
                ? expected.recordId
                : parentEvidence.recordId),
        ),
      )
    ) {
      throw new Error('The sent Inbox Message is unavailable for projection');
    }

    return parentEvidence.recordId;
  }

  private async loadInboxDraft(
    manager: EntityManager,
    schemaName: string,
    messageThreadId: string,
  ): Promise<{
    myahReplyDraftBody: unknown;
    myahReplyDraftRevision: number;
  }> {
    const [draft] = await manager.query<
      {
        myahReplyDraftBody: unknown;
        myahReplyDraftRevision: number;
      }[]
    >(
      `SELECT "myahReplyDraftBody", "myahReplyDraftRevision"
        FROM "${schemaName}"."messageThread"
        WHERE "id" = $1`,
      [messageThreadId],
    );

    if (!draft || !Number.isInteger(draft.myahReplyDraftRevision)) {
      throw new Error('The approved Inbox reply is unavailable for projection');
    }

    return draft;
  }
  private selectOneInboxMessage(
    messages: readonly SentInboxMessageRow[],
    matches: (message: SentInboxMessageRow) => boolean,
  ): SentInboxMessageRow | undefined {
    const candidatesByMessageId = new Map<string, SentInboxMessageRow[]>();
    for (const message of messages) {
      const candidate = candidatesByMessageId.get(message.id) ?? [];
      candidate.push(message);
      candidatesByMessageId.set(message.id, candidate);
    }
    if (candidatesByMessageId.size !== 1) {
      return undefined;
    }

    const [candidate] = candidatesByMessageId.values();
    const matchingAssociations = candidate.filter(matches);

    return matchingAssociations.length === 1
      ? matchingAssociations[0]
      : undefined;
  }

  private async findSentInboxMessages(
    manager: EntityManager,
    schemaName: string,
    providerMessageId: string,
    providerExternalMessageId: string | null,
    parentMessageId: string,
  ): Promise<SentInboxMessageRow[]> {
    return manager.query<SentInboxMessageRow[]>(
      `SELECT
        message."id",
        message."messageThreadId",
        message."subject",
        message."text" AS "body",
        association."messageChannelId",
        association."messageExternalId",
        association."messageThreadExternalId",
        (SELECT MIN(participant."handle") FROM "${schemaName}"."messageParticipant" participant WHERE participant."messageId" = message."id" AND participant."role" = 'TO') AS "recipientEmail",
        (SELECT COUNT(*) FROM "${schemaName}"."messageParticipant" participant WHERE participant."messageId" = message."id" AND participant."role" = 'TO') AS "recipientCount",
        (SELECT MIN(participant."handle") FROM "${schemaName}"."messageParticipant" participant WHERE participant."messageId" = message."id" AND participant."role" = 'FROM') AS "senderEmail",
        (SELECT COUNT(*) FROM "${schemaName}"."messageParticipant" participant WHERE participant."messageId" = message."id" AND participant."role" = 'FROM') AS "senderCount",
        NULLIF(BTRIM(account."name"), '') AS "senderDisplayName",
        channel."connectedAccountId",
        parent."id" AS "parentMessageId",
        parent."headerMessageId" AS "parentHeaderMessageId",
        parent_association."messageExternalId" AS "parentMessageExternalId",
        parent_association."messageThreadExternalId" AS "parentThreadExternalId"
      FROM "${schemaName}"."message" message
      INNER JOIN "${schemaName}"."messageChannelMessageAssociation" association ON association."messageId" = message."id"
      INNER JOIN core."messageChannel" channel ON channel."id" = association."messageChannelId"
      INNER JOIN core."connectedAccount" account ON account."id" = channel."connectedAccountId"
      INNER JOIN "${schemaName}"."message" parent ON parent."id" = $3 AND parent."messageThreadId" = message."messageThreadId"
      LEFT JOIN "${schemaName}"."messageChannelMessageAssociation" parent_association ON parent_association."messageId" = parent."id" AND parent_association."messageChannelId" = association."messageChannelId"
      WHERE message."headerMessageId" = $1
        OR ($2 IS NOT NULL AND association."messageExternalId" = $2)`,
      [providerMessageId, providerExternalMessageId, parentMessageId],
    );
  }

  private isMatchingSentInboxMessage(
    message: SentInboxMessageRow,
    input: InboxProjectionInput,
    approvedRevision: number,
    parentMessageId: string,
  ): boolean {
    return (
      isNonEmptyString(message.id) &&
      message.messageThreadId === input.threadId &&
      isNonEmptyString(message.messageChannelId) &&
      isNonEmptyString(message.connectedAccountId) &&
      isNonEmptyString(message.subject) &&
      isNonEmptyString(message.body) &&
      isNonEmptyString(message.recipientEmail) &&
      isNonEmptyString(message.senderEmail) &&
      Number(message.recipientCount) === 1 &&
      Number(message.senderCount) === 1 &&
      (!isNonEmptyString(input.providerExternalMessageId) ||
        message.messageExternalId === input.providerExternalMessageId) &&
      (!isNonEmptyString(input.providerThreadExternalId) ||
        message.messageThreadExternalId === input.providerThreadExternalId) &&
      message.parentMessageId === parentMessageId &&
      computeActionContentDigest(
        JSON.stringify([message.subject, message.body]),
      ) === input.contentDigest &&
      computeActionContentDigest(JSON.stringify([message.recipientEmail])) ===
        input.recipientFingerprint &&
      computeActionContentDigest(
        JSON.stringify([
          approvedRevision,
          message.parentHeaderMessageId,
          input.threadId,
          message.parentThreadExternalId,
          message.parentMessageExternalId,
          message.connectedAccountId,
          message.messageChannelId,
          message.senderEmail,
          message.senderDisplayName,
        ]),
      ) === input.actionContextFingerprint
    );
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
