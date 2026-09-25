import { ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Command, CommandRunner, Option } from 'nest-commander';
import { type Repository } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';

import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

type BackfillOptions = {
  workspaceId?: string;
  afterMessageId?: string;
  limit?: number;
  apply?: boolean;
};

type HistoricalInbound = {
  messageId: string;
  threadId: string;
  channelId: string;
  threadExternalId: string;
  sender: string;
};

@Command({
  name: 'myah:inbox:backfill-campaign-reply-evidence',
  description:
    'Preview or explicitly backfill historical incoming Campaign replies for one workspace',
})
export class MyahInboxBackfillCampaignReplyEvidenceCommand extends CommandRunner {
  private readonly logger = new Logger(
    MyahInboxBackfillCampaignReplyEvidenceCommand.name,
  );

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly replies: CampaignReplyService,
    private readonly lifecycle: MyahInboxContactTriageLifecycleService,
  ) {
    super();
  }

  @Option({
    flags: '--workspace-id <id>',
    description: 'One existing workspace UUID (required)',
  })
  parseWorkspaceId(value: string): string {
    return value;
  }

  @Option({
    flags: '--after-message-id <id>',
    description: 'Resume after this message UUID',
  })
  parseAfterMessageId(value: string): string {
    return value;
  }

  @Option({
    flags: '--limit <count>',
    description: 'Maximum inbound rows to scan, 1–500 (default 100)',
  })
  parseLimit(value: string): number {
    return Number(value);
  }

  @Option({
    flags: '--apply',
    description: 'Persist evidence; omitted means read-only preview',
  })
  parseApply(): boolean {
    return true;
  }

  async run(_passedParams: string[], options: BackfillOptions): Promise<void> {
    const { workspaceId, afterMessageId = null, apply = false } = options;
    const limit = options.limit ?? 100;

    if (!workspaceId || !isValidUuid(workspaceId))
      throw new Error('A valid workspace UUID is required');
    if (afterMessageId !== null && !isValidUuid(afterMessageId))
      throw new Error('Invalid backfill cursor');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new Error('Backfill limit must be between 1 and 500');
    if (!(await this.workspaces.existsBy({ id: workspaceId })))
      throw new Error('Backfill workspace does not exist');

    await this.orm.executeInWorkspaceContext(
      async () => {
        const schema = getWorkspaceSchemaName(workspaceId);
        const dataSource = await this.orm.getGlobalWorkspaceDataSource();
        // A message can be shared across mailboxes. Only single-channel inbound
        // proof is eligible: ambiguous channel provenance cannot be reconstructed.
        // Historical Message has no persisted In-Reply-To; never invent EXACT.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        const candidates = await dataSource.query<HistoricalInbound[]>(
          `SELECT message.id AS "messageId", message."messageThreadId" AS "threadId",
                  association."messageChannelId" AS "channelId",
                  association."messageThreadExternalId" AS "threadExternalId",
                  lower(trim(sender.handle)) AS sender
             FROM "${schema}".message message
             JOIN "${schema}"."messageChannelMessageAssociation" association
               ON association."messageId"=message.id AND association."deletedAt" IS NULL
             JOIN core."messageChannel" channel
               ON channel.id=association."messageChannelId" AND channel."workspaceId"=$1
             JOIN LATERAL (
               SELECT participant.handle FROM "${schema}"."messageParticipant" participant
                WHERE participant."messageId"=message.id AND participant.role='FROM'
                ORDER BY participant.id LIMIT 1
             ) sender ON true
            WHERE message."deletedAt" IS NULL AND message."receivedAt" IS NOT NULL
              AND message."messageThreadId" IS NOT NULL AND message."isDraft"=false
              AND association.direction='INCOMING'
              AND channel.type::text IN ('EMAIL','EMAIL_GROUP')
              AND association."messageThreadExternalId" IS NOT NULL
              AND trim(association."messageThreadExternalId") <> ''
              AND trim(sender.handle) <> ''
              AND ($2::uuid IS NULL OR message.id > $2)
              AND NOT EXISTS (
                SELECT 1 FROM "${schema}"."messageChannelMessageAssociation" other
                 WHERE other."messageId"=message.id AND other."deletedAt" IS NULL
                   AND other.direction='INCOMING' AND other.id<>association.id
              )
              AND EXISTS (
                SELECT 1 FROM core."outboundEmailAttempt" attempt
                JOIN core."campaignEnrollment" enrollment
                  ON enrollment.id=attempt."enrollmentId"
                 AND enrollment."workspaceId"=attempt."workspaceId"
                WHERE attempt."workspaceId"=$1
                  AND attempt."messageChannelId"=association."messageChannelId"
                  AND attempt.source='CAMPAIGN_SEQUENCE'
                  AND attempt."attemptState"='ACCEPTED'
                  AND attempt."providerAcceptedAt" <= message."receivedAt"
                  AND attempt."resolvedThreadExternalId"=association."messageThreadExternalId"
                  AND attempt."normalizedRecipient"=lower(trim(sender.handle))
              )
              AND NOT EXISTS (
                SELECT 1 FROM core."myahCampaignReplyEvidence" evidence
                WHERE evidence."workspaceId"=$1 AND evidence."inboundMessageId"=message.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM core."myahCampaignReplyPending" pending
                WHERE pending."workspaceId"=$1 AND pending."messageId"=message.id
              )
            ORDER BY message.id LIMIT $3`,
          [workspaceId, afterMessageId, limit],
          undefined,
          // Explicit workspace-scoped operator command; no request actor.
          { shouldBypassPermissionChecks: true },
        );
        if (apply) {
          for (const candidate of candidates) {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await dataSource.transaction(async (manager) => {
                  // The global workspace datasource supplies the transaction
                  // manager used by the same reply path as live imports.
                  const workspaceManager = manager as WorkspaceEntityManager;
                  const candidateCreatorIds =
                    await this.replies.prepareInboundCandidateCreatorsInTransaction(
                      {
                        workspaceId,
                        messageChannelId: candidate.channelId,
                        candidates: [
                          {
                            threadExternalId: candidate.threadExternalId,
                            normalizedSender: candidate.sender,
                          },
                        ],
                      },
                      workspaceManager,
                    );
                  // Preview the existing Creator before taking any source lock.
                  // The lifecycle guard retries if another writer changes it.
                  // pi-lens-ignore: sql-injection, no-sql-in-code
                  const [thread] = (await manager.queryRunner!.query(
                    `SELECT "creatorId" FROM "${schema}"."messageThread" WHERE id=$1`,
                    [candidate.threadId],
                  )) as Array<{ creatorId: string | null }>;
                  const coveredCreatorIds = [
                    ...new Set([
                      ...candidateCreatorIds,
                      ...(thread?.creatorId ? [thread.creatorId] : []),
                    ]),
                  ].sort();
                  await this.lifecycle.withCreatorMutationLocksInTransaction({
                    creatorIds: coveredCreatorIds,
                    manager: workspaceManager,
                    mutate: () =>
                      this.replies.reconcileInboundMessageInTransaction(
                        {
                          workspaceId,
                          messageChannelId: candidate.channelId,
                          threadExternalId: candidate.threadExternalId,
                          fromHandle: candidate.sender,
                          inboundEvidenceId: candidate.messageId,
                          inboundMessageThreadId: candidate.threadId,
                          inReplyToTokens: [],
                          coveredCreatorIds,
                          skipProgression: true,
                        },
                        workspaceManager,
                      ),
                  });
                });
                break;
              } catch (error) {
                if (
                  !(error instanceof ConflictException) ||
                  error.message !==
                    'Inbox Creator lock coverage changed before source mutation' ||
                  attempt === 2
                )
                  throw error;
              }
            }
          }
        }
        this.logger.log(
          JSON.stringify({
            workspaceId,
            mode: apply ? 'APPLY' : 'DRY_RUN',
            scanned: candidates.length,
            nextAfterMessageId:
              candidates[candidates.length - 1]?.messageId ?? afterMessageId,
          }),
        );
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );
  }
}
