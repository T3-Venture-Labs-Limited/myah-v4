import { randomUUID } from 'node:crypto';

import { CampaignOutreachAudienceReviewService } from 'src/modules/campaign-execution/services/campaign-outreach-audience-review.service';

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Campaign outreach audience Start snapshot (PostgreSQL)', () => {
  it('blocks concurrent Creator email and membership stage mutation until activation persistence commits', async () => {
    const workspaceId = randomUUID();
    const campaignId = randomUUID();
    const campaignCreatorId = randomUUID();
    const creatorId = randomUUID();
    const schemaName = `audience_snapshot_${randomUUID().replace(/-/g, '')}`;

    await global.testDataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await global.testDataSource.query(`
      CREATE TABLE "${schemaName}".creator (
        id uuid PRIMARY KEY,
        name text,
        email text,
        "deletedAt" timestamptz
      );
      CREATE TABLE "${schemaName}"."campaignCreator" (
        id uuid PRIMARY KEY,
        "campaignId" uuid NOT NULL,
        "creatorId" uuid,
        stage text,
        "selectedContactMethod" text,
        "deletedAt" timestamptz
      );
      CREATE TABLE "${schemaName}".enrollment_evidence (
        "campaignCreatorId" uuid PRIMARY KEY,
        "creatorId" uuid NOT NULL
      );
      CREATE TABLE IF NOT EXISTS core."messageSuppression" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "emailAddress" varchar NOT NULL,
        reason text NOT NULL,
        "unsubscribeTopicId" uuid
      );
    `);
    await global.testDataSource.query(
      `INSERT INTO "${schemaName}".creator (id, name, email, "deletedAt")
       VALUES ($1, 'Snapshot Creator', 'snapshot@example.test', NULL)`,
      [creatorId],
    );
    await global.testDataSource.query(
      `INSERT INTO "${schemaName}"."campaignCreator"
         (id, "campaignId", "creatorId", stage, "selectedContactMethod", "deletedAt")
       VALUES ($1, $2, $3, 'READY', 'EMAIL', NULL)`,
      [campaignCreatorId, campaignId, creatorId],
    );

    const ambientSuppressionRead = jest.fn();
    const getRepository = jest.fn(
      async (_requestedWorkspaceId: string, objectName: string) => ({
        find: async (_options: unknown, manager: any) =>
          objectName === 'campaignCreator'
            ? manager.queryRunner.query(
                `SELECT id, "campaignId", "creatorId", stage, "selectedContactMethod", "deletedAt"
                   FROM "${schemaName}"."campaignCreator"
                  WHERE "campaignId" = $1 AND "deletedAt" IS NULL
                  ORDER BY id`,
                [campaignId],
              )
            : manager.queryRunner.query(
                `SELECT id, name, email, "deletedAt"
                   FROM "${schemaName}".creator
                  WHERE id = $1 AND "deletedAt" IS NULL`,
                [creatorId],
              ),
      }),
    );
    const service = new CampaignOutreachAudienceReviewService(
      { getRepository } as never,
      { getSuppressedAddresses: ambientSuppressionRead } as never,
    );
    const startRunner = global.testDataSource.createQueryRunner();
    const mutationRunner = global.testDataSource.createQueryRunner();
    await Promise.all([startRunner.connect(), mutationRunner.connect()]);
    await startRunner.startTransaction();

    try {
      const review = await service.reviewInTransaction({
        workspaceId,
        campaignId,
        schemaName,
        manager: startRunner.manager as never,
        rolePermissionConfig: { intersectionOf: ['actor-role'] },
      });
      expect(review.eligible).toEqual([
        expect.objectContaining({ campaignCreatorId, creatorId }),
      ]);
      await startRunner.query(
        `INSERT INTO "${schemaName}".enrollment_evidence
           ("campaignCreatorId", "creatorId") VALUES ($1, $2)`,
        [campaignCreatorId, creatorId],
      );

      let mutationSettled = false;
      const mutation = (async () => {
        await mutationRunner.startTransaction();
        await mutationRunner.query(
          `UPDATE "${schemaName}".creator
              SET email = 'changed@example.test' WHERE id = $1`,
          [creatorId],
        );
        await mutationRunner.query(
          `UPDATE "${schemaName}"."campaignCreator"
              SET stage = 'POSTED' WHERE id = $1`,
          [campaignCreatorId],
        );
        await mutationRunner.commitTransaction();
        mutationSettled = true;
      })();

      await wait(150);
      expect(mutationSettled).toBe(false);
      await startRunner.commitTransaction();
      await mutation;

      const [evidence] = await global.testDataSource.query(
        `SELECT e."campaignCreatorId", e."creatorId", cc.stage, creator.email
           FROM "${schemaName}".enrollment_evidence e
           JOIN "${schemaName}"."campaignCreator" cc
             ON cc.id = e."campaignCreatorId"
           JOIN "${schemaName}".creator creator ON creator.id = e."creatorId"`,
      );
      expect(evidence).toEqual({
        campaignCreatorId,
        creatorId,
        stage: 'POSTED',
        email: 'changed@example.test',
      });
      expect(ambientSuppressionRead).not.toHaveBeenCalled();
    } finally {
      if (startRunner.isTransactionActive)
        await startRunner.rollbackTransaction();
      if (mutationRunner.isTransactionActive)
        await mutationRunner.rollbackTransaction();
      await Promise.all([startRunner.release(), mutationRunner.release()]);
    }
  });
});
