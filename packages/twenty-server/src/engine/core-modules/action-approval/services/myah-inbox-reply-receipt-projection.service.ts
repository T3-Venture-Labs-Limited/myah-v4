import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { DataSource, type EntityManager } from 'typeorm';

import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import {
  type MyahInboxReplyDraft,
  type MyahInboxReplyExpectedActionBindingWithWorkspace,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { type ActionReceiptProjectionWriter } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { normalizeMyahInboxReplyDraft } from 'src/engine/core-modules/action-approval/utils/normalize-myah-inbox-reply-draft.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

type ProjectionInput = Parameters<ActionReceiptProjectionWriter['project']>[0];

type InboxProjectionInput = ProjectionInput & {
  actionName: 'send_inbox_reply';
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
  parentAssociationDirection: string | null;
  parentHeaderMessageId: string | null;
  parentMessageExternalId: string | null;
  parentThreadExternalId: string | null;
};

@Injectable()
export class MyahInboxReplyReceiptProjectionService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly sentMessagePersistenceService: SentMessagePersistenceService,
    private readonly myahInboxReplyActionDefinition: MyahInboxReplyActionDefinition,
  ) {}

  async project(input: InboxProjectionInput): Promise<void> {
    if (!isNonEmptyString(input.providerMessageId)) {
      throw new Error('The sent Inbox Message is unavailable for projection');
    }
    const schemaName = getWorkspaceSchemaName(input.workspaceId);
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
        canonicalGraph.messageThreadId !== input.draftId ||
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

      const [cleared] = await manager.query<[{ id: string }[], number]>(
        `UPDATE "${schemaName}"."messageThread"
          SET
            "myahReplyDraftBodyMarkdown" = NULL,
            "myahReplyDraftBodyBlocknote" = NULL,
            "myahReplyDraftRevision" = "myahReplyDraftRevision" + 1,
            "updatedAt" = NOW()
          WHERE "id" = $1
            AND "myahReplyDraftRevision" = $2
            AND "myahReplyDraftBodyMarkdown" IS NOT NULL
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
      !isNonEmptyString(input.draftId) ||
      !isNonEmptyString(input.threadId) ||
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
        recordId: input.draftId,
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
    myahReplyDraftBody: MyahInboxReplyDraft | null;
    myahReplyDraftRevision: number;
  }> {
    const [draft] = await manager.query<
      {
        myahReplyDraftBodyMarkdown: string | null;
        myahReplyDraftBodyBlocknote: string | null;
        myahReplyDraftRevision: number;
      }[]
    >(
      `SELECT
          "myahReplyDraftBodyMarkdown",
          "myahReplyDraftBodyBlocknote",
          "myahReplyDraftRevision"
        FROM "${schemaName}"."messageThread"
        WHERE "id" = $1`,
      [messageThreadId],
    );

    if (!draft || !Number.isInteger(draft.myahReplyDraftRevision)) {
      throw new Error('The approved Inbox reply is unavailable for projection');
    }

    return {
      myahReplyDraftBody: normalizeMyahInboxReplyDraft(draft),
      myahReplyDraftRevision: draft.myahReplyDraftRevision,
    };
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
        parent_association."messageThreadExternalId" AS "parentThreadExternalId",
        parent_association."direction" AS "parentAssociationDirection"
      FROM "${schemaName}"."message" message
      INNER JOIN "${schemaName}"."messageChannelMessageAssociation" association ON association."messageId" = message."id"
      INNER JOIN core."messageChannel" channel ON channel."id" = association."messageChannelId"
      INNER JOIN core."connectedAccount" account ON account."id" = channel."connectedAccountId"
      INNER JOIN "${schemaName}"."message" parent ON parent."id" = $3 AND parent."messageThreadId" = message."messageThreadId"
      LEFT JOIN "${schemaName}"."messageChannelMessageAssociation" parent_association ON parent_association."messageId" = parent."id" AND parent_association."messageChannelId" = association."messageChannelId"
      WHERE message."headerMessageId" = $1
        OR ($2::text IS NOT NULL AND association."messageExternalId" = $2::text)`,
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
      message.messageThreadId === input.draftId &&
      isNonEmptyString(message.messageChannelId) &&
      isNonEmptyString(message.connectedAccountId) &&
      message.subject !== null &&
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
          input.draftId,
          message.parentMessageId,
          message.parentAssociationDirection,
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
}
