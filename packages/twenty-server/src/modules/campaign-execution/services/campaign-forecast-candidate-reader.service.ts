import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

const rows = <T>(value: unknown): T[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as T[])
    : Array.isArray(value)
      ? (value as T[])
      : [];

type ForecastCursor = { dueAt: Date; occurrenceId: string };

type ForecastCandidateRow = {
  authoredMessageIndex: number;
  campaignId: string;
  dueAt: Date;
  endLocalTime: string;
  occurrenceId: string;
  pinnedConnectedAccountId: string | null;
  startLocalTime: string;
  timeZone: string;
  workflowVersionId: string;
};

@Injectable()
export class CampaignForecastCandidateReaderService {
  async readPage(
    input: {
      cursor: ForecastCursor | null;
      horizonEndsAt: Date;
      limit: number;
      workspaceId: string;
    },
    manager: EntityManager,
  ) {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 500
    ) {
      throw new Error('Campaign forecast page limit must be between 1 and 500');
    }

    const queryRunner = manager.queryRunner;

    if (queryRunner === undefined || queryRunner.isReleased) {
      throw new Error(
        'Campaign forecast reader requires an active query runner',
      );
    }

    const result = rows<ForecastCandidateRow>(
      await queryRunner.query(
        `SELECT o.id AS "occurrenceId",o."campaignId",o."dueAt",o."workflowVersionId",o."authoredMessageIndex",
              execution."timeZone",execution."startLocalTime",execution."endLocalTime",
              prior."connectedAccountId" AS "pinnedConnectedAccountId"
         FROM core."campaignOccurrence" o
         JOIN core."campaignExecution" execution
           ON execution."workspaceId"=o."workspaceId" AND execution."campaignId"=o."campaignId"
         LEFT JOIN LATERAL (
           SELECT a."connectedAccountId"
             FROM core."outboundEmailAttempt" a
             JOIN core."campaignOccurrence" previous ON previous.id=a."occurrenceId"
            WHERE a."workspaceId"=o."workspaceId" AND a."campaignId"=o."campaignId"
              AND a."enrollmentId"=o."enrollmentId" AND a."attemptState"='ACCEPTED'
              AND previous."authoredMessageIndex" < o."authoredMessageIndex"
            ORDER BY previous."authoredMessageIndex" DESC,a."attemptNumber" DESC LIMIT 1
         ) prior ON TRUE
        WHERE o."workspaceId"=$1 AND o.state='PENDING'
          AND o."dueAt" < $2
          AND ($3::timestamptz IS NULL OR (o."dueAt",o.id) > ($3::timestamptz,$4::uuid))
        ORDER BY o."dueAt",o.id LIMIT $5`,
        [
          input.workspaceId,
          input.horizonEndsAt,
          input.cursor?.dueAt ?? null,
          input.cursor?.occurrenceId ?? null,
          input.limit + 1,
        ],
      ),
    );
    const page = result.slice(0, input.limit);
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        authoredMessageIndex: row.authoredMessageIndex,
        campaignId: row.campaignId,
        dueAt: row.dueAt,
        occurrenceId: row.occurrenceId,
        pinnedConnectedAccountId: row.pinnedConnectedAccountId,
        window: {
          endLocalTime: row.endLocalTime,
          startLocalTime: row.startLocalTime,
          timeZone: row.timeZone,
        },
        workflowVersionId: row.workflowVersionId,
      })),
      nextCursor:
        result.length > input.limit && last !== undefined
          ? { dueAt: last.dueAt, occurrenceId: last.occurrenceId }
          : null,
    };
  }
}
