import { Injectable } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

export const CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT =
  'CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT' as const;

export class CampaignMailboxDeletionFenceError extends Error {
  readonly code = CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT;
}

const requireActiveRunner = (manager: EntityManager): QueryRunner => {
  const runner = manager.queryRunner;
  if (
    !runner?.isTransactionActive ||
    runner.isReleased ||
    runner.manager !== manager
  )
    throw new Error(
      'Campaign mailbox deletion fence requires the supplied active manager',
    );
  return runner;
};

const advisoryLock = (runner: QueryRunner, key: string) =>
  runner.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [key]);

export const campaignMailboxAdvisoryKeys = (input: {
  workspaceId: string;
  connectedAccountId: string;
  messageChannelIds: readonly string[];
}): string[] => [
  `campaign-mailbox:workspace:${input.workspaceId}`,
  `campaign-mailbox:account:${input.connectedAccountId}`,
  ...[...new Set(input.messageChannelIds)]
    .sort()
    .map((id) => `campaign-mailbox:channel:${id}`),
];

@Injectable()
export class CampaignMailboxDeletionFenceService {
  async assertDeletionAllowedInTransaction(
    input: {
      workspaceId: string;
      connectedAccountId: string;
      messageChannelIds?: readonly string[];
    },
    manager: EntityManager,
  ): Promise<readonly string[]> {
    const runner = requireActiveRunner(manager);
    const workspace = await runner.query(
      `SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`,
      [input.workspaceId],
    );
    if (!Array.isArray(workspace) || workspace.length !== 1)
      throw new CampaignMailboxDeletionFenceError();

    await advisoryLock(
      runner,
      `campaign-mailbox:workspace:${input.workspaceId}`,
    );
    await advisoryLock(
      runner,
      `campaign-mailbox:account:${input.connectedAccountId}`,
    );
    const accounts = await runner.query(
      `SELECT id FROM core."connectedAccount" WHERE id=$1 AND "workspaceId"=$2 FOR UPDATE`,
      [input.connectedAccountId, input.workspaceId],
    );
    if (!Array.isArray(accounts) || accounts.length !== 1)
      throw new CampaignMailboxDeletionFenceError();

    const messageChannelIds = input.messageChannelIds
      ? [...new Set(input.messageChannelIds)].sort()
      : (
          (await runner.query(
            `SELECT id FROM core."messageChannel" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2 ORDER BY id`,
            [input.workspaceId, input.connectedAccountId],
          )) as Array<{ id: string }>
        ).map(({ id }) => id);
    for (const messageChannelId of messageChannelIds) {
      await advisoryLock(
        runner,
        `campaign-mailbox:channel:${messageChannelId}`,
      );
    }
    if (messageChannelIds.length > 0) {
      const channels = await runner.query(
        `SELECT id FROM core."messageChannel" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2
          AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE`,
        [input.workspaceId, input.connectedAccountId, messageChannelIds],
      );
      if (
        !Array.isArray(channels) ||
        channels.length !== messageChannelIds.length
      )
        throw new CampaignMailboxDeletionFenceError();
    }
    const blocked = await runner.query(
      `SELECT "attemptId" FROM core."outboundEmailAttempt"
        WHERE "workspaceId"=$1
          AND ("connectedAccountId"=$2 OR "messageChannelId"=ANY($3::uuid[]))
          AND ("attemptState" IN ('PROCESSING','UNKNOWN')
            OR ("attemptState"='ACCEPTED' AND
              ("projectedMessageId" IS NULL OR "projectedMessageThreadId" IS NULL)))
        ORDER BY "attemptId" FOR UPDATE`,
      [input.workspaceId, input.connectedAccountId, messageChannelIds],
    );
    if (!Array.isArray(blocked) || blocked.length > 0)
      throw new CampaignMailboxDeletionFenceError();

    return messageChannelIds;
  }
}
