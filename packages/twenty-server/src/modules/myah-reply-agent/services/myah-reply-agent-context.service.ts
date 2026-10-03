import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { isValidUuid } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { findCampaignActiveParticipations } from 'src/modules/campaign-execution/utils/campaign-active-participation.util';

type Row = Record<string, unknown>;
const text = (value: unknown, max = 1_500): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max
    ? `${trimmed.slice(0, max)} […truncated]`
    : trimmed;
};

export type MyahReplyAgentChannel = 'EMAIL' | 'INSTAGRAM';

export type MyahReplyAgentConversation = {
  channel: MyahReplyAgentChannel;
  conversationRecordId: string;
  creatorId: string | null;
  latestInbound: { id: string; sentAt: Date } | null;
  // Instagram: the brand account handle; email: unused.
  accountHandle: string | null;
};

export type MyahReplyAgentHistoryMessage = {
  channel: MyahReplyAgentChannel;
  direction: 'FROM_CREATOR' | 'FROM_BRAND';
  sentAt: string;
  text: string;
};

export type MyahReplyAgentContext = {
  creator: {
    id: string;
    name: string | null;
    location: string | null;
    language: string | null;
    instagramHandle: string | null;
    hasEmail: boolean;
  };
  notes: string[];
  activeCampaign: null | {
    id: string;
    name: string | null;
    stage: string | null;
    objective: string | null;
    brief: string | null;
    additionalNotes: string | null;
    emailSignature: string | null;
  };
  pastCampaigns: Array<{
    name: string | null;
    stage: string | null;
    updatedAt: string;
  }>;
  history: MyahReplyAgentHistoryMessage[];
};

const HISTORY_LIMIT = 30;

