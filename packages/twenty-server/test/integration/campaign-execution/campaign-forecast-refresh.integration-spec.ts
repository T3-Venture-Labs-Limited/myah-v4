import { randomUUID } from 'node:crypto';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CampaignForecastRefreshService } from 'src/modules/campaign-execution/services/campaign-forecast-refresh.service';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const ids = Object.fromEntries(
  [
    'campaign',
    'creator',
    'campaignCreator',
    'execution',
    'authorization',
    'activation',
    'enrollment',
    'occurrence',
    'workflow',
    'workflowVersion',
    'message',
  ].map((name) => [name, randomUUID()]),
) as Record<string, string>;
const scopeKey = `workspace:${workspaceId}`;

describe('Campaign forecast refresh with real PostgreSQL routing', () => {
  let ownsScope = false;

  beforeAll(async () => {
    // Other suites in the same shard may leave a forecast head for the shared
    // seed workspace; start from an empty scope so this fixture is order-independent.
    await global.testDataSource.query(
      `UPDATE core."campaignForecastHead" SET "currentGenerationId"=NULL WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignForecastGeneration" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignForecastHead" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
    ownsScope = true;
    const orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    const [member] = await global.testDataSource.query(
      `SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1`,
      [workspaceId],
    );
    if (!member) throw new Error('Seed user workspace missing');

    await orm.executeInWorkspaceContext(async () => {
      const campaign = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'campaign',
        { shouldBypassPermissionChecks: true },
      );
      const creator = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'creator',
        { shouldBypassPermissionChecks: true },
      );
      const campaignCreator = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'campaignCreator',
        { shouldBypassPermissionChecks: true },
      );
      await campaign.insert({
        id: ids.campaign,
        name: 'MYAH-437 refresh fixture',
      });
      await creator.insert({
        id: ids.creator,
        name: 'MYAH-437 creator',
        email: 'myah437@example.test',
      });
      await campaignCreator.insert({
        id: ids.campaignCreator,
        campaignId: ids.campaign,
        creatorId: ids.creator,
        name: 'MYAH-437 member',
      });
    }, buildSystemAuthContext(workspaceId));

    await global.testDataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO core."campaignExecution"
          (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
         VALUES ($1,$2,$3,'UTC','09:00','17:00','UTC')`,
        [ids.execution, workspaceId, ids.campaign],
      );
      await manager.query(
        `INSERT INTO core."campaignSequenceAuthorization"
          ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),'{}'::jsonb)`,
        [
          ids.authorization,
          workspaceId,
          ids.campaign,
          ids.execution,
          randomUUID(),
          'a'.repeat(64),
          ids.workflow,
          ids.workflowVersion,
          member.id,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignActivation"
          (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
         VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,1)`,
        [
          ids.activation,
          workspaceId,
          ids.campaign,
          ids.execution,
          ids.authorization,
          ids.workflowVersion,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignEnrollment"
          (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,1,0,'ACTIVE',now())`,
        [
          ids.enrollment,
          workspaceId,
          ids.campaign,
          ids.execution,
          ids.authorization,
          ids.campaignCreator,
          ids.creator,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignOccurrence"
          (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
         VALUES ($1,$2,$3,$4,$5,$6,0,'PENDING',now() + interval '1 hour')`,
        [
          ids.occurrence,
          workspaceId,
          ids.campaign,
          ids.enrollment,
          ids.workflowVersion,
          ids.message,
        ],
      );
    });
    await global.testDataSource.query(
      `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5".workflow (id,name,position,"outreachCampaignId",statuses)
       VALUES ($1,'MYAH-437 workflow',0,$2,'{}')`,
      [ids.workflow, ids.campaign],
    );
    await global.testDataSource.query(
      `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."workflowVersion"
        (id,name,"workflowId",position,status,trigger,steps,"campaignSequence")
       VALUES ($1,'MYAH-437 workflow version',$2,0,'DRAFT',NULL,NULL,$3::jsonb)`,
      [
        ids.workflowVersion,
        ids.workflow,
        JSON.stringify({
          schemaVersion: 1,
          messages: [
            {
              id: ids.message,
              channel: 'EMAIL',
              subject: 'Test',
              body: 'Test',
              files: [],
              replyToThread: false,
            },
          ],
          delaysSeconds: [],
        }),
      ],
    );
  });

  afterAll(async () => {
    const db = global.testDataSource;
    if (ownsScope) {
      await db.query(
        `DELETE FROM core."campaignForecastEntry" WHERE "workspaceId"=$1 AND "occurrenceId"=$2`,
        [workspaceId, ids.occurrence],
      );
      await db.query(
        `UPDATE core."campaignForecastHead" SET "currentGenerationId"=NULL WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
        [workspaceId, scopeKey],
      );
      await db.query(
        `DELETE FROM core."campaignForecastGeneration" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
        [workspaceId, scopeKey],
      );
      await db.query(
        `DELETE FROM core."campaignForecastHead" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
        [workspaceId, scopeKey],
      );
    }
    await db.query(`DELETE FROM core."campaignOccurrence" WHERE id=$1`, [
      ids.occurrence,
    ]);
    await db.query(`DELETE FROM core."campaignEnrollment" WHERE id=$1`, [
      ids.enrollment,
    ]);
    await db.query(`DELETE FROM core."campaignActivation" WHERE id=$1`, [
      ids.activation,
    ]);
    await db.query(
      `DELETE FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
      [ids.authorization],
    );
    await db.query(`DELETE FROM core."campaignExecution" WHERE id=$1`, [
      ids.execution,
    ]);
    await db.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."workflowVersion" WHERE id=$1`,
      [ids.workflowVersion],
    );
    await db.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".workflow WHERE id=$1`,
      [ids.workflow],
    );
    await db.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."campaignCreator" WHERE id=$1`,
      [ids.campaignCreator],
    );
    await db.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".creator WHERE id=$1`,
      [ids.creator],
    );
    await db.query(
      `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".campaign WHERE id=$1`,
      [ids.campaign],
    );
  });

  it('publishes a fresh generation for an active queued occurrence', async () => {
    const service = getDomainService<CampaignForecastRefreshService>(
      'CampaignForecastRefreshService',
    );
    // Workspaces created by other suites may fail to refresh (e.g. without Myah
    // metadata); this suite only asserts its own workspace's generation below.
    await service.refreshStaleForecasts().catch(() => undefined);
    const [head] = await global.testDataSource.query(
      `SELECT "currentGenerationId" FROM core."campaignForecastHead"
        WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
    expect(head).toBeDefined();
    expect(head.currentGenerationId).not.toBeNull();
    const [row] = await global.testDataSource.query(
      `SELECT head."currentGenerationId",generation."generatedAt",generation."evaluatedCount"
         FROM core."campaignForecastHead" head
         JOIN core."campaignForecastGeneration" generation ON generation.id=head."currentGenerationId"
        WHERE head."workspaceId"=$1 AND head."scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
    expect(row).toMatchObject({
      currentGenerationId: expect.any(String),
      evaluatedCount: expect.any(Number),
    });
    expect(new Date(row.generatedAt).getTime()).toBeGreaterThan(0);
  });
});
