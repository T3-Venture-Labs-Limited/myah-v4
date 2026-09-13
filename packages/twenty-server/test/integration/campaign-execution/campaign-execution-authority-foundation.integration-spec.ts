import { randomUUID } from 'node:crypto';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { DataSource, type QueryRunner } from 'typeorm';

import { CreateCampaignExecutionAuthorityFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789065457681-create-campaign-execution-authority-foundation';
import { AddCampaignDispatchEvidenceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789066100000-add-campaign-dispatch-evidence';
import { setPgDateTypeParser } from 'src/database/pg/set-pg-date-type-parser';
import { CampaignTestPreparationProofService } from 'src/engine/core-modules/campaign-test-authority/services/campaign-test-preparation-proof.service';
import { WorkspaceCampaignCapacityTimeZoneService } from 'src/engine/core-modules/myah/services/workspace-campaign-capacity-time-zone.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { type ReserveOutboundEmailAttemptInput } from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

setPgDateTypeParser();

const TABLES = [
  'campaignExecution',
  'campaignActivation',
  'campaignEnrollment',
  'campaignOccurrence',
  'mailboxCapacityDay',
  'mailboxDispatchClock',
  'outboundEmailAttempt',
  'campaignSequenceAuthorization',
  'campaignTestPreparationProof',
] as const;

const EXPECTED_CONSTRAINTS = [
  'CHK_CA_AUTHORIZATION_GENERATION_POSITIVE',
  'CHK_CA_COUNTS_NONNEGATIVE',
  'CHK_CEN_AUTHORIZATION_GENERATION_POSITIVE',
  'CHK_CEN_AUTHORED_CURSOR_RANGE',
  'CHK_CEN_AUTHORED_MESSAGE_COUNT_POSITIVE',
  'CHK_CEN_STATE',
  'CHK_CEN_TERMINAL_SHAPE',
  'CHK_CE_CAPACITY_TIME_ZONE_NONEMPTY',
  'CHK_CE_TIME_ZONE_NONEMPTY',
  'CHK_CE_WINDOW_ORDER',
  'CHK_CO_AUTHORED_INDEX_NONNEGATIVE',
  'CHK_CO_STATE',
  'CHK_CO_TERMINAL_SHAPE',
  'CHK_CSA_GENERATION_POSITIVE',
  'CHK_CSA_PREPARED_FINGERPRINT',
  'CHK_CSA_REVOCATION_SHAPE',
  'CHK_CSA_STATE',
  'CHK_CTP_DIGEST_SHAPES',
  'CHK_CTP_FINALIZATION_PAIR',
  'CHK_CTP_RESERVATION_EXPIRY',
  'CHK_CTP_SELECTION_SHAPE',
  'CHK_CTP_TEXT_SHAPES',
  'CHK_CTP_THREAD_SCOPE_SHAPE',
  'CHK_MAILBOX_CAPACITY_DAY_ACCEPTED_COUNT_NONNEGATIVE',
  'CHK_MAILBOX_CAPACITY_DAY_RESERVED_COUNT_NONNEGATIVE',
  'CHK_OUTBOUND_EMAIL_ATTEMPT_SELECTION_EVIDENCE',
  'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
  'CHK_OUTBOUND_EMAIL_ATTEMPT_STATE_CAPACITY_SHAPE',
  'CHK_OUTBOUND_EMAIL_ATTEMPT_UNKNOWN_AFTER',
  'CHK_OEA_CAMPAIGN_ACCEPTED_EVIDENCE',
  'CHK_OEA_LEGACY_NEW_EVIDENCE_NULL',
  'FK_CA_AUTHORIZATION_SCOPE',
  'FK_CA_EXECUTION_SCOPE',
  'FK_CEN_AUTHORIZATION_SCOPE',
  'FK_CEN_EXECUTION_SCOPE',
  'FK_CO_ENROLLMENT_SCOPE',
  'FK_OEA_ACTIVATION_BINDING',
  'FK_OEA_ENROLLMENT_AUTHORIZATION_SCOPE',
  'FK_OEA_OCCURRENCE_BINDING',
  'FK_OEA_TEST_PREPARATION_PROOF',
  'PK_664c9360372b183f4c1e66be804',
  'PK_6e767a4b8842974773128df696d',
  'PK_7a0feb444b2fffcf5e0fd49a8a4',
  'PK_CAMPAIGN_ACTIVATION',
  'PK_CAMPAIGN_ENROLLMENT',
  'PK_CAMPAIGN_EXECUTION',
  'PK_CAMPAIGN_OCCURRENCE',
  'PK_CAMPAIGN_SEQUENCE_AUTHORIZATION',
  'PK_CAMPAIGN_TEST_PREPARATION_PROOF',
  'UQ_CA_SCOPE_AUTHORIZATION',
  'UQ_CA_SCOPE_AUTH_VERSION',
  'UQ_CEN_SCOPE_AUTH_CREATOR',
  'UQ_CEN_SCOPE_AUTH_ID',
  'UQ_CEN_SCOPE_ID',
  'UQ_CE_SCOPE_ID',
  'UQ_CE_WORKSPACE_CAMPAIGN',
  'UQ_CO_ATTEMPT_BINDING',
  'UQ_CO_ENROLLMENT_AUTHORED_INDEX',
  'UQ_CO_ENROLLMENT_VERSION_MESSAGE',
  'UQ_CSA_SCOPE_AUTHORIZATION',
  'UQ_CSA_SCOPE_AUTH_VERSION',
  'UQ_CSA_SCOPE_GENERATION',
  'UQ_CSA_SCOPE_START_KEY',
  'UQ_CTP_ATTEMPT',
  'UQ_CTP_CONFIRMATION',
  'UQ_CTP_SCOPE_ATTEMPT_PROOF',
  'UQ_MAILBOX_CAPACITY_DAY_WORKSPACE_ACCOUNT_LOCAL_DATE',
  'UQ_MAILBOX_DISPATCH_CLOCK_WORKSPACE_ACCOUNT',
  'UQ_OEA_EXACT_CAMPAIGN_ATTEMPT',
].sort();

const EXPECTED_INDEXES = [
  'IDX_CO_DUE_PENDING',
  'IDX_CO_UNRESOLVED',
  'IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION',
  'UQ_CSA_ONE_ACTIVE_SCOPE',
  'UQ_CTP_SUBMISSION_CAPABILITY',
  'UQ_OUTBOUND_EMAIL_ATTEMPT_ACCEPTED_OCCURRENCE',
  'UQ_OUTBOUND_EMAIL_ATTEMPT_OCCURRENCE_NUMBER',
  'UQ_OUTBOUND_EMAIL_ATTEMPT_PROJECTED_MESSAGE',
  'UQ_OUTBOUND_EMAIL_ATTEMPT_PROVIDER_MESSAGE',
  'UQ_OUTBOUND_EMAIL_ATTEMPT_UNRESOLVED_OCCURRENCE',
  'UQ_OEA_CAMPAIGN_MICROSOFT_EXTERNAL',
].sort();

const digest = (character: string) => character.repeat(64);

const expectPgError = async (
  promise: Promise<unknown>,
  code: '23503' | '23505' | '23514',
  constraint: string,
) => {
  try {
    await promise;
    throw new Error(`Expected PostgreSQL constraint ${constraint}`);
  } catch (error) {
    expect(error).toMatchObject({ code, constraint });
  }
};

const readNormalizedCampaignCatalog = async (
  query: (sql: string) => Promise<unknown>,
) =>
  query(`WITH relations AS (
    SELECT c.oid, n.nspname, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'core' AND c.relname = ANY(ARRAY[
       'campaignExecution','campaignActivation','campaignEnrollment','campaignOccurrence',
       'mailboxCapacityDay','mailboxDispatchClock','outboundEmailAttempt',
       'campaignSequenceAuthorization','campaignTestPreparationProof'
     ])
  )
  SELECT jsonb_build_object(
    'policyColumns', (SELECT jsonb_agg(jsonb_build_array(c.table_name, c.column_name,
      c.data_type, c.is_nullable, c.column_default) ORDER BY c.table_name, c.column_name)
      FROM information_schema.columns c
      WHERE c.table_schema = 'core' AND (
        (c.table_name = 'workspace' AND c.column_name = 'campaignCapacityTimeZone') OR
        (c.table_name = 'connectedAccount' AND c.column_name IN ('dailySendLimit', 'minimumSendIntervalMs')))),
    'columns', (SELECT jsonb_agg(jsonb_build_array(r.relname, a.attname,
      format_type(a.atttypid, a.atttypmod), a.attnotnull,
      pg_get_expr(d.adbin, d.adrelid)) ORDER BY r.relname, a.attnum)
      FROM relations r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid = r.oid AND d.adnum = a.attnum),
    'constraints', (SELECT jsonb_agg(jsonb_build_array(con.conname,
      pg_get_constraintdef(con.oid, true), con.convalidated) ORDER BY con.conname)
      FROM pg_constraint con WHERE con.conrelid IN (SELECT oid FROM relations)),
    'indexes', (SELECT jsonb_agg(jsonb_build_array(i.indexrelid::regclass::text,
      pg_get_indexdef(i.indexrelid), i.indisvalid, i.indisready) ORDER BY i.indexrelid::regclass::text)
      FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM relations)),
    'triggers', (SELECT jsonb_agg(jsonb_build_array(t.tgname, pg_get_triggerdef(t.oid, true)) ORDER BY t.tgname)
      FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations) AND NOT t.tgisinternal),
    'functions', (SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'core' AND p.proname IN (
        'campaign_sequence_authorization_immutable_guard',
        'campaign_test_preparation_proof_immutable_guard')),
    'enums', (SELECT jsonb_agg(jsonb_build_array(t.typname, e.enumlabel, e.enumsortorder)
      ORDER BY t.typname, e.enumsortorder)
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'core' AND t.typname LIKE 'campaignSequenceAuthorization%')
  ) AS catalog`);

const readUnaffectedParentCatalog = (
  query: (sql: string) => Promise<unknown>,
) =>
  query(`SELECT jsonb_build_object(
    'columns', (SELECT jsonb_agg(jsonb_build_array(table_name, column_name, data_type,
      is_nullable, column_default) ORDER BY table_name, column_name)
      FROM information_schema.columns WHERE table_schema = 'core'
      AND table_name IN ('workspace', 'connectedAccount')
      AND column_name NOT IN ('campaignCapacityTimeZone', 'dailySendLimit', 'minimumSendIntervalMs')),
    'constraints', (SELECT jsonb_agg(jsonb_build_array(con.conname,
      pg_get_constraintdef(con.oid, true)) ORDER BY con.conname)
      FROM pg_constraint con WHERE con.conrelid IN ('core.workspace'::regclass, 'core."connectedAccount"'::regclass)),
    'indexes', (SELECT jsonb_agg(jsonb_build_array(indexname, indexdef) ORDER BY indexname)
      FROM pg_indexes WHERE schemaname = 'core' AND tablename IN ('workspace', 'connectedAccount'))
  ) AS catalog`);

const readOwnedRows = (
  query: (sql: string) => Promise<unknown>,
  workspaceId: string,
) =>
  query(`SELECT jsonb_build_object(
    'execution', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM core."campaignExecution" t WHERE "workspaceId" = '${workspaceId}'),
    'activation', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM core."campaignActivation" t WHERE "workspaceId" = '${workspaceId}'),
    'enrollment', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM core."campaignEnrollment" t WHERE "workspaceId" = '${workspaceId}'),
    'occurrence', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM core."campaignOccurrence" t WHERE "workspaceId" = '${workspaceId}'),
    'capacity', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM core."mailboxCapacityDay" t WHERE "workspaceId" = '${workspaceId}'),
    'clock', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM core."mailboxDispatchClock" t WHERE "workspaceId" = '${workspaceId}'),
    'attempt', (SELECT jsonb_agg(to_jsonb(t) ORDER BY "attemptId") FROM core."outboundEmailAttempt" t WHERE "workspaceId" = '${workspaceId}'),
    'authorization', (SELECT jsonb_agg(to_jsonb(t) ORDER BY "authorizationId") FROM core."campaignSequenceAuthorization" t WHERE "workspaceId" = '${workspaceId}'),
    'proof', (SELECT jsonb_agg(to_jsonb(t) ORDER BY "testPreparationProofId") FROM core."campaignTestPreparationProof" t WHERE "workspaceId" = '${workspaceId}')
  ) AS rows`);

const boundFixtureConnections = (runners: QueryRunner[]) =>
  Promise.all(
    runners.map((runner) => runner.query(`SET statement_timeout = '10s'`)),
  );

const withBoundedFixtureQuery = async <Result>(
  dataSource: DataSource,
  operation: (runner: QueryRunner) => Promise<Result>,
): Promise<Result> => {
  const runner = dataSource.createQueryRunner();

  try {
    await runner.connect();
    await runner.query(`SET statement_timeout = '10s'`);

    return await operation(runner);
  } finally {
    if (!runner.isReleased) await runner.release();
  }
};

const waitUntilBlockedOnLock = async (
  backendPid: number,
  expectedBlockerPid: number,
) => {
  for (let attempts = 0; attempts < 500; attempts += 1) {
    const [activity] = await withBoundedFixtureQuery(
      global.testDataSource,
      (runner) =>
        runner.query(
          `SELECT wait_event_type AS "waitEventType", pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity
            WHERE pid = $1`,
          [backendPid],
        ) as Promise<
          Array<{ blockers: number[]; waitEventType: string | null }>
        >,
    );

    if (
      activity?.waitEventType === 'Lock' &&
      activity.blockers.includes(expectedBlockerPid)
    )
      return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  await withBoundedFixtureQuery(global.testDataSource, (runner) =>
    runner.query('SELECT pg_cancel_backend($1)', [backendPid]),
  );
  throw new Error(`Backend ${backendPid} did not reach the lock barrier`);
};

describe('campaign execution authority physical contract (PostgreSQL)', () => {
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const campaignId = randomUUID();
  const executionId = randomUUID();
  const authorizationId = randomUUID();
  const workflowId = randomUUID();
  const workflowVersionId = randomUUID();
  const userWorkspaceId = randomUUID();
  const activationId = randomUUID();
  const enrollmentId = randomUUID();
  const occurrenceId = randomUUID();
  const creatorId = randomUUID();
  const campaignCreatorId = randomUUID();
  const messageId = randomUUID();
  const baseProofId = randomUUID();
  const baseProofAttemptId = randomUUID();
  const outboundAttemptId = randomUUID();
  let serviceDataSource: DataSource;

  beforeAll(async () => {
    serviceDataSource = new DataSource({
      type: 'postgres',
      url: process.env.PG_DATABASE_URL,
    });
    await serviceDataSource.initialize();
    await global.testDataSource.query(
      `INSERT INTO core."campaignExecution"
        (id, "workspaceId", "campaignId", "timeZone", "startLocalTime", "endLocalTime", "campaignCapacityTimeZone")
       VALUES ($1, $2, $3, 'UTC', '09:00', '17:00', 'UTC')`,
      [executionId, workspaceId, campaignId],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignSequenceAuthorization"
        ("authorizationId", "workspaceId", "campaignId", "campaignExecutionId", generation,
         "startIdempotencyKey", "preparedFingerprint", "workflowId", "workflowVersionId",
         "initiatingUserWorkspaceId", state, "authorizedAt", binding)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, 'ACTIVE', now(), '{}'::jsonb)`,
      [
        authorizationId,
        workspaceId,
        campaignId,
        executionId,
        randomUUID(),
        digest('a'),
        workflowId,
        workflowVersionId,
        userWorkspaceId,
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignActivation"
        (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId",
         "authorizationGeneration", "workflowVersionId", "activatedAt", "createdEnrollmentCount", "createdOccurrenceCount")
       VALUES ($1, $2, $3, $4, $5, 1, $6, now(), 1, 1)`,
      [
        activationId,
        workspaceId,
        campaignId,
        executionId,
        authorizationId,
        workflowVersionId,
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignEnrollment"
        (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId",
         "authorizationGeneration", "campaignCreatorId", "creatorId", "authoredMessageCount",
         "nextAuthoredMessageIndex", state, "enrolledAt")
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7, 1, 0, 'ACTIVE', now())`,
      [
        enrollmentId,
        workspaceId,
        campaignId,
        executionId,
        authorizationId,
        campaignCreatorId,
        creatorId,
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignOccurrence"
        (id, "workspaceId", "campaignId", "enrollmentId", "workflowVersionId", "messageId",
         "authoredMessageIndex", state, "dueAt")
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'PENDING', now())`,
      [
        occurrenceId,
        workspaceId,
        campaignId,
        enrollmentId,
        workflowVersionId,
        messageId,
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignTestPreparationProof"
        ("testPreparationProofId", "confirmationId", "attemptId", "workspaceId", "campaignId",
         "campaignCreatorId", "workflowVersionId", "messageId", "requesterUserId", "requesterUserWorkspaceId",
         "normalizedRecipient", "connectedAccountId", "messageChannelId", provider, "normalizedSenderHandle",
         "senderPoolFingerprint", "campaignCapacityTimeZone", "selectionConstraintKind", "threadScopeKind",
         "renderDigest", "previewDigest", "testTransportDigest", "confirmationIssuedAt", "reservationEligibleUntil")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'base@example.com', $11, $12,
               'google', 'sender@example.com', 'pool', 'UTC', 'ROTATE', 'NEW_THREAD', $13, $14, $15,
               '2040-01-02T10:00:00Z', '2040-01-02T11:00:00Z')`,
      [
        baseProofId,
        randomUUID(),
        baseProofAttemptId,
        workspaceId,
        campaignId,
        campaignCreatorId,
        workflowVersionId,
        messageId,
        randomUUID(),
        userWorkspaceId,
        randomUUID(),
        randomUUID(),
        digest('1'),
        digest('2'),
        digest('3'),
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."outboundEmailAttempt"
        ("attemptId", "workspaceId", source, "attemptState", "capacityState", "connectedAccountId",
         "messageChannelId", provider, "normalizedSenderHandle", "normalizedRecipient", "selectionConstraintKind",
         "localDate", "claimedAt", "slotAt", "unknownAfter", "directReservationCapabilityId")
       VALUES ($1, $2, 'INBOX', 'RESERVED', 'RESERVED', $3, $4, 'GOOGLE',
               'sender@example.com', 'recipient@example.com', 'EXPLICIT', '2040-01-02',
               '2040-01-02T10:00:00Z', '2040-01-02T10:00:00Z', '2040-01-02T10:01:00Z', $5)`,
      [
        outboundAttemptId,
        workspaceId,
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ],
    );
  });

  afterAll(async () => {
    for (const table of [
      'outboundEmailAttempt',
      'campaignOccurrence',
      'campaignEnrollment',
      'campaignActivation',
      'campaignTestPreparationProof',
      'campaignSequenceAuthorization',
      'campaignExecution',
      'mailboxCapacityDay',
      'mailboxDispatchClock',
    ]) {
      await global.testDataSource.query(
        `DELETE FROM core."${table}" WHERE "workspaceId" = $1 OR "workspaceId" = $2`,
        [workspaceId, otherWorkspaceId],
      );
    }
    await serviceDataSource.destroy();
  });

  it('matches the reviewed physical manifest without replacing unrelated catalog objects', async () => {
    const tables = await global.testDataSource.query<Array<{ name: string }>>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'core' AND table_name = ANY($1)
        ORDER BY table_name`,
      [[...TABLES]],
    );
    expect(tables.map(({ name }) => name)).toEqual([...TABLES].sort());

    const constraints = await global.testDataSource.query<
      Array<{ name: string; validated: boolean }>
    >(
      `SELECT conname AS name, convalidated AS validated
         FROM pg_constraint
        WHERE connamespace = 'core'::regnamespace
          AND conrelid = ANY($1::regclass[])
          AND contype <> 'n'
        ORDER BY conname`,
      [TABLES.map((table) => `core."${table}"`)],
    );
    expect(constraints.map(({ name }) => name)).toEqual(EXPECTED_CONSTRAINTS);
    expect(constraints.every(({ validated }) => validated)).toBe(true);

    const indexes = await global.testDataSource.query<Array<{ name: string }>>(
      `SELECT indexname AS name FROM pg_indexes
        WHERE schemaname = 'core' AND indexname = ANY($1)
        ORDER BY indexname`,
      [EXPECTED_INDEXES],
    );
    expect(indexes.map(({ name }) => name)).toEqual(EXPECTED_INDEXES);

    const unrelated = await global.testDataSource.query<
      Array<{ name: string }>
    >(`SELECT to_regclass('core.workspace')::text AS name`);
    expect(unrelated).toEqual([{ name: 'core.workspace' }]);
  });

  it('rejects representative invalid shapes for every CHECK family and every unique/index family', async () => {
    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."campaignExecution"
          (id, "workspaceId", "campaignId", "timeZone", "startLocalTime", "endLocalTime", "campaignCapacityTimeZone")
         VALUES ($1, $2, $3, 'UTC', '09:00', '17:00', '')`,
        [randomUUID(), workspaceId, randomUUID()],
      ),
      '23514',
      'CHK_CE_CAPACITY_TIME_ZONE_NONEMPTY',
    );
    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."campaignExecution"
          (id, "workspaceId", "campaignId", "timeZone", "startLocalTime", "endLocalTime", "campaignCapacityTimeZone")
         VALUES ($1, $2, $3, 'UTC', '17:00', '09:00', 'UTC')`,
        [randomUUID(), workspaceId, randomUUID()],
      ),
      '23514',
      'CHK_CE_WINDOW_ORDER',
    );
    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."campaignEnrollment"
          (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId", "authorizationGeneration",
           "campaignCreatorId", "creatorId", "authoredMessageCount", "nextAuthoredMessageIndex", state, "enrolledAt")
         SELECT $1, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId", 0,
                $2, $3, 1, 0, 'ACTIVE', now()
           FROM core."campaignEnrollment" WHERE id = $4`,
        [randomUUID(), randomUUID(), randomUUID(), enrollmentId],
      ),
      '23514',
      'CHK_CEN_AUTHORIZATION_GENERATION_POSITIVE',
    );
    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."campaignOccurrence"
          (id, "workspaceId", "campaignId", "enrollmentId", "workflowVersionId", "messageId",
           "authoredMessageIndex", state, "dueAt")
         VALUES ($1, $2, $3, $4, $5, $6, -1, 'PENDING', now())`,
        [
          randomUUID(),
          workspaceId,
          campaignId,
          enrollmentId,
          workflowVersionId,
          randomUUID(),
        ],
      ),
      '23514',
      'CHK_CO_AUTHORED_INDEX_NONNEGATIVE',
    );
    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."mailboxCapacityDay"
          ("workspaceId", "connectedAccountId", "localDate", "reservedCount", "acceptedCount")
         VALUES ($1, $2, current_date, 0, -1)`,
        [workspaceId, randomUUID()],
      ),
      '23514',
      'CHK_MAILBOX_CAPACITY_DAY_ACCEPTED_COUNT_NONNEGATIVE',
    );

    await global.testDataSource.query(
      `INSERT INTO core."mailboxCapacityDay"
        ("workspaceId", "connectedAccountId", "localDate", "reservedCount", "acceptedCount")
       VALUES ($1, $2, current_date, 0, 0)`,
      [workspaceId, creatorId],
    );
    const isolatedUpdates: Array<[string, string, unknown[]]> = [
      [
        'CHK_CE_TIME_ZONE_NONEMPTY',
        `UPDATE core."campaignExecution" SET "timeZone" = '' WHERE id = $1`,
        [executionId],
      ],
      [
        'CHK_CE_WINDOW_ORDER',
        `UPDATE core."campaignExecution" SET "endLocalTime" = "startLocalTime" WHERE id = $1`,
        [executionId],
      ],
      [
        'CHK_CA_COUNTS_NONNEGATIVE',
        `UPDATE core."campaignActivation" SET "createdOccurrenceCount" = -1 WHERE id = $1`,
        [activationId],
      ],
      [
        'CHK_CA_AUTHORIZATION_GENERATION_POSITIVE',
        `UPDATE core."campaignActivation" SET "authorizationGeneration" = 0 WHERE id = $1`,
        [activationId],
      ],
      [
        'CHK_CEN_AUTHORED_CURSOR_RANGE',
        `UPDATE core."campaignEnrollment" SET "nextAuthoredMessageIndex" = 2 WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CEN_AUTHORED_MESSAGE_COUNT_POSITIVE',
        `UPDATE core."campaignEnrollment" SET "authoredMessageCount" = 0 WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CEN_STATE',
        `UPDATE core."campaignEnrollment" SET state = 'BOGUS' WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CEN_TERMINAL_SHAPE',
        `UPDATE core."campaignEnrollment" SET "terminalReason" = 'x' WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CEN_TERMINAL_SHAPE',
        `UPDATE core."campaignEnrollment" SET state = 'REPLIED', "terminalReason" = 'reply' WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CEN_TERMINAL_SHAPE',
        `UPDATE core."campaignEnrollment" SET state = 'REPLIED', "terminalAt" = now() WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CEN_TERMINAL_SHAPE',
        `UPDATE core."campaignEnrollment" SET state = 'FINISHED', "terminalReason" = 'done', "terminalAt" = now() WHERE id = $1`,
        [enrollmentId],
      ],
      [
        'CHK_CO_STATE',
        `UPDATE core."campaignOccurrence" SET state = 'BOGUS' WHERE id = $1`,
        [occurrenceId],
      ],
      [
        'CHK_CO_TERMINAL_SHAPE',
        `UPDATE core."campaignOccurrence" SET "terminalReason" = 'x' WHERE id = $1`,
        [occurrenceId],
      ],
      [
        'CHK_CO_TERMINAL_SHAPE',
        `UPDATE core."campaignOccurrence" SET state = 'HELD' WHERE id = $1`,
        [occurrenceId],
      ],
      [
        'CHK_CO_TERMINAL_SHAPE',
        `UPDATE core."campaignOccurrence" SET state = 'SUCCEEDED' WHERE id = $1`,
        [occurrenceId],
      ],
      [
        'CHK_CO_TERMINAL_SHAPE',
        `UPDATE core."campaignOccurrence" SET state = 'SUCCEEDED', "terminalReason"='sent' WHERE id = $1`,
        [occurrenceId],
      ],
      [
        'CHK_CO_TERMINAL_SHAPE',
        `UPDATE core."campaignOccurrence" SET state = 'SUCCEEDED', "terminalAt"=now() WHERE id = $1`,
        [occurrenceId],
      ],
      [
        'CHK_MAILBOX_CAPACITY_DAY_RESERVED_COUNT_NONNEGATIVE',
        `UPDATE core."mailboxCapacityDay" SET "reservedCount" = -1 WHERE "workspaceId" = $1 AND "connectedAccountId" = $2`,
        [workspaceId, creatorId],
      ],
      [
        'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
        `UPDATE core."outboundEmailAttempt" SET "directReservationCapabilityId" = NULL WHERE "attemptId" = $1`,
        [outboundAttemptId],
      ],
      [
        'CHK_OUTBOUND_EMAIL_ATTEMPT_STATE_CAPACITY_SHAPE',
        `UPDATE core."outboundEmailAttempt" SET "capacityState" = 'RELEASED' WHERE "attemptId" = $1`,
        [outboundAttemptId],
      ],
      [
        'CHK_OUTBOUND_EMAIL_ATTEMPT_UNKNOWN_AFTER',
        `UPDATE core."outboundEmailAttempt" SET "unknownAfter" = "claimedAt" WHERE "attemptId" = $1`,
        [outboundAttemptId],
      ],
      [
        'CHK_OUTBOUND_EMAIL_ATTEMPT_SELECTION_EVIDENCE',
        `UPDATE core."outboundEmailAttempt" SET "selectionConstraintKind" = 'PINNED_REPLY' WHERE "attemptId" = $1`,
        [outboundAttemptId],
      ],
    ];
    for (const [constraint, sql, parameters] of isolatedUpdates) {
      await expectPgError(
        global.testDataSource.query(sql, parameters),
        '23514',
        constraint,
      );
    }
    const shapeRunner = global.testDataSource.createQueryRunner();
    await shapeRunner.connect();
    try {
      for (const vector of [
        {
          state: 'ACTIVE',
          hold: 'WORKSPACE_NOT_ACTIVE',
          reason: null,
          terminal: null,
          cursor: 0,
        },
        {
          state: 'REPLIED',
          hold: null,
          reason: 'REPLY_RECEIVED',
          terminal: new Date(),
          cursor: 0,
        },
        {
          state: 'EXCLUDED',
          hold: null,
          reason: 'INVALID_STAGE',
          terminal: new Date(),
          cursor: 0,
        },
        {
          state: 'FINISHED',
          hold: null,
          reason: 'SEQUENCE_COMPLETED',
          terminal: new Date(),
          cursor: 1,
        },
      ]) {
        await shapeRunner.startTransaction();
        expect(
          await shapeRunner.query(
            `UPDATE core."campaignEnrollment" SET state = $2, "holdReason" = $3,
              "terminalReason" = $4, "terminalAt" = $5, "nextAuthoredMessageIndex" = $6
              WHERE id = $1 RETURNING id`,
            [
              enrollmentId,
              vector.state,
              vector.hold,
              vector.reason,
              vector.terminal,
              vector.cursor,
            ],
          ),
        ).toEqual([[{ id: enrollmentId }], 1]);
        await shapeRunner.rollbackTransaction();
      }
      for (const vector of [
        { state: 'PENDING', hold: null, reason: null, terminal: null },
        { state: 'IN_FLIGHT', hold: null, reason: null, terminal: null },
        { state: 'UNKNOWN', hold: null, reason: null, terminal: null },
        {
          state: 'HELD',
          hold: 'WORKSPACE_NOT_ACTIVE',
          reason: null,
          terminal: null,
        },
        {
          state: 'SUCCEEDED',
          hold: null,
          reason: 'PROVIDER_ACCEPTED',
          terminal: new Date(),
        },
        {
          state: 'SKIPPED',
          hold: null,
          reason: 'CREATOR_MISSING',
          terminal: new Date(),
        },
        {
          state: 'CANCELLED',
          hold: null,
          reason: 'CAMPAIGN_PAUSED',
          terminal: new Date(),
        },
      ]) {
        await shapeRunner.startTransaction();
        expect(
          await shapeRunner.query(
            `UPDATE core."campaignOccurrence" SET state = $2, "holdReason" = $3,
              "terminalReason" = $4, "terminalAt" = $5 WHERE id = $1 RETURNING id`,
            [
              occurrenceId,
              vector.state,
              vector.hold,
              vector.reason,
              vector.terminal,
            ],
          ),
        ).toEqual([[{ id: occurrenceId }], 1]);
        await shapeRunner.rollbackTransaction();
      }
    } finally {
      if (shapeRunner.isTransactionActive)
        await shapeRunner.rollbackTransaction();
      await shapeRunner.release();
    }

    for (const [attemptState, capacityState] of [
      ['RESERVED', 'RESERVED'],
      ['PROCESSING', 'RESERVED'],
      ['BLOCKED', 'RELEASED'],
      ['ACCEPTED', 'CONSUMED'],
      ['DEFINITELY_UNACCEPTED', 'RELEASED'],
      ['UNKNOWN', 'PROVISIONAL_UNKNOWN'],
    ]) {
      const result = await global.testDataSource.query(
        `UPDATE core."outboundEmailAttempt" SET "attemptState" = $2, "capacityState" = $3
          WHERE "attemptId" = $1 RETURNING "attemptId"`,
        [outboundAttemptId, attemptState, capacityState],
      );
      expect(result).toEqual([[{ attemptId: outboundAttemptId }], 1]);
    }
    await global.testDataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState" = 'RESERVED', "capacityState" = 'RESERVED'
        WHERE "attemptId" = $1`,
      [outboundAttemptId],
    );

    const cloneProof = (changes: Record<string, unknown>) =>
      global.testDataSource.query(
        `INSERT INTO core."campaignTestPreparationProof"
         SELECT (jsonb_populate_record(NULL::core."campaignTestPreparationProof",
           to_jsonb(p) || $2::jsonb || jsonb_build_object(
             'testPreparationProofId', $3::text, 'confirmationId', $4::text, 'attemptId', $5::text))).*
           FROM core."campaignTestPreparationProof" p WHERE "testPreparationProofId" = $1`,
        [
          baseProofId,
          JSON.stringify(changes),
          randomUUID(),
          randomUUID(),
          randomUUID(),
        ],
      );
    for (const [constraint, changes] of [
      ['CHK_CTP_TEXT_SHAPES', { provider: '' }],
      ['CHK_CTP_DIGEST_SHAPES', { renderDigest: 'bad' }],
      [
        'CHK_CTP_RESERVATION_EXPIRY',
        { reservationEligibleUntil: '2040-01-02T09:00:00Z' },
      ],
      [
        'CHK_CTP_FINALIZATION_PAIR',
        { testSubmissionCapabilityId: randomUUID() },
      ],
      ['CHK_CTP_FINALIZATION_PAIR', { finalEvidenceDigest: digest('9') }],
      ['CHK_CTP_THREAD_SCOPE_SHAPE', { threadScopeKind: 'PLANNED_PRIOR_STEP' }],
      ['CHK_CTP_SELECTION_SHAPE', { selectionConstraintKind: 'PINNED_REPLY' }],
    ] as const) {
      await expectPgError(cloneProof(changes), '23514', constraint);
    }
    const insertedCapabilityId = randomUUID();
    await cloneProof({
      testSubmissionCapabilityId: insertedCapabilityId,
      finalEvidenceDigest: digest('7'),
    });
    expect(
      await global.testDataSource.query(
        `SELECT COUNT(*)::integer AS count FROM core."campaignTestPreparationProof"
          WHERE "testSubmissionCapabilityId"=$1 AND "finalEvidenceDigest"=$2`,
        [insertedCapabilityId, digest('7')],
      ),
    ).toEqual([{ count: 1 }]);

    const cloneAuthorization = (changes: Record<string, unknown>) =>
      global.testDataSource.query(
        `INSERT INTO core."campaignSequenceAuthorization"
         SELECT (jsonb_populate_record(NULL::core."campaignSequenceAuthorization",
           to_jsonb(a) || $2::jsonb || jsonb_build_object(
             'authorizationId', $3::text, 'workspaceId', $4::text,
             'campaignId', $5::text, 'startIdempotencyKey', $6::text))).*
           FROM core."campaignSequenceAuthorization" a WHERE "authorizationId" = $1
         RETURNING "authorizationId"`,
        [
          authorizationId,
          JSON.stringify(changes),
          randomUUID(),
          otherWorkspaceId,
          randomUUID(),
          randomUUID(),
        ],
      );
    await expectPgError(
      cloneAuthorization({
        state: 'REVOKED',
        revokedAt: null,
        revocationReason: null,
      }),
      '23514',
      'CHK_CSA_REVOCATION_SHAPE',
    );
    await expectPgError(
      cloneAuthorization({
        state: 'REVOKED',
        revokedAt: '2040-01-02T10:00:00Z',
        revocationReason: 'CAMPAIGN_PAUSED',
        preparedFingerprint: 'bad',
      }),
      '23514',
      'CHK_CSA_PREPARED_FINGERPRINT',
    );
    await expectPgError(
      cloneAuthorization({
        state: 'REVOKED',
        revokedAt: '2040-01-02T10:00:00Z',
        revocationReason: 'CAMPAIGN_PAUSED',
        generation: 0,
      }),
      '23514',
      'CHK_CSA_GENERATION_POSITIVE',
    );
    await expect(
      cloneAuthorization({ state: 'UNKNOWN' }),
    ).rejects.toMatchObject({
      code: '22P02',
    });
    for (const vector of [
      { state: 'ACTIVE', revokedAt: null, revocationReason: null, valid: true },
      {
        state: 'ACTIVE',
        revokedAt: '2040-01-02T10:00:00Z',
        revocationReason: null,
        valid: false,
      },
      {
        state: 'ACTIVE',
        revokedAt: null,
        revocationReason: 'CAMPAIGN_PAUSED',
        valid: false,
      },
      {
        state: 'ACTIVE',
        revokedAt: '2040-01-02T10:00:00Z',
        revocationReason: 'CAMPAIGN_PAUSED',
        valid: false,
      },
      {
        state: 'REVOKED',
        revokedAt: null,
        revocationReason: null,
        valid: false,
      },
      {
        state: 'REVOKED',
        revokedAt: '2040-01-02T10:00:00Z',
        revocationReason: null,
        valid: false,
      },
      {
        state: 'REVOKED',
        revokedAt: null,
        revocationReason: 'CAMPAIGN_PAUSED',
        valid: false,
      },
      {
        state: 'REVOKED',
        revokedAt: '2040-01-02T10:00:00Z',
        revocationReason: 'CAMPAIGN_PAUSED',
        valid: true,
      },
    ] as const) {
      const operation = cloneAuthorization({
        state: vector.state,
        revokedAt: vector.revokedAt,
        revocationReason: vector.revocationReason,
      });
      if (vector.valid)
        await expect(operation).resolves.toEqual([
          { authorizationId: expect.any(String) },
        ]);
      else await expectPgError(operation, '23514', 'CHK_CSA_REVOCATION_SHAPE');
    }

    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."campaignExecution"
          (id, "workspaceId", "campaignId", "timeZone", "startLocalTime", "endLocalTime", "campaignCapacityTimeZone")
         VALUES ($1, $2, $3, 'UTC', '09:00', '17:00', 'UTC')`,
        [randomUUID(), workspaceId, campaignId],
      ),
      '23505',
      'UQ_CE_WORKSPACE_CAMPAIGN',
    );
    const activeUniqueCampaignId = randomUUID();
    let activeGeneration = 0;
    const insertActiveAuthorization = () =>
      global.testDataSource.query(
        `INSERT INTO core."campaignSequenceAuthorization"
          ("authorizationId", "workspaceId", "campaignId", "campaignExecutionId", generation,
           "startIdempotencyKey", "preparedFingerprint", "workflowId", "workflowVersionId",
           "initiatingUserWorkspaceId", state, "authorizedAt", binding)
         SELECT $1, $2, $3, "campaignExecutionId", $5, $4, "preparedFingerprint", "workflowId",
                "workflowVersionId", "initiatingUserWorkspaceId", 'ACTIVE', now(), binding
           FROM core."campaignSequenceAuthorization" WHERE "authorizationId" = $6 RETURNING "authorizationId"`,
        [
          randomUUID(),
          otherWorkspaceId,
          activeUniqueCampaignId,
          randomUUID(),
          ++activeGeneration,
          authorizationId,
        ],
      );
    expect(await insertActiveAuthorization()).toEqual([
      { authorizationId: expect.any(String) },
    ]);
    await expectPgError(
      insertActiveAuthorization(),
      '23505',
      'UQ_CSA_ONE_ACTIVE_SCOPE',
    );
    await global.testDataSource.query(
      `INSERT INTO core."mailboxDispatchClock" ("workspaceId", "connectedAccountId") VALUES ($1, $2)`,
      [workspaceId, creatorId],
    );
    await expectPgError(
      global.testDataSource.query(
        `INSERT INTO core."mailboxDispatchClock" ("workspaceId", "connectedAccountId") VALUES ($1, $2)`,
        [workspaceId, creatorId],
      ),
      '23505',
      'UQ_MAILBOX_DISPATCH_CLOCK_WORKSPACE_ACCOUNT',
    );

    const [{ checkCount, uniqueCount }] = await global.testDataSource.query<
      Array<{ checkCount: string; uniqueCount: string }>
    >(
      `SELECT COUNT(*) FILTER (WHERE contype = 'c')::text AS "checkCount",
              COUNT(*) FILTER (WHERE contype IN ('p', 'u'))::text AS "uniqueCount"
         FROM pg_constraint
        WHERE connamespace = 'core'::regnamespace
          AND conrelid = ANY($1::regclass[])
          AND convalidated`,
      [TABLES.map((table) => `core."${table}"`)],
    );
    expect({ checkCount, uniqueCount }).toEqual({
      checkCount: '31',
      uniqueCount: '29',
    });
  });

  it('enforces all same-workspace foreign-key paths', async () => {
    const cases: Array<[string, string, unknown[]]> = [
      [
        'FK_CA_AUTHORIZATION_SCOPE',
        `INSERT INTO core."campaignActivation"
          (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId", "authorizationGeneration",
           "workflowVersionId", "activatedAt", "createdEnrollmentCount", "createdOccurrenceCount")
         VALUES ($1, $2, $3, $4, $5, 1, $6, now(), 0, 0)`,
        [
          randomUUID(),
          otherWorkspaceId,
          campaignId,
          executionId,
          authorizationId,
          workflowVersionId,
        ],
      ],
      [
        'FK_CEN_AUTHORIZATION_SCOPE',
        `INSERT INTO core."campaignEnrollment"
          (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId", "authorizationGeneration",
           "campaignCreatorId", "creatorId", "authoredMessageCount", "nextAuthoredMessageIndex", state, "enrolledAt")
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7, 1, 0, 'ACTIVE', now())`,
        [
          randomUUID(),
          otherWorkspaceId,
          campaignId,
          executionId,
          authorizationId,
          randomUUID(),
          randomUUID(),
        ],
      ],
      [
        'FK_CO_ENROLLMENT_SCOPE',
        `INSERT INTO core."campaignOccurrence"
          (id, "workspaceId", "campaignId", "enrollmentId", "workflowVersionId", "messageId", "authoredMessageIndex", state, "dueAt")
         VALUES ($1, $2, $3, $4, $5, $6, 1, 'PENDING', now())`,
        [
          randomUUID(),
          otherWorkspaceId,
          campaignId,
          enrollmentId,
          workflowVersionId,
          randomUUID(),
        ],
      ],
    ];

    for (const [constraint, sql, parameters] of cases) {
      await expectPgError(
        global.testDataSource.query(sql, parameters),
        '23503',
        constraint,
      );
    }
    for (const [constraint, sql, parameters] of [
      [
        'FK_CA_EXECUTION_SCOPE',
        `UPDATE core."campaignActivation" SET "campaignExecutionId" = $2 WHERE id = $1`,
        [activationId, randomUUID()],
      ],
      [
        'FK_CA_AUTHORIZATION_SCOPE',
        `UPDATE core."campaignActivation" SET "authorizationId" = $2 WHERE id = $1`,
        [activationId, randomUUID()],
      ],
      [
        'FK_CEN_EXECUTION_SCOPE',
        `UPDATE core."campaignEnrollment" SET "campaignExecutionId" = $2 WHERE id = $1`,
        [enrollmentId, randomUUID()],
      ],
      [
        'FK_CEN_AUTHORIZATION_SCOPE',
        `UPDATE core."campaignEnrollment" SET "authorizationId" = $2 WHERE id = $1`,
        [enrollmentId, randomUUID()],
      ],
      [
        'FK_CO_ENROLLMENT_SCOPE',
        `UPDATE core."campaignOccurrence" SET "enrollmentId" = $2 WHERE id = $1`,
        [occurrenceId, randomUUID()],
      ],
    ] as const) {
      await expectPgError(
        global.testDataSource.query(sql, [...parameters]),
        '23503',
        constraint,
      );
    }

    const proofFirstRunner = global.testDataSource.createQueryRunner();
    await proofFirstRunner.connect();
    await proofFirstRunner.startTransaction();
    try {
      await expectPgError(
        proofFirstRunner.query(
          `INSERT INTO core."outboundEmailAttempt"
            ("attemptId", "workspaceId", source, "attemptState", "capacityState", "connectedAccountId",
             "messageChannelId", provider, "normalizedSenderHandle", "normalizedRecipient", "selectionConstraintKind",
             "senderPoolFingerprint", "localDate", "claimedAt", "slotAt", "unknownAfter", "campaignId",
             "workflowVersionId", "messageId", "testPreparationProofId", "requesterUserWorkspaceId",
             "renderDigest", "previewDigest", "testTransportDigest")
           SELECT $1, "workspaceId", 'CAMPAIGN_TEST', 'RESERVED', 'RESERVED', "connectedAccountId",
                  "messageChannelId", provider, "normalizedSenderHandle", "normalizedRecipient", "selectionConstraintKind",
                  "senderPoolFingerprint", '2040-01-02', '2040-01-02T10:00:00Z', '2040-01-02T10:00:00Z',
                  '2040-01-02T10:01:00Z', "campaignId", "workflowVersionId", "messageId", $2,
                  "requesterUserWorkspaceId", "renderDigest", "previewDigest", "testTransportDigest"
             FROM core."campaignTestPreparationProof" WHERE "testPreparationProofId" = $3`,
          [randomUUID(), randomUUID(), baseProofId],
        ),
        '23503',
        'FK_OEA_TEST_PREPARATION_PROOF',
      );
    } finally {
      await proofFirstRunner.rollbackTransaction();
      await proofFirstRunner.release();
    }

    const foreignKeys = await global.testDataSource.query<
      Array<{ name: string; definition: string }>
    >(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE connamespace = 'core'::regnamespace
          AND contype = 'f'
          AND conrelid = ANY($1::regclass[])
        ORDER BY conname`,
      [TABLES.map((table) => `core."${table}"`)],
    );
    expect(foreignKeys).toHaveLength(9);
    expect(
      foreignKeys.every(({ definition }) =>
        definition.includes('"workspaceId"'),
      ),
    ).toBe(true);
  });

  it('enforces CSA revocation immutability and compare-and-swap stale-loser semantics', async () => {
    await expect(
      global.testDataSource.query(
        `UPDATE core."campaignSequenceAuthorization" SET "revokedAt" = now()
          WHERE "authorizationId" = $1`,
        [authorizationId],
      ),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining('immutable'),
    });
    await expect(
      global.testDataSource.query(
        `UPDATE core."campaignSequenceAuthorization"
            SET state = 'REVOKED', "revokedAt" = now(), "revocationReason" = 'CAMPAIGN_PAUSED',
                binding = '{"illegal":true}'::jsonb
          WHERE "authorizationId" = $1`,
        [authorizationId],
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('immutable') });
    expect(
      await global.testDataSource.query(
        `SELECT state, binding FROM core."campaignSequenceAuthorization" WHERE "authorizationId" = $1`,
        [authorizationId],
      ),
    ).toEqual([{ state: 'ACTIVE', binding: {} }]);
    await expect(
      global.testDataSource.query(
        `UPDATE core."campaignSequenceAuthorization"
            SET state = 'REVOKED', "revokedAt" = now(), "revocationReason" = 'CAMPAIGN_PAUSED', "updatedAt" = now()
          WHERE "authorizationId" = $1 AND state = 'ACTIVE'
          RETURNING state`,
        [authorizationId],
      ),
    ).resolves.toEqual([[{ state: 'REVOKED' }], 1]);
    expect(
      await global.testDataSource.query(
        `UPDATE core."campaignSequenceAuthorization"
            SET state = 'REVOKED', "revokedAt" = now(), "revocationReason" = 'CAMPAIGN_COMPLETED'
          WHERE "authorizationId" = $1 AND state = 'ACTIVE'
          RETURNING state`,
        [authorizationId],
      ),
    ).toEqual([[], 0]);
    const [revokedSnapshot] = await global.testDataSource.query(
      `SELECT to_jsonb(a) AS row FROM core."campaignSequenceAuthorization" a WHERE "authorizationId" = $1`,
      [authorizationId],
    );
    for (const mutation of [
      `state = 'ACTIVE', "revokedAt" = NULL, "revocationReason" = NULL`,
      `binding = '{"changed":true}'::jsonb`,
    ]) {
      await expect(
        global.testDataSource.query(
          `UPDATE core."campaignSequenceAuthorization" SET ${mutation} WHERE "authorizationId" = $1`,
          [authorizationId],
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('immutable'),
      });
      expect(
        await global.testDataSource.query(
          `SELECT to_jsonb(a) AS row FROM core."campaignSequenceAuthorization" a WHERE "authorizationId" = $1`,
          [authorizationId],
        ),
      ).toEqual([revokedSnapshot]);
    }
  });

  it('allows exactly one CTP finalization and rejects partial/null and later mutations', async () => {
    const proofId = randomUUID();
    const attemptId = randomUUID();
    await global.testDataSource.query(
      `INSERT INTO core."campaignTestPreparationProof"
        ("testPreparationProofId", "confirmationId", "attemptId", "workspaceId", "campaignId",
         "campaignCreatorId", "workflowVersionId", "messageId", "requesterUserId", "requesterUserWorkspaceId",
         "normalizedRecipient", "connectedAccountId", "messageChannelId", provider, "normalizedSenderHandle",
         "senderPoolFingerprint", "campaignCapacityTimeZone", "selectionConstraintKind", "threadScopeKind",
         "renderDigest", "previewDigest", "testTransportDigest", "confirmationIssuedAt", "reservationEligibleUntil")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'a@example.com', $11, $12,
               'GOOGLE', 'sender@example.com', 'pool', 'UTC', 'ROTATE', 'NEW_THREAD', $13, $14, $15, now(), now() + interval '1 hour')`,
      [
        proofId,
        randomUUID(),
        attemptId,
        workspaceId,
        campaignId,
        campaignCreatorId,
        workflowVersionId,
        messageId,
        randomUUID(),
        userWorkspaceId,
        randomUUID(),
        randomUUID(),
        digest('b'),
        digest('c'),
        digest('d'),
      ],
    );
    await expect(
      global.testDataSource.query(
        `UPDATE core."campaignTestPreparationProof" SET "testSubmissionCapabilityId" = $2
          WHERE "testPreparationProofId" = $1`,
        [proofId, randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining('immutable'),
    });
    await expect(
      global.testDataSource.query(
        `UPDATE core."campaignTestPreparationProof" SET "finalEvidenceDigest" = $2
          WHERE "testPreparationProofId" = $1`,
        [proofId, digest('a')],
      ),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining('immutable'),
    });
    await expect(
      global.testDataSource.query(
        `UPDATE core."campaignTestPreparationProof"
            SET "testSubmissionCapabilityId" = $2, "finalEvidenceDigest" = $3,
                "normalizedRecipient" = 'illegal@example.com'
          WHERE "testPreparationProofId" = $1`,
        [proofId, randomUUID(), digest('e')],
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('immutable') });
    expect(
      await global.testDataSource.query(
        `SELECT "testSubmissionCapabilityId", "finalEvidenceDigest", "normalizedRecipient"
           FROM core."campaignTestPreparationProof" WHERE "testPreparationProofId" = $1`,
        [proofId],
      ),
    ).toEqual([
      {
        testSubmissionCapabilityId: null,
        finalEvidenceDigest: null,
        normalizedRecipient: 'a@example.com',
      },
    ]);
    expect(
      await global.testDataSource.query(
        `UPDATE core."campaignTestPreparationProof"
            SET "testSubmissionCapabilityId" = $2, "finalEvidenceDigest" = $3
          WHERE "testPreparationProofId" = $1 AND "testSubmissionCapabilityId" IS NULL
          RETURNING "testPreparationProofId"`,
        [proofId, randomUUID(), digest('e')],
      ),
    ).toEqual([[{ testPreparationProofId: proofId }], 1]);
    expect(
      await global.testDataSource.query(
        `UPDATE core."campaignTestPreparationProof"
            SET "testSubmissionCapabilityId" = $2, "finalEvidenceDigest" = $3
          WHERE "testPreparationProofId" = $1 AND "testSubmissionCapabilityId" IS NULL
          RETURNING "testPreparationProofId"`,
        [proofId, randomUUID(), digest('f')],
      ),
    ).toEqual([[], 0]);
    const [finalizedSnapshot] = await global.testDataSource.query(
      `SELECT to_jsonb(p) AS row FROM core."campaignTestPreparationProof" p WHERE "testPreparationProofId" = $1`,
      [proofId],
    );
    for (const mutation of [
      `"testSubmissionCapabilityId" = NULL`,
      `"finalEvidenceDigest" = NULL`,
      `"testSubmissionCapabilityId" = NULL, "finalEvidenceDigest" = NULL`,
      `"testSubmissionCapabilityId" = '${randomUUID()}', "finalEvidenceDigest" = '${digest('8')}'`,
      `"normalizedRecipient" = 'other@example.com'`,
    ]) {
      await expect(
        global.testDataSource.query(
          `UPDATE core."campaignTestPreparationProof" SET ${mutation} WHERE "testPreparationProofId" = $1`,
          [proofId],
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('immutable'),
      });
      expect(
        await global.testDataSource.query(
          `SELECT to_jsonb(p) AS row FROM core."campaignTestPreparationProof" p WHERE "testPreparationProofId" = $1`,
          [proofId],
        ),
      ).toEqual([finalizedSnapshot]);
    }
  });

  it('serializes competing CTP service finalizations with exact replay for the winner', async () => {
    const service = new CampaignTestPreparationProofService();
    const winnerCapabilityId = randomUUID();
    const loserCapabilityId = randomUUID();
    const winnerDigest = digest('6');
    const first = serviceDataSource.createQueryRunner();
    const second = serviceDataSource.createQueryRunner();
    let loser: Promise<unknown> | undefined;
    try {
      await Promise.all([first.connect(), second.connect()]);
      await boundFixtureConnections([first, second]);
      const [[firstPid], [secondPid]] = (await Promise.all([
        first.query('SELECT pg_backend_pid() AS pid'),
        second.query('SELECT pg_backend_pid() AS pid'),
      ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
      await Promise.all([first.startTransaction(), second.startTransaction()]);
      const winner = await service.finalizeInTransaction(
        {
          attemptId: baseProofAttemptId,
          finalEvidenceDigest: winnerDigest,
          testPreparationProofId: baseProofId,
          testSubmissionCapabilityId: winnerCapabilityId,
          workspaceId,
        },
        first.manager,
      );
      expect(winner.status).toBe('FINALIZED');
      loser = service.finalizeInTransaction(
        {
          attemptId: baseProofAttemptId,
          finalEvidenceDigest: digest('7'),
          testPreparationProofId: baseProofId,
          testSubmissionCapabilityId: loserCapabilityId,
          workspaceId,
        },
        second.manager,
      );
      await waitUntilBlockedOnLock(secondPid.pid, firstPid.pid);
      await first.commitTransaction();
      await expect(loser).resolves.toMatchObject({
        status: 'FINALIZATION_CONFLICT',
      });
      await second.commitTransaction();
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      if (loser !== undefined) await Promise.allSettled([loser]);
      if (second.isTransactionActive) await second.rollbackTransaction();
      await Promise.all([first.release(), second.release()]);
    }

    const replay = serviceDataSource.createQueryRunner();
    await replay.connect();
    await replay.startTransaction();
    try {
      await expect(
        service.finalizeInTransaction(
          {
            attemptId: baseProofAttemptId,
            finalEvidenceDigest: winnerDigest,
            testPreparationProofId: baseProofId,
            testSubmissionCapabilityId: winnerCapabilityId,
            workspaceId,
          },
          replay.manager,
        ),
      ).resolves.toMatchObject({ status: 'EXACT_REPLAY' });
      await replay.commitTransaction();
    } finally {
      if (replay.isTransactionActive) await replay.rollbackTransaction();
      await replay.release();
    }
    expect(
      await global.testDataSource.query(
        `SELECT "testSubmissionCapabilityId", "finalEvidenceDigest"
           FROM core."campaignTestPreparationProof" WHERE "testPreparationProofId" = $1`,
        [baseProofId],
      ),
    ).toEqual([
      {
        testSubmissionCapabilityId: winnerCapabilityId,
        finalEvidenceDigest: winnerDigest,
      },
    ]);
  });

  it('validates IANA workspace capacity zones against persisted PostgreSQL state', async () => {
    const workspace = { id: randomUUID(), original: null };
    const schemaName = getWorkspaceSchemaName(workspace.id);
    const wtzCampaignId = randomUUID();
    const authorization = {
      assertReadAllowedInTransaction: jest.fn().mockResolvedValue(undefined),
      assertMutationAllowedInTransaction: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const service = new WorkspaceCampaignCapacityTimeZoneService(authorization);
    const runner = global.testDataSource.createQueryRunner();
    let runnerConnected = false;
    try {
      await withBoundedFixtureQuery(global.testDataSource, (setupRunner) =>
        setupRunner.query(
          `INSERT INTO core.workspace
           SELECT (jsonb_populate_record(NULL::core.workspace, to_jsonb(w) || jsonb_build_object(
             'id',$1::text,'subdomain',$2::text,
             'inviteHash',$3::text,'databaseSchema',$4::text,'customDomain',NULL,
             'campaignCapacityTimeZone',NULL))).*
           FROM core.workspace w ORDER BY w.id LIMIT 1`,
          [workspace.id, `w13-${workspace.id}`, randomUUID(), schemaName],
        ),
      );
      await withBoundedFixtureQuery(global.testDataSource, (setupRunner) =>
        setupRunner.query(`CREATE SCHEMA "${schemaName}"`),
      );
      await withBoundedFixtureQuery(global.testDataSource, (setupRunner) =>
        setupRunner.query(
          `CREATE TABLE "${schemaName}".campaign
            (id uuid PRIMARY KEY, name text, "lifecycleStatus" text NOT NULL, "deletedAt" timestamptz)`,
        ),
      );
      await runner.connect();
      runnerConnected = true;
      await runner.query(`SET statement_timeout = '10s'`);
      await global.testDataSource.query(
        `UPDATE core.workspace SET "campaignCapacityTimeZone" = 'Europe/London' WHERE id = $1`,
        [workspace.id],
      );
      await runner.startTransaction();
      await expect(
        service.readCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id },
          runner.manager,
        ),
      ).resolves.toEqual({
        status: 'CONFIGURED',
        campaignCapacityTimeZone: 'Europe/London',
      });
      await runner.commitTransaction();

      expect(authorization.assertReadAllowedInTransaction).toHaveBeenCalledWith(
        { workspaceId: workspace.id },
        runner.manager,
      );

      await runner.startTransaction();
      await runner.query(
        `ALTER TABLE "${schemaName}".campaign DROP COLUMN "deletedAt"`,
      );
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
          runner.manager,
        ),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_SCAN_INCOMPLETE',
      });
      await runner.rollbackTransaction();

      await runner.startTransaction();
      await runner.query(
        `INSERT INTO "${schemaName}".campaign (id, name, "lifecycleStatus")
         VALUES ($1, 'W13 timezone fence', 'DRAFT')`,
        [wtzCampaignId],
      );
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
          runner.manager,
        ),
      ).resolves.toEqual({
        status: 'UPDATED',
        campaignCapacityTimeZone: 'UTC',
      });
      expect(
        await runner.query(
          `SELECT "campaignCapacityTimeZone" AS value FROM core.workspace WHERE id=$1`,
          [workspace.id],
        ),
      ).toEqual([{ value: 'UTC' }]);
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
          runner.manager,
        ),
      ).resolves.toEqual({
        status: 'UNCHANGED',
        campaignCapacityTimeZone: 'UTC',
      });
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: null },
          runner.manager,
        ),
      ).resolves.toEqual({ status: 'UPDATED', campaignCapacityTimeZone: null });
      await expect(
        service.readCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id },
          runner.manager,
        ),
      ).resolves.toEqual({ status: 'BLOCKED', reason: 'NOT_CONFIGURED' });
      const [insideMutation] = await runner.query(
        `SELECT "campaignCapacityTimeZone" AS value FROM core.workspace WHERE id = $1`,
        [workspace.id],
      );
      expect(insideMutation).toEqual({ value: null });
      await runner.rollbackTransaction();
      expect(
        await global.testDataSource.query(
          `SELECT "campaignCapacityTimeZone" AS value FROM core.workspace WHERE id = $1`,
          [workspace.id],
        ),
      ).toEqual([{ value: 'Europe/London' }]);
      expect(
        authorization.assertMutationAllowedInTransaction,
      ).toHaveBeenCalledWith(
        { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
        runner.manager,
      );

      authorization.assertMutationAllowedInTransaction.mockRejectedValueOnce(
        new Error('denied'),
      );
      await runner.startTransaction();
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
          runner.manager,
        ),
      ).rejects.toThrow('denied');
      expect(
        await runner.query(
          `SELECT "campaignCapacityTimeZone" AS value FROM core.workspace WHERE id=$1`,
          [workspace.id],
        ),
      ).toEqual([{ value: 'Europe/London' }]);
      await runner.rollbackTransaction();
      expect(
        await global.testDataSource.query(
          `SELECT "campaignCapacityTimeZone" AS value FROM core.workspace WHERE id = $1`,
          [workspace.id],
        ),
      ).toEqual([{ value: 'Europe/London' }]);

      authorization.assertMutationAllowedInTransaction.mockClear();
      authorization.assertReadAllowedInTransaction.mockRejectedValueOnce(
        new Error('read denied'),
      );
      await runner.startTransaction();
      await expect(
        service.readCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id },
          runner.manager,
        ),
      ).rejects.toThrow('read denied');
      expect(
        authorization.assertMutationAllowedInTransaction,
      ).not.toHaveBeenCalled();
      await runner.rollbackTransaction();

      await runner.startTransaction();
      await runner.query(
        `INSERT INTO "${schemaName}".campaign (id, name, "lifecycleStatus")
         VALUES ($1, 'W13 hidden active fence', 'ACTIVE')`,
        [wtzCampaignId],
      );
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
          runner.manager,
        ),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'ACTIVE_CAMPAIGN_EXISTS',
      });
      await runner.rollbackTransaction();

      await runner.startTransaction();
      await expect(
        service.setCampaignCapacityTimeZoneInTransaction(
          {
            workspaceId: workspace.id,
            campaignCapacityTimeZone: 'Mars/Olympus',
          },
          runner.manager,
        ),
      ).rejects.toThrow('mutation input was invalid');
      await runner.rollbackTransaction();

      await global.testDataSource.query(
        `UPDATE core.workspace SET "campaignCapacityTimeZone" = 'Mars/Olympus' WHERE id = $1`,
        [workspace.id],
      );
      await runner.startTransaction();
      await expect(
        service.readCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id },
          runner.manager,
        ),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'INVALID_STORED_TIME_ZONE',
      });
      await runner.commitTransaction();

      await global.testDataSource.query(
        `UPDATE core.workspace SET "campaignCapacityTimeZone" = 'Europe/London' WHERE id = $1`,
        [workspace.id],
      );
      const lockOwner = serviceDataSource.createQueryRunner();
      const waiter = serviceDataSource.createQueryRunner();
      let lockOwnerConnected = false;
      let waiterConnected = false;
      let waitingMutation: Promise<unknown> | undefined;
      try {
        await lockOwner.connect();
        lockOwnerConnected = true;
        await waiter.connect();
        waiterConnected = true;
        await boundFixtureConnections([lockOwner, waiter]);
        const [[ownerPid], [waiterPid]] = (await Promise.all([
          lockOwner.query('SELECT pg_backend_pid() AS pid'),
          waiter.query('SELECT pg_backend_pid() AS pid'),
        ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
        await Promise.all([
          lockOwner.startTransaction(),
          waiter.startTransaction(),
        ]);
        await lockOwner.query(
          `SELECT id FROM core.workspace WHERE id = $1 FOR UPDATE`,
          [workspace.id],
        );
        await lockOwner.query(
          `INSERT INTO "${schemaName}".campaign (id, name, "lifecycleStatus") VALUES ($1, 'race', 'ACTIVE')`,
          [randomUUID()],
        );
        waitingMutation = service.setCampaignCapacityTimeZoneInTransaction(
          { workspaceId: workspace.id, campaignCapacityTimeZone: 'UTC' },
          waiter.manager,
        );
        await waitUntilBlockedOnLock(waiterPid.pid, ownerPid.pid);
        await lockOwner.commitTransaction();
        await expect(waitingMutation).resolves.toEqual({
          status: 'BLOCKED',
          reason: 'ACTIVE_CAMPAIGN_EXISTS',
        });
        expect(
          await waiter.query(
            `SELECT "campaignCapacityTimeZone" AS value FROM core.workspace WHERE id=$1`,
            [workspace.id],
          ),
        ).toEqual([{ value: 'Europe/London' }]);
        await waiter.rollbackTransaction();
      } finally {
        if (lockOwner.isTransactionActive)
          await lockOwner.rollbackTransaction();
        if (waitingMutation !== undefined)
          await Promise.allSettled([waitingMutation]);
        if (waiter.isTransactionActive) await waiter.rollbackTransaction();
        await Promise.all([
          ...(lockOwnerConnected && !lockOwner.isReleased
            ? [lockOwner.release()]
            : []),
          ...(waiterConnected && !waiter.isReleased ? [waiter.release()] : []),
        ]);
      }
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (runnerConnected && !runner.isReleased) await runner.release();
      await withBoundedFixtureQuery(
        global.testDataSource,
        async (cleanupRunner) => {
          try {
            await cleanupRunner.query(
              `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
            );
          } finally {
            await cleanupRunner.query(
              `DELETE FROM core.workspace WHERE id = $1`,
              [workspace.id],
            );
          }
        },
      );
    }
  });

  it('serializes shared-mailbox daily capacity and spacing races on distinct connections', async () => {
    const accountId = randomUUID();
    const localDate = '2040-01-02';
    await global.testDataSource.query(
      `INSERT INTO core."mailboxCapacityDay"
        ("workspaceId", "connectedAccountId", "localDate", "reservedCount", "acceptedCount")
       VALUES ($1, $2, $3, 0, 49)`,
      [workspaceId, accountId, localDate],
    );
    await global.testDataSource.query(
      `INSERT INTO core."mailboxDispatchClock" ("workspaceId", "connectedAccountId", "nextEligibleAt")
       VALUES ($1, $2, '2040-01-02T12:00:00Z')`,
      [workspaceId, accountId],
    );

    const first = global.testDataSource.createQueryRunner();
    const second = global.testDataSource.createQueryRunner();
    await Promise.all([first.connect(), second.connect()]);
    await boundFixtureConnections([first, second]);
    const [[firstPid], [secondPid]] = (await Promise.all([
      first.query('SELECT pg_backend_pid() AS pid'),
      second.query('SELECT pg_backend_pid() AS pid'),
    ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
    expect(firstPid.pid).not.toBe(secondPid.pid);

    await Promise.all([first.startTransaction(), second.startTransaction()]);
    try {
      const firstWinnerResult = await first.query(
        `UPDATE core."mailboxCapacityDay"
            SET "reservedCount" = "reservedCount" + 1
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3
            AND "acceptedCount" + "reservedCount" < 50
          RETURNING "reservedCount"`,
        [workspaceId, accountId, localDate],
      );
      expect(firstWinnerResult[0]).toEqual([{ reservedCount: 1 }]);

      const staleCompetitor = second.query(
        `UPDATE core."mailboxCapacityDay"
            SET "reservedCount" = "reservedCount" + 1
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3
            AND "acceptedCount" + "reservedCount" < 50
          RETURNING "reservedCount"`,
        [workspaceId, accountId, localDate],
      );
      await waitUntilBlockedOnLock(secondPid.pid, firstPid.pid);
      await first.commitTransaction();
      await expect(staleCompetitor).resolves.toEqual([[], 0]);
      await second.commitTransaction();
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      if (second.isTransactionActive) await second.rollbackTransaction();
      await Promise.all([first.release(), second.release()]);
    }

    const spacingFirst = global.testDataSource.createQueryRunner();
    const spacingSecond = global.testDataSource.createQueryRunner();
    await Promise.all([spacingFirst.connect(), spacingSecond.connect()]);
    await boundFixtureConnections([spacingFirst, spacingSecond]);
    const [[spacingFirstPid], [spacingSecondPid]] = (await Promise.all([
      spacingFirst.query('SELECT pg_backend_pid() AS pid'),
      spacingSecond.query('SELECT pg_backend_pid() AS pid'),
    ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
    expect(spacingFirstPid.pid).not.toBe(spacingSecondPid.pid);
    await Promise.all([
      spacingFirst.startTransaction(),
      spacingSecond.startTransaction(),
    ]);
    try {
      const spacingWinner = await spacingFirst.query(
        `UPDATE core."mailboxDispatchClock"
            SET "nextEligibleAt" = GREATEST("nextEligibleAt", $3::timestamptz)
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2
            AND "nextEligibleAt" <= $4::timestamptz
          RETURNING "nextEligibleAt"`,
        [
          workspaceId,
          accountId,
          '2040-01-02T12:05:00Z',
          '2040-01-02T12:00:00Z',
        ],
      );
      expect(spacingWinner[0]).toHaveLength(1);
      const spacingLoser = spacingSecond.query(
        `UPDATE core."mailboxDispatchClock"
            SET "nextEligibleAt" = GREATEST("nextEligibleAt", $3::timestamptz)
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2
            AND "nextEligibleAt" <= $4::timestamptz
          RETURNING "nextEligibleAt"`,
        [
          workspaceId,
          accountId,
          '2040-01-02T12:05:00Z',
          '2040-01-02T12:00:00Z',
        ],
      );
      await waitUntilBlockedOnLock(spacingSecondPid.pid, spacingFirstPid.pid);
      await spacingFirst.commitTransaction();
      await expect(spacingLoser).resolves.toEqual([[], 0]);
      await spacingSecond.commitTransaction();
    } finally {
      if (spacingFirst.isTransactionActive)
        await spacingFirst.rollbackTransaction();
      if (spacingSecond.isTransactionActive)
        await spacingSecond.rollbackTransaction();
      await Promise.all([spacingFirst.release(), spacingSecond.release()]);
    }

    expect(
      await global.testDataSource.query(
        `SELECT "reservedCount", "acceptedCount" FROM core."mailboxCapacityDay"
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3`,
        [workspaceId, accountId, localDate],
      ),
    ).toEqual([{ reservedCount: 1, acceptedCount: 49 }]);
    const [clock] = await global.testDataSource.query<Array<{ value: Date }>>(
      `SELECT "nextEligibleAt" AS value FROM core."mailboxDispatchClock"
        WHERE "workspaceId" = $1 AND "connectedAccountId" = $2`,
      [workspaceId, accountId],
    );
    expect(clock.value.toISOString()).toBe('2040-01-02T12:05:00.000Z');

    const [dst] = await global.testDataSource.query<
      Array<{ fallHours: string; springHours: string }>
    >(`SELECT
      EXTRACT(epoch FROM (
        ('2040-11-05'::date::timestamp AT TIME ZONE 'America/New_York') -
        ('2040-11-04'::date::timestamp AT TIME ZONE 'America/New_York'))) / 3600 AS "fallHours",
      EXTRACT(epoch FROM (
        ('2040-03-12'::date::timestamp AT TIME ZONE 'America/New_York') -
        ('2040-03-11'::date::timestamp AT TIME ZONE 'America/New_York'))) / 3600 AS "springHours"`);
    expect(Number(dst.fallHours)).toBe(25);
    expect(Number(dst.springHours)).toBe(23);
    const temporalVectors = await global.testDataSource.query<
      Array<{ localDate: string; nextMidnight: Date; timestamp: Date }>
    >(`SELECT source."timestamp",
              (source."timestamp" AT TIME ZONE 'America/New_York')::date::text AS "localDate",
              ((((source."timestamp" AT TIME ZONE 'America/New_York')::date + 1)::timestamp)
                AT TIME ZONE 'America/New_York') AS "nextMidnight"
         FROM (VALUES ('2040-03-11T05:00:00Z'::timestamptz),
                      ('2040-11-04T04:00:00Z'::timestamptz)) source("timestamp")
        ORDER BY source."timestamp"`);
    expect(
      temporalVectors.map(({ localDate: date, nextMidnight }) => ({
        localDate: date,
        nextMidnight: nextMidnight.toISOString(),
      })),
    ).toEqual([
      { localDate: '2040-03-11', nextMidnight: '2040-03-12T04:00:00.000Z' },
      { localDate: '2040-11-04', nextMidnight: '2040-11-05T05:00:00.000Z' },
    ]);

    const midnightAccount = randomUUID();
    await global.testDataSource.query(
      `INSERT INTO core."mailboxCapacityDay"
        ("workspaceId", "connectedAccountId", "localDate", "acceptedCount", "reservedCount")
       VALUES ($1, $2, '2040-01-02', 49, 0), ($1, $2, '2040-01-03', 0, 0)`,
      [workspaceId, midnightAccount],
    );
    await global.testDataSource.query(
      `INSERT INTO core."mailboxDispatchClock" ("workspaceId", "connectedAccountId") VALUES ($1, $2)`,
      [workspaceId, midnightAccount],
    );
    expect(
      await global.testDataSource.query(
        `SELECT "localDate"::text AS "localDate", "acceptedCount", "reservedCount"
          FROM core."mailboxCapacityDay" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2
          ORDER BY "localDate"`,
        [workspaceId, midnightAccount],
      ),
    ).toEqual([
      { localDate: '2040-01-02', acceptedCount: 49, reservedCount: 0 },
      { localDate: '2040-01-03', acceptedCount: 0, reservedCount: 0 },
    ]);
    const midnightRunner = serviceDataSource.createQueryRunner();
    await midnightRunner.connect();
    await midnightRunner.startTransaction();
    try {
      const lockedDay = await new MailboxCapacityService().lockReservationDay(
        {
          workspaceId,
          connectedAccountId: midnightAccount,
          localDate: '2040-01-02',
        },
        midnightRunner.manager,
      );
      await new MailboxCapacityService().incrementReservedAndAdvanceClock(
        {
          lockedDay,
          slotAt: new Date('2040-01-03T04:59:00Z'),
          minimumSendIntervalMs: 300_000,
        },
        midnightRunner.manager,
      );
      await midnightRunner.commitTransaction();
    } finally {
      if (midnightRunner.isTransactionActive)
        await midnightRunner.rollbackTransaction();
      await midnightRunner.release();
    }
    expect(
      await global.testDataSource.query(
        `SELECT "acceptedCount","reservedCount" FROM core."mailboxCapacityDay"
          WHERE "workspaceId"=$1 AND "connectedAccountId"=$2 AND "localDate"='2040-01-02'`,
        [workspaceId, midnightAccount],
      ),
    ).toEqual([{ acceptedCount: 49, reservedCount: 1 }]);
    expect(
      await global.testDataSource.query(
        `SELECT (TIMESTAMPTZ '2040-01-03T05:00:00Z' AT TIME ZONE 'America/New_York')::date::text AS "localDate",
                d."acceptedCount", d."reservedCount", c."nextEligibleAt"
          FROM core."mailboxCapacityDay" d JOIN core."mailboxDispatchClock" c
            USING ("workspaceId","connectedAccountId")
          WHERE d."workspaceId"=$1 AND d."connectedAccountId"=$2 AND d."localDate"='2040-01-03'`,
        [workspaceId, midnightAccount],
      ),
    ).toEqual([
      {
        localDate: '2040-01-03',
        acceptedCount: 0,
        reservedCount: 0,
        nextEligibleAt: new Date('2040-01-03T05:04:00Z'),
      },
    ]);

    const rollbackRunner = global.testDataSource.createQueryRunner();
    await rollbackRunner.connect();
    await rollbackRunner.startTransaction();
    try {
      await rollbackRunner.query(
        `UPDATE core."mailboxCapacityDay" SET "reservedCount" = "reservedCount" + 1
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3`,
        [workspaceId, accountId, localDate],
      );
      await expectPgError(
        rollbackRunner.query(
          `UPDATE core."mailboxCapacityDay" SET "acceptedCount" = -1
            WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3`,
          [workspaceId, accountId, localDate],
        ),
        '23514',
        'CHK_MAILBOX_CAPACITY_DAY_ACCEPTED_COUNT_NONNEGATIVE',
      );
    } finally {
      await rollbackRunner.rollbackTransaction();
      await rollbackRunner.release();
    }
    expect(
      await global.testDataSource.query(
        `SELECT "reservedCount", "acceptedCount" FROM core."mailboxCapacityDay"
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3`,
        [workspaceId, accountId, localDate],
      ),
    ).toEqual([{ reservedCount: 1, acceptedCount: 49 }]);
  });

  it('reserves the shared 50th slot through landed services and fences the cross-source 51st racer', async () => {
    const accountId = randomUUID();
    const channelId = randomUUID();
    const sequenceAttemptId = randomUUID();
    const directAttemptId = randomUUID();
    const competingCampaignId = randomUUID();
    const competingExecutionId = randomUUID();
    const competingAuthorizationId = randomUUID();
    const competingEnrollmentId = randomUUID();
    const competingOccurrenceId = randomUUID();
    const competingWorkflowVersionId = randomUUID();
    const competingMessageId = randomUUID();
    await global.testDataSource.query(
      `INSERT INTO core."campaignExecution" (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
       VALUES ($1,$2,$3,'UTC','09:00','17:00','UTC')`,
      [competingExecutionId, workspaceId, competingCampaignId],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignSequenceAuthorization"
       ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey",
        "preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
       VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),'{}')`,
      [
        competingAuthorizationId,
        workspaceId,
        competingCampaignId,
        competingExecutionId,
        randomUUID(),
        digest('6'),
        randomUUID(),
        competingWorkflowVersionId,
        randomUUID(),
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignActivation" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
       VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,1)`,
      [
        randomUUID(),
        workspaceId,
        competingCampaignId,
        competingExecutionId,
        competingAuthorizationId,
        competingWorkflowVersionId,
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignEnrollment" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
       VALUES ($1,$2,$3,$4,$5,1,$6,$7,1,0,'ACTIVE',now())`,
      [
        competingEnrollmentId,
        workspaceId,
        competingCampaignId,
        competingExecutionId,
        competingAuthorizationId,
        randomUUID(),
        randomUUID(),
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignOccurrence" (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
       VALUES ($1,$2,$3,$4,$5,$6,0,'PENDING',now())`,
      [
        competingOccurrenceId,
        workspaceId,
        competingCampaignId,
        competingEnrollmentId,
        competingWorkflowVersionId,
        competingMessageId,
      ],
    );
    const [sample] = await global.testDataSource.query<
      Array<{ localDate: string }>
    >(
      `SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS "localDate"`,
    );
    await global.testDataSource.query(
      `INSERT INTO core."mailboxCapacityDay"
        ("workspaceId", "connectedAccountId", "localDate", "acceptedCount", "reservedCount")
       VALUES ($1, $2, $3, 49, 0)`,
      [workspaceId, accountId, sample.localDate],
    );
    const sender = {
      bindingStatus: 'RESOLVED_BINDING',
      campaignAccountId: randomUUID(),
      connectedAccountId: accountId,
      dailySendLimit: 50,
      messageChannelId: channelId,
      minimumSendIntervalMs: 0,
      missingBinding: null,
      provider: ConnectedAccountProvider.GOOGLE,
      reason: null,
      recoveryPath: null,
      senderHandle: 'sender@example.com',
      status: 'READY',
    } satisfies ReadyCampaignSenderReadiness;
    const common = {
      workspaceId,
      connectedAccountId: accountId,
      messageChannelId: channelId,
      provider: 'google',
      normalizedSenderHandle: 'sender@example.com',
      normalizedRecipient: 'recipient@example.com',
      priorAcceptedEvidenceId: null,
      workspaceTimeZone: 'UTC',
      candidates: [sender],
    };
    const sequenceInput = {
      ...common,
      attemptId: sequenceAttemptId,
      source: 'CAMPAIGN_SEQUENCE',
      selectionConstraintKind: 'ROTATE',
      senderPoolFingerprint: digest('4'),
      campaignId,
      enrollmentId,
      occurrenceId,
      authorizationId,
      workflowVersionId,
      messageId,
      attemptNumber: 1,
      renderDigest: digest('5'),
      reservationEvidence: { kind: 'CAMPAIGN_SEQUENCE_RESERVATION' },
    } as ReserveOutboundEmailAttemptInput;
    const competingSequenceInput = {
      ...sequenceInput,
      attemptId: directAttemptId,
      authorizationId: competingAuthorizationId,
      campaignId: competingCampaignId,
      enrollmentId: competingEnrollmentId,
      occurrenceId: competingOccurrenceId,
      workflowVersionId: competingWorkflowVersionId,
      messageId: competingMessageId,
      attemptNumber: 1,
    } as ReserveOutboundEmailAttemptInput;
    const service = new OutboundEmailAttemptService(
      new MailboxCapacityService(),
    );
    const first = serviceDataSource.createQueryRunner();
    const second = serviceDataSource.createQueryRunner();
    let competitor: Promise<unknown> | undefined;
    try {
      await Promise.all([first.connect(), second.connect()]);
      await boundFixtureConnections([first, second]);
      const [[firstPid], [secondPid]] = (await Promise.all([
        first.query('SELECT pg_backend_pid() AS pid'),
        second.query('SELECT pg_backend_pid() AS pid'),
      ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
      await Promise.all([first.startTransaction(), second.startTransaction()]);
      const directCapacity =
        await new MailboxCapacityService().lockAndRankForReservation(
          {
            candidates: [sender],
            selectionConstraint: { kind: 'ROTATE' },
            workspaceId,
            workspaceTimeZone: 'UTC',
          },
          first.manager,
        );
      expect(directCapacity.status).toBe('ELIGIBLE_NOW');
      const winner = await service.reserveWithMailboxCapacity(
        sequenceInput,
        first.manager,
      );
      if (winner.status !== 'RESERVED') {
        throw new Error(`Unexpected reservation: ${JSON.stringify(winner)}`);
      }
      const expectedCapacityClock = new Date(
        winner.receipt.slotAt.getTime() + sender.minimumSendIntervalMs,
      );
      competitor = service.reserveWithMailboxCapacity(
        competingSequenceInput,
        second.manager,
      );
      await waitUntilBlockedOnLock(secondPid.pid, firstPid.pid);
      await first.commitTransaction();
      await expect(competitor).resolves.toMatchObject({ status: 'NOT_READY' });
      expect(
        await second.query(
          `SELECT "nextEligibleAt" FROM core."mailboxDispatchClock"
            WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
          [workspaceId, accountId],
        ),
      ).toEqual([{ nextEligibleAt: expectedCapacityClock }]);
      await second.commitTransaction();
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      if (competitor !== undefined) await Promise.allSettled([competitor]);
      if (second.isTransactionActive) await second.rollbackTransaction();
      await Promise.all([first.release(), second.release()]);
    }
    expect(
      await global.testDataSource.query(
        `SELECT "attemptId" FROM core."outboundEmailAttempt"
          WHERE "attemptId" = ANY($1) ORDER BY "attemptId"`,
        [[sequenceAttemptId, directAttemptId]],
      ),
    ).toEqual([{ attemptId: sequenceAttemptId }]);
    expect(
      await global.testDataSource.query(
        `SELECT "acceptedCount", "reservedCount" FROM core."mailboxCapacityDay"
          WHERE "workspaceId" = $1 AND "connectedAccountId" = $2 AND "localDate" = $3`,
        [workspaceId, accountId, sample.localDate],
      ),
    ).toEqual([{ acceptedCount: 49, reservedCount: 1 }]);
    expect(
      await global.testDataSource.query(
        `SELECT (SELECT COUNT(*) FROM core."outboundEmailAttempt" WHERE "attemptId"=ANY($3))::integer AS attempts,
                c."nextEligibleAt" IS NOT NULL AS "hasClock"
          FROM core."mailboxDispatchClock" c WHERE c."workspaceId"=$1 AND c."connectedAccountId"=$2`,
        [workspaceId, accountId, [sequenceAttemptId, directAttemptId]],
      ),
    ).toEqual([{ attempts: 1, hasClock: true }]);

    await global.testDataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='DEFINITELY_UNACCEPTED',"capacityState"='RELEASED'
        WHERE "attemptId"=$1`,
      [sequenceAttemptId],
    );
    await global.testDataSource.query(
      `UPDATE core."mailboxCapacityDay" SET "reservedCount"="reservedCount"-1
        WHERE "workspaceId"=$1 AND "connectedAccountId"=$2 AND "localDate"=$3`,
      [workspaceId, accountId, sample.localDate],
    );
    const spacingAccountId = randomUUID();
    const spacingChannelId = randomUUID();
    const spacingSender = {
      ...sender,
      connectedAccountId: spacingAccountId,
      dailySendLimit: 100,
      messageChannelId: spacingChannelId,
      minimumSendIntervalMs: 300_000,
    };
    const directReservation = (source: 'INBOX' | 'AUTOMATED_REPLY') => {
      const capabilityId = randomUUID();
      return {
        attemptId: randomUUID(),
        workspaceId,
        connectedAccountId: spacingAccountId,
        messageChannelId: spacingChannelId,
        provider: 'google',
        normalizedSenderHandle: 'sender@example.com',
        normalizedRecipient: 'recipient@example.com',
        priorAcceptedEvidenceId: null,
        workspaceTimeZone: 'UTC',
        candidates: [spacingSender],
        source,
        selectionConstraintKind: 'EXPLICIT',
        directReservationCapabilityId: capabilityId,
        reservationEvidence: {
          kind: 'DIRECT_RESERVATION_CAPABILITY',
          directReservationCapabilityId: capabilityId,
        },
      } as ReserveOutboundEmailAttemptInput;
    };
    const spacingWinnerInput = {
      ...sequenceInput,
      attemptId: randomUUID(),
      attemptNumber: 2,
      candidates: [spacingSender],
      connectedAccountId: spacingAccountId,
      messageChannelId: spacingChannelId,
    } as ReserveOutboundEmailAttemptInput;
    const spacingLoserInput = directReservation('INBOX');
    const spacingFirst = serviceDataSource.createQueryRunner();
    const spacingSecond = serviceDataSource.createQueryRunner();
    let spacingLoser: Promise<unknown> | undefined;
    try {
      await Promise.all([spacingFirst.connect(), spacingSecond.connect()]);
      await boundFixtureConnections([spacingFirst, spacingSecond]);
      const [[spacingFirstPid], [spacingSecondPid]] = (await Promise.all([
        spacingFirst.query('SELECT pg_backend_pid() AS pid'),
        spacingSecond.query('SELECT pg_backend_pid() AS pid'),
      ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
      await Promise.all([
        spacingFirst.startTransaction(),
        spacingSecond.startTransaction(),
      ]);
      const spacingWinner = await service.reserveWithMailboxCapacity(
        spacingWinnerInput,
        spacingFirst.manager,
      );
      if (spacingWinner.status !== 'RESERVED')
        throw new Error(`Unexpected spacing winner ${spacingWinner.status}`);
      const expectedSpacingClock = new Date(
        spacingWinner.receipt.slotAt.getTime() +
          spacingSender.minimumSendIntervalMs,
      );
      spacingLoser = service.reserveWithMailboxCapacity(
        spacingLoserInput,
        spacingSecond.manager,
      );
      await waitUntilBlockedOnLock(spacingSecondPid.pid, spacingFirstPid.pid);
      await spacingFirst.commitTransaction();
      const loserResult = await spacingLoser;
      expect(loserResult).toMatchObject({
        status: 'NOT_READY',
        nextEligibleAt: expectedSpacingClock,
      });
      const [winnerClock] = await spacingSecond.query(
        `SELECT "nextEligibleAt" FROM core."mailboxDispatchClock"
          WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
        [workspaceId, spacingAccountId],
      );
      expect(winnerClock.nextEligibleAt).toEqual(expectedSpacingClock);
      await spacingSecond.commitTransaction();
    } finally {
      if (spacingFirst.isTransactionActive)
        await spacingFirst.rollbackTransaction();
      if (spacingLoser !== undefined) await Promise.allSettled([spacingLoser]);
      if (spacingSecond.isTransactionActive)
        await spacingSecond.rollbackTransaction();
      await Promise.all([spacingFirst.release(), spacingSecond.release()]);
    }
    expect(
      await global.testDataSource.query(
        `SELECT (SELECT COUNT(*) FROM core."outboundEmailAttempt" WHERE "connectedAccountId"=$2)::integer AS attempts,
                (SELECT "reservedCount" FROM core."mailboxCapacityDay" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2)::integer AS reservations`,
        [workspaceId, spacingAccountId],
      ),
    ).toEqual([{ attempts: 1, reservations: 1 }]);
    const conflictAccountId = randomUUID();
    const conflictChannelId = randomUUID();
    const conflictInput = {
      ...directReservation('INBOX'),
      attemptId: randomUUID(),
      candidates: [
        {
          ...spacingSender,
          connectedAccountId: conflictAccountId,
          messageChannelId: conflictChannelId,
          minimumSendIntervalMs: 0,
        },
      ],
      connectedAccountId: conflictAccountId,
      messageChannelId: conflictChannelId,
    } as ReserveOutboundEmailAttemptInput;
    const conflictRunner = serviceDataSource.createQueryRunner();
    await conflictRunner.connect();
    await conflictRunner.startTransaction();
    try {
      await expect(
        service.reserveWithMailboxCapacity(
          conflictInput,
          conflictRunner.manager,
        ),
      ).resolves.toMatchObject({ status: 'RESERVED' });
      await expect(
        conflictRunner.query(
          `INSERT INTO core."mailboxCapacityDay" ("workspaceId","connectedAccountId","localDate")
           SELECT "workspaceId","connectedAccountId","localDate" FROM core."mailboxCapacityDay"
           WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
          [workspaceId, conflictAccountId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      if (conflictRunner.isTransactionActive)
        await conflictRunner.rollbackTransaction();
      await conflictRunner.release();
    }
    expect(
      await global.testDataSource.query(
        `SELECT
          (SELECT COUNT(*) FROM core."outboundEmailAttempt" WHERE "attemptId"=$3)::integer AS attempts,
          (SELECT COUNT(*) FROM core."mailboxCapacityDay" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2)::integer AS days,
          (SELECT COUNT(*) FROM core."mailboxDispatchClock" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2)::integer AS clocks`,
        [workspaceId, conflictAccountId, conflictInput.attemptId],
      ),
    ).toEqual([{ attempts: 0, days: 0, clocks: 0 }]);
  });

  it('round-trips reviewed down/up catalog exactly and restores durable history on rollback', async () => {
    const runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const originalCatalog = await readNormalizedCampaignCatalog((sql) =>
        runner.query(sql),
      );
      const unaffectedCatalog = await readUnaffectedParentCatalog((sql) =>
        runner.query(sql),
      );
      const historyAccountId = randomUUID();
      await runner.query(
        `INSERT INTO core."mailboxCapacityDay" ("workspaceId","connectedAccountId","localDate")
         VALUES ($1,$2,'2041-01-01')`,
        [workspaceId, historyAccountId],
      );
      await runner.query(
        `INSERT INTO core."mailboxDispatchClock" ("workspaceId","connectedAccountId") VALUES ($1,$2)`,
        [workspaceId, historyAccountId],
      );
      await runner.commitTransaction();
      await runner.startTransaction();
      const historyBefore = await readOwnedRows(
        (sql) => runner.query(sql),
        workspaceId,
      );
      const [{ rows: nonemptyHistory }] = historyBefore as Array<{
        rows: Record<string, unknown[] | null>;
      }>;
      expect(
        Object.values(nonemptyHistory).every((rows) => (rows?.length ?? 0) > 0),
      ).toBe(true);
      await runner.query(
        'CREATE TABLE core.w13_unrelated_catalog_probe (id integer PRIMARY KEY, note text NOT NULL)',
      );
      await runner.query(
        `INSERT INTO core.w13_unrelated_catalog_probe VALUES (7, 'retained')`,
      );
      const probeCatalog = await runner.query(
        `SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull)
          ORDER BY a.attnum) AS definition FROM pg_attribute a
          WHERE a.attrelid='core.w13_unrelated_catalog_probe'::regclass AND a.attnum>0 AND NOT a.attisdropped`,
      );
      const command =
        new CreateCampaignExecutionAuthorityFoundationFastInstanceCommand();
      const dispatchEvidenceCommand =
        new AddCampaignDispatchEvidenceFastInstanceCommand();
      await dispatchEvidenceCommand.down(runner);
      await command.down(runner);
      expect(
        await runner.query(`SELECT * FROM core.w13_unrelated_catalog_probe`),
      ).toEqual([{ id: 7, note: 'retained' }]);
      const [absent] = await runner.query(
        `SELECT
          COUNT(*) FILTER (WHERE to_regclass(name) IS NOT NULL)::integer AS "tableCount",
          to_regprocedure('core.campaign_sequence_authorization_immutable_guard()') IS NOT NULL AS "hasCsaFunction",
          to_regprocedure('core.campaign_test_preparation_proof_immutable_guard()') IS NOT NULL AS "hasCtpFunction",
          (SELECT COUNT(*)::integer FROM information_schema.columns WHERE table_schema = 'core' AND (
            (table_name = 'workspace' AND column_name = 'campaignCapacityTimeZone') OR
            (table_name = 'connectedAccount' AND column_name IN ('dailySendLimit','minimumSendIntervalMs')))) AS "policyColumnCount",
          (SELECT COUNT(*)::integer FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'core' AND t.typname LIKE 'campaignSequenceAuthorization%') AS "enumCount"
        FROM unnest($1::text[]) name`,
        [TABLES.map((table) => `core."${table}"`)],
      );
      expect(absent).toEqual({
        tableCount: 0,
        hasCsaFunction: false,
        hasCtpFunction: false,
        policyColumnCount: 0,
        enumCount: 0,
      });
      expect(
        await readUnaffectedParentCatalog((sql) => runner.query(sql)),
      ).toEqual(unaffectedCatalog);
      await command.up(runner);
      await dispatchEvidenceCommand.up(runner);
      expect(
        await runner.query(
          `SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull)
            ORDER BY a.attnum) AS definition FROM pg_attribute a
            WHERE a.attrelid='core.w13_unrelated_catalog_probe'::regclass AND a.attnum>0 AND NOT a.attisdropped`,
        ),
      ).toEqual(probeCatalog);
      expect(
        await readNormalizedCampaignCatalog((sql) => runner.query(sql)),
      ).toEqual(originalCatalog);
      expect(
        await readUnaffectedParentCatalog((sql) => runner.query(sql)),
      ).toEqual(unaffectedCatalog);
      expect(
        await runner.query(
          `SELECT COUNT(*)::integer AS count FROM core."campaignExecution" WHERE "workspaceId" = '${workspaceId}'`,
        ),
      ).toEqual([{ count: 0 }]);
      await runner.rollbackTransaction();
      expect(
        await readOwnedRows(
          (sql) => global.testDataSource.query(sql),
          workspaceId,
        ),
      ).toEqual(historyBefore);
      expect(
        await global.testDataSource.query(
          `SELECT to_regclass('core.w13_unrelated_catalog_probe')::text AS name`,
        ),
      ).toEqual([{ name: null }]);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
