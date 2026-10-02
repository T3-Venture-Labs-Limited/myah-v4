import { Injectable } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

const workspaceScopeKey = (workspaceId: string) => `workspace:${workspaceId}`;

@Injectable()
export class CampaignForecastInputInvalidationService {
  async invalidateInTransaction(
    input: { workspaceId: string },
    manager: EntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner;
    if (
      runner === undefined ||
      runner.isReleased ||
      !runner.isTransactionActive
    )
      throw new Error('Campaign forecast invalidation requires a transaction');

    await this.invalidateWithRunner(input, runner);
  }

  async invalidateWithRunner(
    input: { workspaceId: string },
    runner: QueryRunner,
  ): Promise<void> {
    if (!runner.isTransactionActive || runner.isReleased)
      throw new Error('Campaign forecast invalidation requires a transaction');

    await runner.query(
      `INSERT INTO core."campaignForecastHead" ("workspaceId","scopeKey","inputRevision")
       VALUES ($1,$2,1)
       ON CONFLICT ("workspaceId","scopeKey") DO UPDATE
         SET "inputRevision"=core."campaignForecastHead"."inputRevision"+1,
             "updatedAt"=clock_timestamp()`,
      [input.workspaceId, workspaceScopeKey(input.workspaceId)],
    );
  }
}
