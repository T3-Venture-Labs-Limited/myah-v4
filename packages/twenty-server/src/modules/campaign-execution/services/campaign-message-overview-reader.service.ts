import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { deriveCampaignMessageOverviewStatus } from 'src/modules/campaign-execution/services/campaign-message-overview-status';
import {
  CampaignMessageOverviewDateBasis,
  type CampaignMessageOverviewConnectionDTO,
  CampaignMessageOverviewInput,
  CampaignMessageOverviewView,
} from 'src/modules/campaign-execution/dtos/campaign-message-overview.dto';

type CampaignRecord = { id: string; name: string | null };
type CampaignCreatorRecord = {
  id: string;
  campaignId: string;
  creatorId: string;
};
type CreatorRecord = { id: string; name: string | null; email?: string | null };
type MessageThreadRecord = { id: string };
type MessageRecord = {
  id: string;
  subject: string | null;
  text: string | null;
};
type HeadRow = {
  complete: boolean | null;
  currentGenerationId: string | null;
  generatedAt: Date | string | null;
  horizonEndsAt: Date | string | null;
  inputRevision: string;
  generationRevision: string | null;
};
type OverviewFact = {
  attemptState: string | null;
  authoredMessageIndex: number;
  campaignCreatorId: string;
  campaignId: string;
  connectedAccountId: string | null;
  creatorId: string;
  dueAt: Date | string;
  estimatedSendAt: Date | string | null;
  holdReason: string | null;
  messageId: string;
  occurrenceId: string;
  occurrenceState: string;
  projectedMessageId: string | null;
  projectedMessageThreadId: string | null;
  providerAcceptedAt: Date | string | null;
  recipient: string | null;
  visibilityRank: number;
  renderSubject: string | null;
  renderText: string | null;
  safeOutcomeReason: string | null;
  sortAt: Date | string;
  workflowVersionId: string;
};
// ponytail: bounded permission hydration truncates oversized scopes; replace with permission-aware keyset joins when real workspaces reach these ceilings.
const MAX_PERMISSION_CAMPAIGNS = 1_000;
const MAX_PERMISSION_MEMBERSHIPS = 5_000;

type Cursor = {
  generationId: string | null;
  occurrenceId: string;
  scope: string;
  sortAt: string;
  v: 2;
};

const rows = <T>(value: unknown): T[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as T[])
    : Array.isArray(value)
      ? (value as T[])
      : [];

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

const authoredBodyPreview = (body: string): string => {
  try {
    const document = JSON.parse(body) as {
      content?: unknown[];
      type?: string;
    };

    if (document.type !== 'doc' || !Array.isArray(document.content))
      return body;

    const text = (node: unknown): string => {
      if (!node || typeof node !== 'object') return '';
      const value = node as {
        attrs?: { variable?: unknown };
        content?: unknown[];
        text?: unknown;
        type?: unknown;
      };
      if (typeof value.text === 'string') return value.text;
      if (
        value.type === 'variableTag' &&
        typeof value.attrs?.variable === 'string'
      )
        return value.attrs.variable;
      if (value.type === 'hardBreak') return '\n';
      if (!Array.isArray(value.content)) return '';
      const content = value.content.map(text).join('');

      return value.type === 'paragraph' ? `${content}\n` : content;
    };

    return document.content.map(text).join('').trim();
  } catch {
    return body;
  }
};

const encodeCursor = (value: Cursor): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const decodeCursor = (value: string | undefined): Cursor | null => {
  if (!value) return null;
  try {
    const cursor = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<Cursor>;
    if (
      cursor.v !== 2 ||
      !('generationId' in cursor) ||
      typeof cursor.scope !== 'string' ||
      typeof cursor.occurrenceId !== 'string' ||
      typeof cursor.sortAt !== 'string' ||
      !Number.isFinite(new Date(cursor.sortAt).getTime())
    )
      throw new Error();
    return cursor as Cursor;
  } catch {
    throw new Error('Invalid Campaign message overview cursor');
  }
};

