import { randomUUID } from 'node:crypto';

import { type QueryRunner } from 'typeorm';

import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  campaignTimelineBusinessEventId,
  campaignTimelineProjectionId,
} from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

describe('2.20 workspace command 1789313971536 retained facts (postgres)', () => {
  let runner: QueryRunner;
  const ids = Array.from({ length: 16 }, () => randomUUID());
  const [
    workspaceId,
    campaignId,
    activationId,
    enrollmentId,
    occurrenceId,
    campaignCreatorId,
    creatorId,
    attemptId,
    messageId,
    threadId,
    workspaceMemberId,
    finishedEnrollmentId,
    finishedCreatorId,
    eligibilityEnrollmentId,
    eligibilityCreatorId,
  ] = ids;
  const schemaName = getWorkspaceSchemaName(workspaceId);

  beforeAll(async () => {
    runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(
      'ALTER SCHEMA core RENAME TO core_campaign_activity_original',
    );
    await runner.query('CREATE SCHEMA core');
    await runner.query(`CREATE SCHEMA "${schemaName}"`);
    await runner.query(`CREATE TABLE core."campaignActivation" (
      id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL,
      "activatedAt" timestamptz NOT NULL
    )`);
    await runner.query(`CREATE TABLE core."campaignEnrollment" (
      id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL,
      "campaignCreatorId" uuid NOT NULL, "creatorId" uuid NOT NULL, "enrolledAt" timestamptz NOT NULL,
      state text NOT NULL, "terminalReason" text, "terminalAt" timestamptz
    )`);
    await runner.query(`CREATE TABLE core."campaignOccurrence" (
      id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL,
      "enrollmentId" uuid NOT NULL, state text NOT NULL, "createdAt" timestamptz NOT NULL,
      "terminalReason" text, "terminalAt" timestamptz
    )`);
    await runner.query(`CREATE TABLE core."outboundEmailAttempt" (
      "attemptId" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, source text NOT NULL,
      "attemptState" text NOT NULL, "campaignId" uuid NOT NULL, "enrollmentId" uuid NOT NULL,
      "providerAcceptedAt" timestamptz, "projectedMessageId" uuid, "projectedMessageThreadId" uuid
    )`);
    await runner.query(`CREATE TABLE "${schemaName}"."campaignCreator" (
      id uuid PRIMARY KEY, "campaignId" uuid NOT NULL, "creatorId" uuid NOT NULL,
      "excludedAt" timestamptz, "exclusionReason" text,
      "excludedByWorkspaceMemberId" uuid, "deletedAt" timestamptz
    )`);
    await runner.query(`CREATE TABLE "${schemaName}"."timelineActivity" (
      id uuid PRIMARY KEY, name text NOT NULL, "happensAt" timestamptz NOT NULL,
      properties jsonb NOT NULL, "workspaceMemberId" uuid,
      "targetCampaignId" uuid, "targetCreatorId" uuid
    )`);
    await runner.query(
      `INSERT INTO core."campaignActivation" VALUES ($1,$2,$3,'2026-09-16T09:00:00Z')`,
      [activationId, workspaceId, campaignId],
    );
    await runner.query(
      `INSERT INTO core."campaignEnrollment"
        (id,"workspaceId","campaignId","campaignCreatorId","creatorId","enrolledAt",state,"terminalReason","terminalAt") VALUES
        ($1,$2,$3,$4,$5,'2026-09-16T09:01:00Z','EXCLUDED','OPERATOR_EXCLUDED','2026-09-16T09:05:00.123456Z'),
        ($6,$2,$3,$4,$7,'2026-09-16T09:01:10Z','FINISHED','SEQUENCE_COMPLETED','2026-09-16T09:06:00.654321Z'),
        ($8,$2,$3,$4,$9,'2026-09-16T09:01:20Z','EXCLUDED','INVALID_EMAIL','2026-09-16T09:07:00.987654Z')`,
      [
        enrollmentId,
        workspaceId,
        campaignId,
        campaignCreatorId,
        creatorId,
        finishedEnrollmentId,
        finishedCreatorId,
        eligibilityEnrollmentId,
        eligibilityCreatorId,
      ],
    );
    await runner.query(
      `INSERT INTO core."campaignOccurrence" VALUES ($1,$2,$3,$4,'CANCELLED','2026-09-16T09:02:00Z','OPERATOR_EXCLUDED','2026-09-16T09:05:00.123456Z')`,
      [occurrenceId, workspaceId, campaignId, enrollmentId],
    );
    await runner.query(
      `INSERT INTO core."outboundEmailAttempt" VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED',$3,$4,'2026-09-16T09:03:00Z',$5,$6)`,
      [attemptId, workspaceId, campaignId, enrollmentId, messageId, threadId],
    );
    await runner.query(
      `INSERT INTO "${schemaName}"."campaignCreator" VALUES ($1,$2,$3,'2026-09-16T09:04:00Z','Not a fit',$4,NULL)`,
      [campaignCreatorId, campaignId, creatorId, workspaceMemberId],
    );

    const terminalAt = '2026-09-16T09:05:00.123Z';
    const businessEventId = campaignTimelineBusinessEventId(
      `terminal:occurrence:${occurrenceId}:${terminalAt}:OPERATOR_EXCLUDED`,
    );
    const properties = JSON.stringify({
      campaignEvent: {
        version: 1,
        businessEventId,
        campaignId,
        eventKind: 'TERMINAL',
        sourceType: 'OCCURRENCE',
        sourceId: occurrenceId,
        reason: 'OPERATOR_EXCLUDED',
      },
    });
    await runner.query(
      `INSERT INTO "${schemaName}"."timelineActivity"
        (id,name,"happensAt",properties,"targetCampaignId","targetCreatorId") VALUES
        ($1,'campaign.terminal',$2,$3::jsonb,$4,NULL),
        ($5,'campaign.terminal',$2,$3::jsonb,NULL,$6)`,
      [
        campaignTimelineProjectionId(businessEventId, 'CAMPAIGN', campaignId),
        terminalAt,
        properties,
        campaignId,
        campaignTimelineProjectionId(businessEventId, 'CREATOR', creatorId),
        creatorId,
      ],
    );
  });

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  it('backfills only retained facts with deterministic idempotent projections', async () => {
    const synchronizer = { synchronizeWorkspace: jest.fn() };
    const command = new SynchronizeCampaignActivityControlMetadataCommand(
      {} as never,
      synchronizer as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {},
            },
          },
        }),
      } as never,
    );
    const dataSource = {
      query: (sql: string, parameters?: unknown[]) =>
        runner.query(sql, parameters),
    };
    const args = {
      workspaceId,
      dataSource,
      options: { dryRun: false },
    } as never;

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    const projections = await runner.query(
      `SELECT name, properties, "targetCampaignId", "targetCreatorId"
         FROM "${schemaName}"."timelineActivity"
        ORDER BY name, "targetCampaignId" NULLS LAST, "targetCreatorId" NULLS LAST`,
    );
    expect(projections).toHaveLength(21);
    expect(
      projections.every(
        ({
          properties,
        }: {
          properties: { campaignEvent: { campaignId: string } };
        }) => properties.campaignEvent.campaignId === campaignId,
      ),
    ).toBe(true);
    expect(
      new Set(
        projections.map(
          ({
            properties,
          }: {
            properties: { campaignEvent: { businessEventId: string } };
          }) => properties.campaignEvent.businessEventId,
        ),
      ).size,
    ).toBe(11);
    expect(projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'campaign.message_accepted',
          properties: expect.objectContaining({
            campaignEvent: expect.objectContaining({
              messageId,
              messageThreadId: threadId,
            }),
          }),
        }),
        expect.objectContaining({
          name: 'campaign.excluded',
          properties: expect.objectContaining({
            campaignEvent: expect.objectContaining({ reason: 'Not a fit' }),
          }),
        }),
      ]),
    );
    for (const [sourceId, reason] of [
      [occurrenceId, 'OPERATOR_EXCLUDED'],
      [enrollmentId, 'OPERATOR_EXCLUDED'],
      [finishedEnrollmentId, 'SEQUENCE_COMPLETED'],
      [eligibilityEnrollmentId, 'INVALID_EMAIL'],
    ]) {
      expect(
        projections.filter(
          ({
            properties,
          }: {
            properties: { campaignEvent: Record<string, string> };
          }) =>
            properties.campaignEvent.eventKind === 'TERMINAL' &&
            properties.campaignEvent.sourceId === sourceId &&
            properties.campaignEvent.reason === reason,
        ),
      ).toHaveLength(2);
    }
    expect(
      projections.filter(
        ({
          properties,
        }: {
          properties: { campaignEvent: Record<string, string> };
        }) => properties.campaignEvent.sourceId === campaignCreatorId,
      ),
    ).toHaveLength(2);
    expect(synchronizer.synchronizeWorkspace).toHaveBeenCalledTimes(2);
  });
});
