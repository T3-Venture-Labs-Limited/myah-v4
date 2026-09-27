import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

const rows = <T>(value: unknown): T[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as T[])
    : Array.isArray(value)
      ? (value as T[])
      : [];

type ProjectionEntry = {
  campaignId: string;
  connectedAccountId: string | null;
  estimatedSendAt: Date | null;
  occurrenceId: string;
};

type PublishInput = {
  complete: boolean;
  entries: ProjectionEntry[];
  evaluatedCount: number;
  expectedInputRevision: number;
  generatedAt: Date;
  generationId: string;
  horizonEndsAt: Date;
  scopeKey: string;
  workspaceId: string;
};

type ProjectionHeadRow = {
  currentGenerationId: string | null;
  currentGeneratedAt: Date | null;
  inputRevision: string;
};

@Injectable()
export class CampaignForecastProjectionService {
  async publish(input: PublishInput, manager: EntityManager) {
    const queryRunner = manager.queryRunner;

    if (
      queryRunner === undefined ||
      queryRunner.isReleased ||
      !queryRunner.isTransactionActive
    ) {
      throw new Error('Campaign forecast publication requires a transaction');
    }

    const heads = rows<ProjectionHeadRow>(
      await queryRunner.query(
        `SELECT head."inputRevision",head."currentGenerationId",
                generation."generatedAt" AS "currentGeneratedAt"
           FROM core."campaignForecastHead" head
           LEFT JOIN core."campaignForecastGeneration" generation
             ON generation.id=head."currentGenerationId"
          WHERE head."workspaceId"=$1 AND head."scopeKey"=$2 FOR UPDATE OF head`,
        [input.workspaceId, input.scopeKey],
      ),
    );
    const head = heads[0];

    if (
      head === undefined ||
      heads.length !== 1 ||
      Number(head.inputRevision) !== input.expectedInputRevision ||
      (head.currentGenerationId !== null &&
        (head.currentGeneratedAt === null ||
          input.generatedAt.getTime() <
            new Date(head.currentGeneratedAt).getTime() ||
          (input.generatedAt.getTime() ===
            new Date(head.currentGeneratedAt).getTime() &&
            input.generationId <= head.currentGenerationId)))
    ) {
      return { status: 'STALE_INPUT' as const };
    }

    await queryRunner.query(
      `INSERT INTO core."campaignForecastGeneration"
        (id,"workspaceId","scopeKey","inputRevision","generatedAt","horizonEndsAt","complete","evaluatedCount")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.generationId,
        input.workspaceId,
        input.scopeKey,
        input.expectedInputRevision,
        input.generatedAt,
        input.horizonEndsAt,
        input.complete,
        input.evaluatedCount,
      ],
    );

    if (input.entries.length > 0) {
      await queryRunner.query(
        `INSERT INTO core."campaignForecastEntry"
          ("generationId","workspaceId","occurrenceId","campaignId","connectedAccountId","estimatedSendAt")
         SELECT $1,$2,entry.*
           FROM unnest($3::uuid[],$4::uuid[],$5::uuid[],$6::timestamptz[])
             AS entry("occurrenceId","campaignId","connectedAccountId","estimatedSendAt")`,
        [
          input.generationId,
          input.workspaceId,
          input.entries.map(({ occurrenceId }) => occurrenceId),
          input.entries.map(({ campaignId }) => campaignId),
          input.entries.map(({ connectedAccountId }) => connectedAccountId),
          input.entries.map(({ estimatedSendAt }) => estimatedSendAt),
        ],
      );
    }

    const published = rows<{ currentGenerationId: string }>(
      await queryRunner.query(
        `UPDATE core."campaignForecastHead"
            SET "currentGenerationId"=$4,"updatedAt"=clock_timestamp()
          WHERE "workspaceId"=$1 AND "scopeKey"=$2 AND "inputRevision"=$3
          RETURNING "currentGenerationId"`,
        [
          input.workspaceId,
          input.scopeKey,
          input.expectedInputRevision,
          input.generationId,
        ],
      ),
    );

    if (published.length !== 1) return { status: 'STALE_INPUT' as const };

    await queryRunner.query(
      `DELETE FROM core."campaignForecastGeneration"
        WHERE id IN (
          SELECT id FROM core."campaignForecastGeneration"
           WHERE "workspaceId"=$1 AND "scopeKey"=$2
             AND id <> (SELECT "currentGenerationId" FROM core."campaignForecastHead"
                         WHERE "workspaceId"=$1 AND "scopeKey"=$2)
           ORDER BY "generatedAt" DESC,id DESC OFFSET 1
        )`,
      [input.workspaceId, input.scopeKey],
    );

    return {
      generationId: input.generationId,
      status: 'PUBLISHED' as const,
    };
  }
}