@Injectable()
export class CampaignMessageOverviewReaderService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    @InjectDataSource() private readonly coreDataSource: DataSource,
    private readonly connectedAccounts: ConnectedAccountMetadataService,
    private readonly campaignSequences: CampaignSequenceService,
  ) {}

  async readDetail(input: {
    authContext: WorkspaceAuthContext;
    occurrenceId: string;
  }) {
    const filters = Object.assign(new CampaignMessageOverviewInput(), {
      first: 1,
      occurrenceId: input.occurrenceId,
    });
    const result = await this.read({ authContext: input.authContext, filters });

    return result.nodes[0] ?? null;
  }

  async read(input: {
    authContext: WorkspaceAuthContext;
    filters: CampaignMessageOverviewInput;
  }): Promise<CampaignMessageOverviewConnectionDTO> {
    const workspaceId = input.authContext.workspace.id;
    const readableConnectedAccountIds = await this.readableAccountIds(
      input.authContext,
    );
    const requestedAccountIds = input.filters.connectedAccountIds;
    const accountFilter = requestedAccountIds
      ? requestedAccountIds.filter(
          (id) =>
            readableConnectedAccountIds === null ||
            readableConnectedAccountIds.has(id),
        )
      : null;

    return this.orm.executeInWorkspaceContext(async () => {
      const context = getWorkspaceContext();
      const permissions = resolveRolePermissionConfig({
        authContext: input.authContext,
        apiKeyRoleMap: context.apiKeyRoleMap,
        userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      });
      if (!permissions)
        throw new ForbiddenException('Campaign message permissions required');

      const [
        campaignRepository,
        campaignCreatorRepository,
        creatorRepository,
        messageThreadRepository,
        messageRepository,
      ] = await Promise.all([
        this.orm.getRepository<CampaignRecord>(
          workspaceId,
          'campaign',
          permissions,
        ),
        this.orm.getRepository<CampaignCreatorRecord>(
          workspaceId,
          'campaignCreator',
          permissions,
        ),
        this.orm.getRepository<CreatorRecord>(
          workspaceId,
          'creator',
          permissions,
        ),
        this.orm.getRepository<MessageThreadRecord>(
          workspaceId,
          'messageThread',
          permissions,
        ),
        this.orm.getRepository<MessageRecord>(
          workspaceId,
          'message',
          permissions,
        ),
      ]);
      const messageObjectId = context.objectIdByNameSingular?.message;
      const roleIds =
        'intersectionOf' in permissions
          ? permissions.intersectionOf
          : 'unionOf' in permissions
            ? permissions.unionOf
            : [];
      let canReadRenderedContent =
        'shouldBypassPermissionChecks' in permissions ||
        roleIds.every((roleId) => {
          const objectPermission =
            context.permissionsPerRoleId[roleId]?.[messageObjectId];

          return (
            objectPermission !== undefined &&
            objectPermission.rowLevelPermissionPredicates.length === 0 &&
            objectPermission.rowLevelPermissionPredicateGroups.length === 0
          );
        });

      if (canReadRenderedContent) {
        try {
          await messageRepository.find({
            select: { id: true, subject: true, text: true },
            take: 1,
          });
        } catch (error) {
          // Integration and queue entry points may load the exception class
          // through different module instances; the stable code is the contract.
          if (
            !error ||
            typeof error !== 'object' ||
            !('code' in error) ||
            error.code !== PermissionsExceptionCode.PERMISSION_DENIED
          )
            throw error;
          canReadRenderedContent = false;
        }
      }

      const campaignRows = await campaignRepository.find({
        select: { id: true, name: true },
        take: MAX_PERMISSION_CAMPAIGNS + 1,
      });
      let permissionScopeTruncated =
        campaignRows.length > MAX_PERMISSION_CAMPAIGNS;
      const campaigns = campaignRows.slice(0, MAX_PERMISSION_CAMPAIGNS);
      const selectedCampaigns = input.filters.campaignIds?.length
        ? campaigns.filter(({ id }) => input.filters.campaignIds?.includes(id))
        : campaigns;
      if (selectedCampaigns.length === 0) return this.empty(campaigns);

      const campaignCreatorRows = await campaignCreatorRepository.find({
        select: { id: true, campaignId: true, creatorId: true },
        take: MAX_PERMISSION_MEMBERSHIPS + 1,
        where: { campaignId: In(selectedCampaigns.map(({ id }) => id)) },
      });
      permissionScopeTruncated =
        permissionScopeTruncated ||
        campaignCreatorRows.length > MAX_PERMISSION_MEMBERSHIPS;
      const campaignCreators = campaignCreatorRows.slice(
        0,
        MAX_PERMISSION_MEMBERSHIPS,
      );
      const search = input.filters.search?.trim().toLocaleLowerCase();
      let canReadCreatorEmail = true;
      let creators: CreatorRecord[];

      try {
        creators = await creatorRepository.find({
          select: { id: true, name: true, email: true },
          where: { id: In(campaignCreators.map(({ creatorId }) => creatorId)) },
        });
        canReadCreatorEmail = true;
      } catch (error) {
        if (
          !(error instanceof PermissionsException) ||
          error.code !== PermissionsExceptionCode.PERMISSION_DENIED
        )
          throw error;
        canReadCreatorEmail = false;
        creators = await creatorRepository.find({
          select: { id: true, name: true },
          where: { id: In(campaignCreators.map(({ creatorId }) => creatorId)) },
        });
      }
      const campaignById = new Map(
        selectedCampaigns.map((row) => [row.id, row]),
      );
      const creatorById = new Map(creators.map((row) => [row.id, row]));
      const nameMatchingMembershipIds = new Set(
        campaignCreators
          .filter((membership) => {
            const campaign = campaignById.get(membership.campaignId);
            const creator = creatorById.get(membership.creatorId);
            if (!campaign || !creator || !search) return false;
            return [campaign.name, creator.name].some((value) =>
              value?.toLocaleLowerCase().includes(search),
            );
          })
          .map(({ id }) => id),
      );
      const readableMemberships = campaignCreators.filter((membership) => {
        if (
          !campaignById.has(membership.campaignId) ||
          !creatorById.has(membership.creatorId)
        )
          return false;
        return (
          !search ||
          nameMatchingMembershipIds.has(membership.id) ||
          canReadRenderedContent
        );
      });
      if (readableMemberships.length === 0) return this.empty(campaigns);

      return this.coreDataSource.transaction(async (manager) => {
        // Only this transaction's connection resolves the two authored workflow
        // tables; parameterize the workspace schema rather than interpolating SQL.
        await manager.query(`SELECT set_config('search_path',$1,true)`, [
          getWorkspaceSchemaName(workspaceId),
        ]);
        const heads = rows<HeadRow>(
          await manager.query(
            `SELECT head."inputRevision"::text AS "inputRevision",head."currentGenerationId",
                    generation."inputRevision"::text AS "generationRevision",generation."generatedAt",
                    generation."horizonEndsAt",generation.complete
               FROM core."campaignForecastHead" head
               LEFT JOIN core."campaignForecastGeneration" generation ON generation.id=head."currentGenerationId"
              WHERE head."workspaceId"=$1 AND head."scopeKey"=$2`,
            [workspaceId, `workspace:${workspaceId}`],
          ),
        );
        const head = heads.length === 1 ? heads[0] : undefined;
        const generationId = head?.currentGenerationId ?? null;
        const scope = createHash('sha256')
          .update(
            JSON.stringify({
              workspaceId,
              roleIds: [...roleIds].sort(),
              campaignIds: selectedCampaigns.map(({ id }) => id).sort(),
              requestedCampaignIds: input.filters.campaignIds
                ? [...input.filters.campaignIds].sort()
                : null,
              membershipIds: readableMemberships.map(({ id }) => id).sort(),
              readableAccountIds:
                readableConnectedAccountIds === null
                  ? null
                  : [...readableConnectedAccountIds].sort(),
              accountIds:
                accountFilter === null ? null : [...accountFilter].sort(),
              requestedAccountIds: input.filters.connectedAccountIds
                ? [...input.filters.connectedAccountIds].sort()
                : null,
              canReadRenderedContent,
              canReadCreatorEmail,
              view: input.filters.view,
              search: search ?? null,
              dateBasis:
                input.filters.dateBasis ??
                CampaignMessageOverviewDateBasis.ESTIMATED_SEND,
              dateFrom: input.filters.dateFrom
                ? new Date(input.filters.dateFrom).toISOString()
                : null,
              dateTo: input.filters.dateTo
                ? new Date(input.filters.dateTo).toISOString()
                : null,
              occurrenceId: input.filters.occurrenceId ?? null,
            }),
          )
          .digest('hex');
        const cursor = decodeCursor(input.filters.after);
        if (
          cursor &&
          (cursor.generationId !== generationId || cursor.scope !== scope)
        )
          throw new Error(
            'Campaign message overview changed; restart pagination',
          );

        const statuses =
          input.filters.view === CampaignMessageOverviewView.ALL
            ? null
            : input.filters.view === CampaignMessageOverviewView.SENT
              ? ['SENT']
              : input.filters.view === CampaignMessageOverviewView.SCHEDULED
                ? ['SCHEDULED']
                : ['NEEDS_ATTENTION'];
        // Both list/detail and options use this authorization projection before
        // any search, keyset limit or DISTINCT. Cursor access changes are
        // rechecked here even when no channel-policy revision exists to reject it.
        const scopedSql = `SELECT o.id AS "occurrenceId",o."campaignId",o."workflowVersionId",o."messageId",o."authoredMessageIndex",o.state AS "occurrenceState",o."dueAt",o."holdReason",
                  enrollment."campaignCreatorId",enrollment."creatorId",entry."estimatedSendAt",
                  attempt."attemptState",attempt."providerAcceptedAt",COALESCE(attempt."connectedAccountId",entry."connectedAccountId") AS "connectedAccountId",
                  attempt."projectedMessageId",attempt."projectedMessageThreadId",attempt."safeOutcomeReason",
                  attempt.recipient,attempt."renderSubject",attempt."renderText",visibility.rank AS "visibilityRank",o."dueAt" AS "sortAt"
             FROM core."campaignOccurrence" o
             JOIN core."campaignEnrollment" enrollment ON enrollment.id=o."enrollmentId" AND enrollment."workspaceId"=o."workspaceId"
             LEFT JOIN core."campaignForecastEntry" entry ON entry."generationId"=$4 AND entry."occurrenceId"=o.id
             LEFT JOIN LATERAL (
               SELECT a."attemptState",a."providerAcceptedAt",a."connectedAccountId",a."messageChannelId",a."projectedMessageId",a."projectedMessageThreadId",a."safeOutcomeReason",
                      a."normalizedRecipient" AS recipient,render.subject AS "renderSubject",render.text AS "renderText"
                 FROM core."outboundEmailAttempt" a
                 LEFT JOIN core."campaignOutboundRender" render
                   ON render."attemptId"=a."attemptId" AND render."renderDigest"=a."renderDigest"
                WHERE a."workspaceId"=o."workspaceId" AND a."occurrenceId"=o.id AND a.source='CAMPAIGN_SEQUENCE'
                ORDER BY (a."attemptState"='ACCEPTED') DESC,a."attemptNumber" DESC LIMIT 1
             ) attempt ON TRUE
             -- Projected messages use the same maximum-across-associations tier as
             -- MessageVisibilityPolicyService. Never fall back to an attempt if
             -- a projected association is missing. Forecast accounts are not grants.
             LEFT JOIN LATERAL (
               SELECT CASE WHEN account."userWorkspaceId"=$18::uuid THEN 3
                           WHEN channel.visibility='SHARE_EVERYTHING' THEN 3
                           WHEN channel.visibility='SUBJECT' THEN 2
                           WHEN channel.visibility='METADATA' THEN 1 ELSE 0 END AS rank
                 FROM "messageChannelMessageAssociation" association
                 JOIN core."messageChannel" channel ON channel.id=association."messageChannelId"
                   AND channel."workspaceId"=o."workspaceId"
                 JOIN core."connectedAccount" account ON account.id=channel."connectedAccountId"
                   AND account."workspaceId"=o."workspaceId"
                WHERE association."messageId"=attempt."projectedMessageId"
                  AND association."deletedAt" IS NULL
                ORDER BY rank DESC LIMIT 1
             ) projectedVisibility ON TRUE
             LEFT JOIN LATERAL (
               SELECT CASE WHEN account."userWorkspaceId"=$18::uuid THEN 3
                           WHEN channel.visibility='SHARE_EVERYTHING' THEN 3
                           WHEN channel.visibility='SUBJECT' THEN 2
                           WHEN channel.visibility='METADATA' THEN 1 ELSE 0 END AS rank
                 FROM core."messageChannel" channel
                 JOIN core."connectedAccount" account ON account.id=channel."connectedAccountId"
                   AND account."workspaceId"=o."workspaceId"
                WHERE channel.id=attempt."messageChannelId"
                  AND channel."workspaceId"=o."workspaceId"
                  AND channel."connectedAccountId"=attempt."connectedAccountId"
                  AND attempt."projectedMessageId" IS NULL
                  AND attempt."attemptState" IS DISTINCT FROM 'ACCEPTED'
             ) assignedVisibility ON TRUE
             CROSS JOIN LATERAL (
               SELECT CASE WHEN attempt."projectedMessageId" IS NOT NULL
                             THEN COALESCE(projectedVisibility.rank,0)
                           WHEN attempt."attemptState"='ACCEPTED' THEN 0
                           WHEN attempt."connectedAccountId" IS NULL THEN 1
                           ELSE COALESCE(assignedVisibility.rank,0) END AS rank
             ) visibility
             LEFT JOIN LATERAL (
               SELECT email->>'subject' AS subject,email->>'body' AS body
                 FROM "workflow" workflow
                 JOIN "workflowVersion" version
                   ON version."workflowId"=workflow.id AND version.id=o."workflowVersionId"
                 CROSS JOIN LATERAL jsonb_array_elements(
                   CASE WHEN jsonb_typeof(version."campaignSequence"->'messages')='array'
                     THEN version."campaignSequence"->'messages' ELSE '[]'::jsonb END
                 ) email
                WHERE $15::boolean AND $14::text IS NOT NULL
                  AND attempt."attemptState" IS DISTINCT FROM 'ACCEPTED'
                  AND visibility.rank >= 2
                  AND workflow."outreachCampaignId"=o."campaignId"
                  AND workflow."deletedAt" IS NULL AND version."deletedAt" IS NULL
                  AND email->>'id'=o."messageId"::text AND email->>'channel'='EMAIL'
                LIMIT 1
             ) authored ON TRUE
            WHERE o."workspaceId"=$1
              AND o."campaignId"=ANY($2::uuid[])
              AND enrollment."campaignCreatorId"=ANY($3::uuid[])
`;
        const scopedParameters = [
          workspaceId,
          selectedCampaigns.map(({ id }) => id),
          readableMemberships.map(({ id }) => id),
          generationId,
          accountFilter,
          statuses,
          input.filters.dateFrom ?? null,
          input.filters.dateTo ?? null,
          cursor?.sortAt ?? null,
          cursor?.occurrenceId ?? null,
          input.filters.first + 1,
          input.filters.dateBasis ??
            CampaignMessageOverviewDateBasis.ESTIMATED_SEND,
          search ? [...nameMatchingMembershipIds] : null,
          search ?? null,
          canReadRenderedContent,
          canReadCreatorEmail,
          input.filters.occurrenceId ?? null,
          input.authContext.type === 'user'
            ? input.authContext.userWorkspaceId
            : null,
        ];
        const factSql = scopedSql.concat(`
              AND visibility.rank > 0
              AND ($14::text IS NULL OR enrollment."campaignCreatorId"=ANY($13::uuid[])
                   OR ($15::boolean AND ((visibility.rank >= 2 AND lower(COALESCE(attempt."renderSubject",'')) LIKE '%' || $14 || '%')
                                         OR (visibility.rank >= 3 AND lower(COALESCE(attempt."renderText",'')) LIKE '%' || $14 || '%')
                                         OR (visibility.rank >= 2 AND attempt."renderSubject" IS NULL AND lower(COALESCE(authored.subject,'')) LIKE '%' || $14 || '%')
                                         OR (visibility.rank >= 3 AND attempt."renderText" IS NULL AND CASE WHEN (CASE WHEN pg_input_is_valid(authored.body,'jsonb')
                                                    THEN authored.body::jsonb->>'type'='doc' ELSE false END)
                                                   THEN EXISTS (
                                                     SELECT 1 FROM jsonb_path_query(authored.body::jsonb,'$.content.**.text') text_node
                                                      WHERE lower(text_node #>> '{}') LIKE '%' || $14 || '%'
                                                     UNION ALL
                                                     SELECT 1 FROM jsonb_path_query(authored.body::jsonb,'$.content.**.attrs.variable') variable_node
                                                      WHERE lower(variable_node #>> '{}') LIKE '%' || $14 || '%'
                                                   )
                                                   ELSE lower(COALESCE(authored.body,'')) LIKE '%' || $14 || '%'
                                              END) )
                   OR ($15::boolean AND $16::boolean AND visibility.rank >= 3 AND lower(COALESCE(attempt.recipient,'')) LIKE '%' || $14 || '%')))
              AND ($5::uuid[] IS NULL OR COALESCE(attempt."connectedAccountId",entry."connectedAccountId")=ANY($5::uuid[]))
              AND ($6::text[] IS NULL OR (CASE
                    WHEN o.state IN ('CANCELLED','SKIPPED') THEN 'CANCELLED'
                    WHEN o.state IN ('HELD','UNKNOWN','IN_FLIGHT')
                      OR (o.state='SUCCEEDED'
                          AND (attempt."providerAcceptedAt" IS NULL OR attempt."projectedMessageThreadId" IS NULL))
                      OR attempt."attemptState" IN ('RESERVED','PROCESSING','UNKNOWN','BLOCKED')
                      OR (attempt."attemptState"='ACCEPTED'
                          AND (attempt."providerAcceptedAt" IS NULL OR attempt."projectedMessageThreadId" IS NULL)) THEN 'NEEDS_ATTENTION'
                    WHEN attempt."attemptState"='ACCEPTED' AND attempt."providerAcceptedAt" IS NOT NULL THEN 'SENT'
                    ELSE 'SCHEDULED' END)=ANY($6::text[]))
              AND ($7::timestamptz IS NULL OR
                (CASE WHEN $12::text='SENT_AT' THEN attempt."providerAcceptedAt" ELSE entry."estimatedSendAt" END) >= $7)
              AND ($8::timestamptz IS NULL OR
                (CASE WHEN $12::text='SENT_AT' THEN attempt."providerAcceptedAt" ELSE entry."estimatedSendAt" END) < $8)
              AND ($9::timestamptz IS NULL OR (o."dueAt",o.id) < ($9::timestamptz,$10::uuid))
              AND ($17::uuid IS NULL OR o.id=$17::uuid)
            ORDER BY o."dueAt" DESC,o.id DESC LIMIT $11`);
        const facts = rows<OverviewFact>(
          await manager.query(factSql, scopedParameters),
        );
        const accountLabels = new Map(
          rows<{ id: string; label: string }>(
            await manager.query(
              `SELECT id,COALESCE(NULLIF(name,''),handle) AS label
                 FROM core."connectedAccount"
                WHERE "workspaceId"=$1 AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[]))`,
              [
                workspaceId,
                readableConnectedAccountIds === null
                  ? null
                  : [...readableConnectedAccountIds],
              ],
            ),
          ).map(({ id, label }) => [id, label]),
        );
        // Only three fixed placeholders differ between the two static query
        // shapes; every runtime value is passed separately to manager.query.
        const optionScopeSql = scopedSql
          .replace(/\$18/g, '$7')
          .replace(/\$15/g, '$6')
          .replace(/\$14/g, '$5');
        const optionSql =
          'SELECT DISTINCT scoped."connectedAccountId" FROM ('.concat(
            optionScopeSql,
            ` AND visibility.rank > 0) scoped
              WHERE scoped."connectedAccountId" IS NOT NULL
              ORDER BY scoped."connectedAccountId"`,
          );
        const accountOptions = rows<{ connectedAccountId: string }>(
          await manager.query(optionSql, [
            workspaceId,
            selectedCampaigns.map(({ id }) => id),
            readableMemberships.map(({ id }) => id),
            generationId,
            null, // options do not search or hydrate authored content
            false,
            input.authContext.type === 'user'
              ? input.authContext.userWorkspaceId
              : null,
          ]),
        );
        const page = facts.slice(0, input.filters.first);
        const projectedThreadIds = page
          .filter(
            (fact) =>
              fact.attemptState === 'ACCEPTED' &&
              fact.providerAcceptedAt !== null &&
              fact.projectedMessageThreadId !== null,
          )
          .map((fact) => fact.projectedMessageThreadId as string);
        let readableThreads: MessageThreadRecord[] = [];

        try {
          readableThreads = projectedThreadIds.length
            ? await messageThreadRepository.find({
                select: { id: true },
                where: { id: In(projectedThreadIds) },
              })
            : [];
        } catch (error) {
          if (
            !(error instanceof PermissionsException) ||
            error.code !== PermissionsExceptionCode.PERMISSION_DENIED
          )
            throw error;
        }
        const readableThreadIds = new Set(readableThreads.map(({ id }) => id));
        const authoredContent = new Map<
          string,
          { body: string; subject: string }
        >();
        const authoredContentByMessage = new Map<
          string,
          { body: string; subject: string } | null
        >();

        if (canReadRenderedContent) {
          for (const fact of page) {
            if (
              fact.attemptState === 'ACCEPTED' ||
              fact.visibilityRank < 2 ||
              typeof fact.workflowVersionId !== 'string' ||
              typeof fact.messageId !== 'string'
            )
              continue;

            const key = `${fact.campaignId}:${fact.workflowVersionId}:${fact.messageId}`;
            let content = authoredContentByMessage.get(key);

            if (content === undefined) {
              try {
                const email = await this.campaignSequences.loadEmailByVersion({
                  authContext: input.authContext,
                  campaignId: fact.campaignId,
                  messageId: fact.messageId,
                  workflowVersionId: fact.workflowVersionId,
                  workspaceId,
                });

                content = {
                  body: authoredBodyPreview(email.body),
                  subject: email.subject,
                };
              } catch {
                content = null;
              }
              authoredContentByMessage.set(key, content);
            }
            if (content) authoredContent.set(fact.occurrenceId, content);
          }
        }

        const nodes = page.map((fact) => {
          const accepted =
            fact.attemptState === 'ACCEPTED' &&
            fact.providerAcceptedAt !== null;
          const status = deriveCampaignMessageOverviewStatus({
            ...fact,
            providerAcceptedAt: fact.providerAcceptedAt
              ? new Date(fact.providerAcceptedAt)
              : null,
          });
          const needsAttention = status === 'NEEDS_ATTENTION';
          const authored = authoredContent.get(fact.occurrenceId);
          return {
            occurrenceId: fact.occurrenceId,
            campaignId: fact.campaignId,
            campaignName: campaignById.get(fact.campaignId)?.name ?? 'Campaign',
            creatorId: fact.creatorId,
            creatorName: creatorById.get(fact.creatorId)?.name ?? null,
            recipient:
              canReadRenderedContent &&
              canReadCreatorEmail &&
              fact.visibilityRank >= 3
                ? (fact.recipient ??
                  creatorById.get(fact.creatorId)?.email ??
                  null)
                : null,
            subject:
              canReadRenderedContent && fact.visibilityRank >= 2
                ? (fact.renderSubject ?? authored?.subject ?? null)
                : null,
            preview:
              canReadRenderedContent && fact.visibilityRank >= 3
                ? (fact.renderText ?? authored?.body ?? '')
                    .trim()
                    .slice(0, 240) || null
                : null,
            sequenceStep: fact.authoredMessageIndex + 1,
            platform: 'Email',
            status,
            estimatedSendAt:
              accepted || status === 'CANCELLED'
                ? null
                : iso(fact.estimatedSendAt),
            sentAt: iso(fact.providerAcceptedAt),
            eligibleAfter:
              accepted || status === 'CANCELLED' ? null : iso(fact.dueAt),
            connectedAccountId:
              fact.connectedAccountId &&
              (readableConnectedAccountIds === null ||
                readableConnectedAccountIds.has(fact.connectedAccountId))
                ? fact.connectedAccountId
                : null,
            connectedAccountLabel: fact.connectedAccountId
              ? (accountLabels.get(fact.connectedAccountId) ?? null)
              : null,
            senderIsEstimated:
              !accepted &&
              fact.connectedAccountId !== null &&
              (readableConnectedAccountIds === null ||
                readableConnectedAccountIds.has(fact.connectedAccountId)),
            needsAttention,
            reason: fact.holdReason ?? fact.safeOutcomeReason,
            inboxContactId:
              accepted &&
              fact.projectedMessageThreadId &&
              readableThreadIds.has(fact.projectedMessageThreadId)
                ? encodeMyahInboxContactId({
                    workspaceId,
                    identity: { kind: 'creator', recordId: fact.creatorId },
                  })
                : null,
            inboxThreadId:
              accepted &&
              fact.projectedMessageThreadId &&
              readableThreadIds.has(fact.projectedMessageThreadId)
                ? fact.projectedMessageThreadId
                : null,
          };
        });
        const last = page[page.length - 1];
        return {
          filterOptions: {
            campaigns: campaigns.map(({ id, name }) => ({
              id,
              name: name ?? 'Campaign',
            })),
            connectedAccounts: accountOptions
              .map(({ connectedAccountId }) => ({
                id: connectedAccountId,
                label:
                  accountLabels.get(connectedAccountId) ??
                  `Account …${connectedAccountId.slice(-6)}`,
              }))
              .filter(({ id }) => accountLabels.has(id)),
            connectedAccountIds: accountOptions
              .map(({ connectedAccountId }) => connectedAccountId)
              .filter((id) => accountLabels.has(id)),
          },
          nodes,
          pageInfo: {
            hasNextPage: facts.length > input.filters.first,
            endCursor:
              facts.length > input.filters.first && last
                ? encodeCursor({
                    v: 2,
                    generationId,
                    scope,
                    occurrenceId: last.occurrenceId,
                    sortAt: iso(last.sortAt) as string,
                  })
                : null,
            generationId,
            generatedAt: iso(head?.generatedAt ?? null),
            horizonEndsAt: iso(head?.horizonEndsAt ?? null),
            forecastComplete:
              head?.complete === true && !permissionScopeTruncated,
            refreshing:
              head !== undefined &&
              head.generationRevision !== head.inputRevision,
          },
        };
      });
    }, input.authContext);
  }

  private async readableAccountIds(
    authContext: WorkspaceAuthContext,
  ): Promise<Set<string> | null> {
    if (authContext.type === 'system') return null;

    const workspaceId = authContext.workspace.id;
    const ids = new Set(
      await this.connectedAccounts.getWorkspaceSharedConnectedAccountIds({
        workspaceId,
      }),
    );

    if ('userWorkspaceId' in authContext && authContext.userWorkspaceId) {
      for (const id of await this.connectedAccounts.getUserConnectedAccountIds({
        userWorkspaceId: authContext.userWorkspaceId,
        workspaceId,
      }))
        ids.add(id);
    }

    return ids;
  }

  private empty(
    campaigns: Array<{ id: string; name: string | null }> = [],
  ): CampaignMessageOverviewConnectionDTO {
    return {
      filterOptions: {
        campaigns: campaigns.map(({ id, name }) => ({
          id,
          name: name ?? 'Campaign',
        })),
        connectedAccounts: [],
        connectedAccountIds: [],
      },
      nodes: [],
      pageInfo: {
        endCursor: null,
        forecastComplete: false,
        generatedAt: null,
        generationId: null,
        hasNextPage: false,
        horizonEndsAt: null,
        refreshing: false,
      },
    };
  }
}
