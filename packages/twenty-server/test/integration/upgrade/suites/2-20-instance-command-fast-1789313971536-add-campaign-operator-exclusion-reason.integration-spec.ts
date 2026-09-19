import { randomUUID } from 'node:crypto';

import { type QueryRunner } from 'typeorm';

import { AddCampaignOperatorExclusionReasonFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789313971536-add-campaign-operator-exclusion-reason';

describe('2.20 fast command 1789313971536 (postgres)', () => {
  let runner: QueryRunner;

  beforeAll(async () => {
    runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(
      'ALTER SCHEMA core RENAME TO core_campaign_exclusion_original',
    );
    await runner.query('CREATE SCHEMA core');
    await runner.query(`CREATE TABLE core."campaignOccurrence" (
      id uuid PRIMARY KEY, state text NOT NULL, "holdReason" text,
      "terminalReason" text, "terminalAt" timestamptz,
      CONSTRAINT "CHK_CO_TERMINAL_SHAPE" CHECK (true)
    )`);
    await runner.query(`CREATE TABLE core."campaignEnrollment" (
      id uuid PRIMARY KEY, state text NOT NULL, "authoredMessageCount" integer NOT NULL,
      "nextAuthoredMessageIndex" integer NOT NULL, "holdReason" text,
      "terminalReason" text, "terminalAt" timestamptz,
      CONSTRAINT "CHK_CEN_TERMINAL_SHAPE" CHECK (true)
    )`);
  });

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  it('accepts only shape-valid retained operator exclusion evidence and keeps down fail-closed', async () => {
    const command = new AddCampaignOperatorExclusionReasonFastInstanceCommand();
    await command.up(runner);
    const occurrenceId = randomUUID();
    const enrollmentId = randomUUID();

    await runner.query(
      `INSERT INTO core."campaignOccurrence"
        (id,state,"holdReason","terminalReason","terminalAt")
       VALUES ($1,'CANCELLED',NULL,'OPERATOR_EXCLUDED',now())`,
      [occurrenceId],
    );
    await runner.query(
      `INSERT INTO core."campaignEnrollment"
        (id,state,"authoredMessageCount","nextAuthoredMessageIndex","holdReason","terminalReason","terminalAt")
       VALUES ($1,'EXCLUDED',1,0,NULL,'OPERATOR_EXCLUDED',now())`,
      [enrollmentId],
    );
    await runner.query('SAVEPOINT invalid_active_exclusion');
    await expect(
      runner.query(
        `INSERT INTO core."campaignEnrollment"
          (id,state,"authoredMessageCount","nextAuthoredMessageIndex","holdReason","terminalReason","terminalAt")
         VALUES ($1,'ACTIVE',1,0,NULL,'OPERATOR_EXCLUDED',now())`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
    await runner.query('ROLLBACK TO SAVEPOINT invalid_active_exclusion');
    await expect(command.down(runner)).rejects.toThrow(
      'Cannot remove retained operator exclusion evidence',
    );

    await runner.query('DELETE FROM core."campaignOccurrence"');
    await runner.query('DELETE FROM core."campaignEnrollment"');
    await command.down(runner);
    await runner.query('SAVEPOINT invalid_down_exclusion');
    await expect(
      runner.query(
        `INSERT INTO core."campaignOccurrence"
          (id,state,"holdReason","terminalReason","terminalAt")
         VALUES ($1,'CANCELLED',NULL,'OPERATOR_EXCLUDED',now())`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
    await runner.query('ROLLBACK TO SAVEPOINT invalid_down_exclusion');
  });
});
