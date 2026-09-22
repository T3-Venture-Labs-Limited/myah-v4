import { randomUUID } from 'node:crypto';
import { type QueryRunner } from 'typeorm';

import { CreateCampaignForecastProjectionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172618-create-campaign-forecast-projection';
import { AddConnectedAccountSendingPolicyRevisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172619-add-connected-account-sending-policy-revision';
import { CampaignForecastProjectionService } from 'src/modules/campaign-execution/services/campaign-forecast-projection.service';

describe('2.20 Campaign forecast projection commands (postgres)', () => {
  let runner: QueryRunner;

  beforeAll(async () => {
    runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(
      'ALTER SCHEMA core RENAME TO core_campaign_forecast_original',
    );
    await runner.query('CREATE SCHEMA core');
    await runner.query(`CREATE TABLE core."campaignOccurrence" (
      id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL,
      state text NOT NULL, "dueAt" timestamptz NOT NULL
    )`);
    await runner.query(`CREATE TABLE core."connectedAccount" (
      id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL,
      "dailySendLimit" integer NOT NULL DEFAULT 50,
      "minimumSendIntervalMs" integer NOT NULL DEFAULT 300000
    )`);
  });

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  it('publishes one revision-locked generation and installs policy revision columns', async () => {
    const forecastCommand =
      new CreateCampaignForecastProjectionFastInstanceCommand();
    const policyCommand =
      new AddConnectedAccountSendingPolicyRevisionFastInstanceCommand();
    await forecastCommand.up(runner);
    await policyCommand.up(runner);
    const workspaceId = randomUUID();
    const campaignId = randomUUID();
    const occurrenceId = randomUUID();
    const generationId = randomUUID();
    const accountId = randomUUID();
    await runner.query(
      `INSERT INTO core."campaignOccurrence" (id,"workspaceId","campaignId",state,"dueAt") VALUES ($1,$2,$3,'PENDING',now())`,
      [occurrenceId, workspaceId, campaignId],
    );
    await runner.query(
      `INSERT INTO core."connectedAccount" (id,"workspaceId") VALUES ($1,$2)`,
      [accountId, workspaceId],
    );
    await runner.query(
      `INSERT INTO core."campaignForecastHead" ("workspaceId","scopeKey","inputRevision") VALUES ($1,$2,1)`,
      [workspaceId, `workspace:${workspaceId}`],
    );

    const service = new CampaignForecastProjectionService();
    await expect(
      service.publish(
        {
          complete: true,
          entries: [
            {
              campaignId,
              connectedAccountId: accountId,
              estimatedSendAt: new Date('2026-11-01T10:00:00.123Z'),
              occurrenceId,
            },
          ],
          evaluatedCount: 1,
          expectedInputRevision: 1,
          generatedAt: new Date('2026-11-01T09:00:00.123Z'),
          generationId,
          horizonEndsAt: new Date('2026-11-03T09:00:00.123Z'),
          scopeKey: `workspace:${workspaceId}`,
          workspaceId,
        },
        runner.manager,
      ),
    ).resolves.toEqual({ generationId, status: 'PUBLISHED' });
    await expect(
      runner.query(
        `SELECT "estimatedSendAt" FROM core."campaignForecastEntry" WHERE "generationId"=$1`,
        [generationId],
      ),
    ).resolves.toEqual([
      { estimatedSendAt: new Date('2026-11-01T10:00:00.123Z') },
    ]);
    await expect(
      runner.query(
        `SELECT "sendingPolicyRevision","sendingPolicyIdempotencyKey" FROM core."connectedAccount" WHERE id=$1`,
        [accountId],
      ),
    ).resolves.toEqual([
      { sendingPolicyRevision: 1, sendingPolicyIdempotencyKey: null },
    ]);
  });
});
