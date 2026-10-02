import { Injectable, Logger } from '@nestjs/common';

import { IsNull } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';
import { MessageChannelType } from 'twenty-shared/types';

import {
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { normalizeCampaignCreatorEmail } from 'src/modules/myah-outreach/utils/normalize-campaign-creator-email.util';

type AcceptedSend = {
  workspaceId: string;
  messageChannelId: string;
  connectedAccountId: string;
  userWorkspaceId: string;
  connectedAccountHandle: string;
  providerHeaderMessageId: string;
  providerMessageExternalId?: string;
  resolvedThreadExternalId: string;
  to: string[];
  creatorId?: string | null;
  sendStartedAt: Date;
  authContext: WorkspaceAuthContext;
};

@Injectable()
export class MyahComposeEmailSendService {
  private readonly logger = new Logger(MyahComposeEmailSendService.name);

  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly lifecycle: MyahInboxContactTriageLifecycleService,
  ) {}

  async verifyCreatorOrigin({
    creatorId,
    to,
    authContext,
  }: {
    creatorId?: string;
    to: string[];
    authContext: UserWorkspaceAuthContext;
  }): Promise<string | null> {
    if (!creatorId || !isValidUuid(creatorId)) return null;
    const normalizedTo = new Set(to.map(normalizeCampaignCreatorEmail));

    try {
      return await this.orm.executeInWorkspaceContext(async () => {
        const context = getWorkspaceContext();
        const permissions = resolveRolePermissionConfig({
          authContext,
          userWorkspaceRoleMap: context.userWorkspaceRoleMap,
          apiKeyRoleMap: context.apiKeyRoleMap,
        });

        if (!permissions) return null;
        const repository = await this.orm.getRepository<{
          id: string;
          email: string | null;
          deletedAt?: Date | null;
        }>(authContext.workspace.id, 'creator', permissions);
        const creator = await repository.findOne({
          where: { id: creatorId, deletedAt: IsNull() },
          select: { id: true, email: true },
        });

        return creator &&
          !creator.deletedAt &&
          normalizedTo.has(normalizeCampaignCreatorEmail(creator.email))
          ? creator.id
          : null;
      }, authContext);
    } catch {
      // Missing, inaccessible, and unreadable Creators are indistinguishable.
      return null;
    }
  }

  async prepareInboundCandidateCreatorsInTransaction(
    input: {
      workspaceId: string;
      messageChannelId: string;
      candidates: Array<{ threadExternalId: string; normalizedSender: string }>;
    },
    manager: WorkspaceEntityManager,
  ): Promise<string[]> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== manager) {
      throw new Error('Compose reply preparation requires an active manager');
    }
    const candidates = input.candidates.flatMap(
      ({ threadExternalId, normalizedSender }) => {
        const sender = normalizeCampaignCreatorEmail(normalizedSender);

        return threadExternalId.trim() && sender
          ? [{ thread: threadExternalId.trim(), sender }]
          : [];
      },
    );
    if (candidates.length === 0) return [];
    const [schema] = (await runner.query(
      `SELECT to_regclass('core."myahComposeEmailSend"') IS NOT NULL AS "exists"`,
    )) as Array<{ exists: boolean }>;
    if (!schema?.exists) return [];

    const receipts = (await runner.query(
      `SELECT DISTINCT s."creatorId" FROM core."myahComposeEmailSend" s
        WHERE s."workspaceId"=$1 AND s."messageChannelId"=$2
          AND s."creatorId" IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest($3::text[],$4::text[]) AS inbound(thread,sender)
            WHERE s."resolvedThreadExternalId"=inbound.thread
              AND inbound.sender=ANY(s."normalizedTo"))`,
      [
        input.workspaceId,
        input.messageChannelId,
        candidates.map(({ thread }) => thread),
        candidates.map(({ sender }) => sender),
      ],
    )) as Array<{ creatorId: string }>;

    return [...new Set(receipts.map(({ creatorId }) => creatorId))].sort();
  }

  async reconcileInboundMessageInTransaction(
    input: {
      workspaceId: string;
      messageChannelId: string;
      threadExternalId: string;
      fromHandle: string;
      inboundEvidenceId: string;
      inboundMessageThreadId: string;
      inReplyToTokens?: string[];
      coveredCreatorIds?: string[];
    },
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== manager) {
      throw new Error(
        'Compose reply reconciliation requires an active manager',
      );
    }
    const from = normalizeCampaignCreatorEmail(input.fromHandle);
    if (!from || !input.threadExternalId.trim()) return;
    const [schema] = (await runner.query(
      `SELECT to_regclass('core."myahComposeReplyEvidence"') IS NOT NULL AS "exists"`,
    )) as Array<{ exists: boolean }>;
    if (!schema?.exists) return;

    await runner.query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(input.workspaceId),
    ]);
    const [inbound] = (await runner.query(
      `SELECT "receivedAt" FROM "message" WHERE id=$1 AND "messageThreadId"=$2 AND "deletedAt" IS NULL`,
      [input.inboundEvidenceId, input.inboundMessageThreadId],
    )) as Array<{ receivedAt: Date }>;
    if (!inbound?.receivedAt) return;
    const receipts = (await runner.query(
      `SELECT s.id, s."creatorId", s."providerHeaderMessageId", s."sendStartedAt"
         FROM core."myahComposeEmailSend" s
        WHERE s."workspaceId"=$1 AND s."messageChannelId"=$2
          AND s."resolvedThreadExternalId"=$3 AND $4=ANY(s."normalizedTo")
        ORDER BY s."sendStartedAt", s.id`,
      [
        input.workspaceId,
        input.messageChannelId,
        input.threadExternalId.trim(),
        from,
      ],
    )) as Array<{
      id: string;
      creatorId: string | null;
      providerHeaderMessageId: string;
      sendStartedAt: Date;
    }>;
    if (receipts.length === 0) return;

    const tokens = new Set(
      (input.inReplyToTokens ?? [])
        .map((token) => token.trim())
        .filter(Boolean),
    );
    const parents = receipts.filter(({ providerHeaderMessageId }) =>
      tokens.has(providerHeaderMessageId.trim()),
    );
    const exact = parents.length === 1 ? parents[0] : null;
    const eligibleThreadReceipts = receipts.filter(
      ({ sendStartedAt }) =>
        new Date(inbound.receivedAt).getTime() >=
        new Date(sendStartedAt).getTime(),
    );
    if (!exact && eligibleThreadReceipts.length === 0) return;
    const sharedCreator = eligibleThreadReceipts[0]?.creatorId;
    const creatorId = exact
      ? exact.creatorId
      : sharedCreator &&
          eligibleThreadReceipts.every(
            ({ creatorId }) => creatorId === sharedCreator,
          )
        ? sharedCreator
        : null;
    const classification = exact ? 'EXACT' : 'THREAD';
    const sendId = exact?.id ?? null;

    await runner.query(
      `INSERT INTO core."myahComposeReplyEvidence" (
         "workspaceId", "inboundMessageId", "messageChannelId", "creatorId", "classification", "composeSendId"
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("workspaceId", "inboundMessageId") DO UPDATE SET
         "classification"='EXACT', "composeSendId"=EXCLUDED."composeSendId"
       WHERE "myahComposeReplyEvidence"."messageChannelId"=EXCLUDED."messageChannelId"
         AND "myahComposeReplyEvidence"."classification"='THREAD'
         AND EXCLUDED."classification"='EXACT'`,
      [
        input.workspaceId,
        input.inboundEvidenceId,
        input.messageChannelId,
        creatorId,
        classification,
        sendId,
      ],
    );
    if (!input.coveredCreatorIds) return;
    const [triage] = (await runner.query(
      'SELECT to_regclass($1) IS NOT NULL AS "ready"',
      [
        `${getWorkspaceSchemaName(input.workspaceId)}."myahInboxTriageMigration"`,
      ],
    )) as Array<{ ready: boolean }>;
    if (!triage?.ready) return;
    const [evidence] = (await runner.query(
      `SELECT CASE WHEN ev."classification"='EXACT' THEN s."creatorId"
                   ELSE ev."creatorId" END AS "creatorId"
         FROM core."myahComposeReplyEvidence" ev
         LEFT JOIN core."myahComposeEmailSend" s
           ON s."workspaceId"=ev."workspaceId" AND s.id=ev."composeSendId"
        WHERE ev."workspaceId"=$1 AND ev."inboundMessageId"=$2
          AND ev."messageChannelId"=$3 FOR UPDATE OF ev`,
      [input.workspaceId, input.inboundEvidenceId, input.messageChannelId],
    )) as Array<{ creatorId: string | null }>;
    // A receipt may commit after preparation. Keep the evidence, but do not
    // bind under a Creator lock that this import did not cover.
    if (
      !evidence?.creatorId ||
      !input.coveredCreatorIds.includes(evidence.creatorId)
    )
      return;
    const campaignBlocked = async () => {
      const [status] = (await runner.query(
        `SELECT (EXISTS (SELECT 1 FROM core."myahCampaignReplyEvidence" ev
           WHERE ev."workspaceId"=$1 AND ev."inboundMessageId"=$2)
          OR EXISTS (SELECT 1 FROM core."myahCampaignReplyPending" p
           WHERE p."workspaceId"=$1 AND p."messageId"=$2)) AS "blocked"`,
        [input.workspaceId, input.inboundEvidenceId],
      )) as Array<{ blocked: boolean }>;

      return status?.blocked === true;
    };
    if (await campaignBlocked()) return;

    await this.lifecycle.withPreparedSourceMutationInTransaction({
      workspaceId: input.workspaceId,
      sourceType: 'EMAIL_THREAD',
      sourceRecordIds: [input.inboundMessageThreadId],
      nextCreatorIds: [evidence.creatorId],
      coveredCreatorIds: input.coveredCreatorIds,
      manager,
      mutate: async () => {
        if (await campaignBlocked()) return;
        await runner.query(
          'UPDATE "messageThread" SET "creatorId"=$1 WHERE id=$2 AND "creatorId" IS NULL',
          [evidence.creatorId, input.inboundMessageThreadId],
        );
      },
    });
  }

  async bindThreadCreator(
    workspaceId: string,
    threadId: string,
    creatorId: string,
  ): Promise<void> {
    await this.orm.executeInWorkspaceContext(
      async () => {
        const dataSource = await this.orm.getGlobalWorkspaceDataSource();

        await dataSource.transaction(async (manager) => {
          const query = manager.queryRunner!.query.bind(manager.queryRunner);
          const [triage] = (await query(
            'SELECT to_regclass($1) IS NOT NULL AS "ready"',
            [
              `${getWorkspaceSchemaName(workspaceId)}."myahInboxTriageMigration"`,
            ],
          )) as Array<{ ready: boolean }>;
          if (!triage?.ready) return;

          await this.lifecycle.withPreparedSourceMutationInTransaction({
            workspaceId,
            sourceType: 'EMAIL_THREAD',
            sourceRecordIds: [threadId],
            nextCreatorIds: [creatorId],
            manager: manager as WorkspaceEntityManager,
            mutate: async () => {
              await query(
                'UPDATE "messageThread" SET "creatorId"=$1 WHERE id=$2 AND "creatorId" IS NULL',
                [creatorId, threadId],
              );
            },
          });
        });
      },
      buildSystemAuthContext({ workspace: { id: workspaceId } as never }),
    );
  }

  async recordAcceptedSend(input: AcceptedSend): Promise<string | null> {
    const to = [
      ...new Set(
        input.to
          .map(normalizeCampaignCreatorEmail)
          .filter((email): email is string => email !== null),
      ),
    ];

    if (
      !input.providerHeaderMessageId.trim() ||
      !input.resolvedThreadExternalId.trim() ||
      to.length === 0
    ) {
      this.logger.error(
        `Compose receipt invalid after provider acceptance (workspace=${input.workspaceId}, channel=${input.messageChannelId})`,
      );
      throw new Error('Compose send receipt is incomplete');
    }

    try {
      return await this.orm.executeInWorkspaceContext(async () => {
        const dataSource = await this.orm.getGlobalWorkspaceDataSource();

        return dataSource.transaction(async (manager) => {
          const query = manager.queryRunner!.query.bind(manager.queryRunner);
          const [channel] = (await query(
            `SELECT handle, type FROM core."messageChannel"
             WHERE id=$1 AND "workspaceId"=$2 AND "connectedAccountId"=$3`,
            [
              input.messageChannelId,
              input.workspaceId,
              input.connectedAccountId,
            ],
          )) as Array<{ handle: string; type: MessageChannelType }>;
          const sender = normalizeCampaignCreatorEmail(
            channel?.type === MessageChannelType.EMAIL_GROUP
              ? input.connectedAccountHandle
              : channel?.handle,
          );
          if (
            !sender ||
            !channel ||
            ![
              MessageChannelType.EMAIL,
              MessageChannelType.EMAIL_GROUP,
            ].includes(channel.type)
          ) {
            throw new Error('Compose send channel is unavailable');
          }
          const result = (await query(
            `INSERT INTO core."myahComposeEmailSend" (
              "workspaceId", "messageChannelId", "connectedAccountId", "userWorkspaceId",
              "normalizedSender", "providerHeaderMessageId", "providerMessageExternalId",
              "resolvedThreadExternalId", "normalizedTo", "creatorId", "sendStartedAt"
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT ("workspaceId", "messageChannelId", "providerHeaderMessageId") DO NOTHING
            RETURNING id`,
            [
              input.workspaceId,
              input.messageChannelId,
              input.connectedAccountId,
              input.userWorkspaceId,
              sender,
              input.providerHeaderMessageId.trim(),
              input.providerMessageExternalId ?? null,
              input.resolvedThreadExternalId.trim(),
              to,
              input.creatorId ?? null,
              input.sendStartedAt,
            ],
          )) as Array<{ id: string }>;

          return result[0]?.id ?? null;
        });
      }, input.authContext);
    } catch (error) {
      this.logger.error(
        `Compose receipt write failed (workspace=${input.workspaceId}, channel=${input.messageChannelId}, error=${error instanceof Error ? error.constructor.name : 'unknown'})`,
      );
      throw error;
    }
  }
}