// System reads that ground the reply agent (MYAH-445). Workspace schema names
// are UUID-derived; every value is a bind parameter.
@Injectable()
export class MyahReplyAgentContextService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async loadConversation(input: {
    workspaceId: string;
    channel: MyahReplyAgentChannel;
    conversationRecordId: string;
  }): Promise<MyahReplyAgentConversation | null> {
    if (
      !isValidUuid(input.workspaceId) ||
      !isValidUuid(input.conversationRecordId)
    )
      return null;
    const schema = getWorkspaceSchemaName(input.workspaceId);
    if (input.channel === 'INSTAGRAM') {
      // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
      const [row] = (await this.dataSource.query(
        `SELECT c."creatorId", a.username AS "accountHandle",
                (SELECT m.id FROM "${schema}"."myahSocialMessage" m
                  WHERE m."conversationId" = c.id AND m."deletedAt" IS NULL AND m.direction::text = 'INBOUND'
                  ORDER BY COALESCE(m."providerCreatedAt", m."createdAt") DESC, m.id DESC LIMIT 1) AS "inboundId",
                (SELECT COALESCE(m."providerCreatedAt", m."createdAt") FROM "${schema}"."myahSocialMessage" m
                  WHERE m."conversationId" = c.id AND m."deletedAt" IS NULL AND m.direction::text = 'INBOUND'
                  ORDER BY COALESCE(m."providerCreatedAt", m."createdAt") DESC, m.id DESC LIMIT 1) AS "inboundAt"
           FROM "${schema}"."myahSocialConversation" c
           LEFT JOIN "${schema}"."myahInstagramAccount" a ON a.id = c."instagramAccountId"
          WHERE c.id = $1 AND c."deletedAt" IS NULL`,
        [input.conversationRecordId],
      )) as Row[];
      if (!row) return null;
      return {
        channel: 'INSTAGRAM',
        conversationRecordId: input.conversationRecordId,
        creatorId: typeof row.creatorId === 'string' ? row.creatorId : null,
        latestInbound:
          typeof row.inboundId === 'string'
            ? { id: row.inboundId, sentAt: new Date(String(row.inboundAt)) }
            : null,
        accountHandle: text(row.accountHandle),
      };
    }
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const [row] = (await this.dataSource.query(
      `SELECT t."creatorId",
              (SELECT m.id FROM "${schema}".message m
                 JOIN "${schema}"."messageChannelMessageAssociation" a ON a."messageId" = m.id AND a."deletedAt" IS NULL
                WHERE m."messageThreadId" = t.id AND m."deletedAt" IS NULL AND a.direction::text = 'INCOMING'
                ORDER BY m."receivedAt" DESC NULLS LAST, m.id DESC LIMIT 1) AS "inboundId",
              (SELECT m."receivedAt" FROM "${schema}".message m
                 JOIN "${schema}"."messageChannelMessageAssociation" a ON a."messageId" = m.id AND a."deletedAt" IS NULL
                WHERE m."messageThreadId" = t.id AND m."deletedAt" IS NULL AND a.direction::text = 'INCOMING'
                ORDER BY m."receivedAt" DESC NULLS LAST, m.id DESC LIMIT 1) AS "inboundAt"
         FROM "${schema}"."messageThread" t
        WHERE t.id = $1 AND t."deletedAt" IS NULL`,
      [input.conversationRecordId],
    )) as Row[];
    if (!row) return null;
    return {
      channel: 'EMAIL',
      conversationRecordId: input.conversationRecordId,
      creatorId: typeof row.creatorId === 'string' ? row.creatorId : null,
      latestInbound:
        typeof row.inboundId === 'string'
          ? { id: row.inboundId, sentAt: new Date(String(row.inboundAt)) }
          : null,
      accountHandle: null,
    };
  }

  async loadContext(input: {
    workspaceId: string;
    creatorId: string;
  }): Promise<MyahReplyAgentContext | null> {
    const schema = getWorkspaceSchemaName(input.workspaceId);
    const query = (sql: string, parameters: unknown[]) =>
      this.dataSource.query(sql, parameters) as Promise<Row[]>;
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const [creator] = await query(
      `SELECT c.id, c.name, c.location, c.language, c.email,
              (SELECT sp.handle FROM "${schema}"."socialProfile" sp
                WHERE sp."creatorId" = c.id AND sp."deletedAt" IS NULL AND sp.platform::text = 'INSTAGRAM'
                ORDER BY sp."createdAt" LIMIT 1) AS "instagramHandle"
         FROM "${schema}".creator c WHERE c.id = $1 AND c."deletedAt" IS NULL`,
      [input.creatorId],
    );
    if (!creator) return null;
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const notes = await query(
      `SELECT n."bodyV2Markdown" AS body FROM "${schema}"."noteTarget" nt
         JOIN "${schema}".note n ON n.id = nt."noteId" AND n."deletedAt" IS NULL
        WHERE nt."targetCreatorId" = $1 AND nt."deletedAt" IS NULL
        ORDER BY n."createdAt" DESC LIMIT 10`,
      [input.creatorId],
    );
    const active = (
      await findCampaignActiveParticipations(query, {
        workspaceId: input.workspaceId,
        creatorIds: [input.creatorId],
      })
    ).get(input.creatorId);
    const [campaign] = active
      ? // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
        await query(
          `SELECT id, name, objective, "campaignBriefMarkdown" AS brief,
                  "additionalNotesMarkdown" AS "additionalNotes",
                  "emailSignatureMarkdown" AS "emailSignature"
             FROM "${schema}".campaign WHERE id = $1`,
          [active.campaignId],
        )
      : [];
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const participations = await query(
      `SELECT c.name, cc.stage::text AS stage, cc."updatedAt"
         FROM "${schema}"."campaignCreator" cc
         JOIN "${schema}".campaign c ON c.id = cc."campaignId" AND c."deletedAt" IS NULL
        WHERE cc."creatorId" = $1 AND cc."deletedAt" IS NULL AND ($2::uuid IS NULL OR c.id <> $2::uuid)
        ORDER BY cc."updatedAt" DESC LIMIT 10`,
      [input.creatorId, active?.campaignId ?? null],
    );
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const instagram = await query(
      `SELECT m.direction::text AS direction, m.text, COALESCE(m."providerCreatedAt", m."createdAt") AS "sentAt"
         FROM "${schema}"."myahSocialMessage" m
         JOIN "${schema}"."myahSocialConversation" c ON c.id = m."conversationId" AND c."deletedAt" IS NULL
        WHERE c."creatorId" = $1 AND m."deletedAt" IS NULL AND COALESCE(TRIM(m.text), '') <> ''
        ORDER BY 3 DESC LIMIT $2`,
      [input.creatorId, HISTORY_LIMIT],
    );
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema identifier; values are bind parameters.
    const email = await query(
      `SELECT DISTINCT ON (m.id) a.direction::text AS direction, m.subject, m.text, m."receivedAt" AS "sentAt"
         FROM "${schema}".message m
         JOIN "${schema}"."messageThread" t ON t.id = m."messageThreadId" AND t."deletedAt" IS NULL
         JOIN "${schema}"."messageChannelMessageAssociation" a ON a."messageId" = m.id AND a."deletedAt" IS NULL
        WHERE t."creatorId" = $1 AND m."deletedAt" IS NULL
        ORDER BY m.id, m."receivedAt" DESC`,
      [input.creatorId],
    );
    const history: MyahReplyAgentHistoryMessage[] = [
      ...instagram.map((row) => ({
        channel: 'INSTAGRAM' as const,
        direction:
          row.direction === 'INBOUND'
            ? ('FROM_CREATOR' as const)
            : ('FROM_BRAND' as const),
        sentAt: new Date(String(row.sentAt)).toISOString(),
        text: text(row.text, 1_000) ?? '',
      })),
      ...email.map((row) => ({
        channel: 'EMAIL' as const,
        direction:
          row.direction === 'INCOMING'
            ? ('FROM_CREATOR' as const)
            : ('FROM_BRAND' as const),
        sentAt: new Date(String(row.sentAt)).toISOString(),
        text: [text(row.subject, 200), text(row.text, 1_500)]
          .filter(Boolean)
          .join(' — '),
      })),
    ]
      .filter((message) => message.text.length > 0)
      .sort((left, right) => left.sentAt.localeCompare(right.sentAt))
      .slice(-HISTORY_LIMIT);

    return {
      creator: {
        id: input.creatorId,
        name: text(creator.name, 200),
        location: text(creator.location, 200),
        language: text(creator.language, 100),
        instagramHandle: text(creator.instagramHandle, 100),
        hasEmail:
          typeof creator.email === 'string' && creator.email.includes('@'),
      },
      notes: notes
        .map((row) => text(row.body, 800))
        .filter((note): note is string => note !== null),
      activeCampaign: active
        ? {
            id: active.campaignId,
            name: text(campaign?.name, 200),
            stage: active.stage,
            objective: text(campaign?.objective, 1_000),
            brief: text(campaign?.brief, 3_000),
            additionalNotes: text(campaign?.additionalNotes, 2_000),
            emailSignature: text(campaign?.emailSignature, 2_000),
          }
        : null,
      pastCampaigns: participations.map((row) => ({
        name: text(row.name, 200),
        stage: typeof row.stage === 'string' ? row.stage : null,
        updatedAt: new Date(String(row.updatedAt)).toISOString(),
      })),
      history,
    };
  }
}
