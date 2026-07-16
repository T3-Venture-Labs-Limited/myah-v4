# Twenty Cursor-Safe Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover a server whose persisted 2.19.0 provider-binding upgrade attempt failed before the Instagram approval schema existed, without weakening the startup failure gate or mutating Railway.

**Architecture:** Extract the existing seven idempotent schema statements from the pending-check command into a local 2.19 helper. The provider-binding command invokes that helper with its existing `QueryRunner` before creating its two `text` provider columns; the pending-check command invokes exactly the same helper. A real PostgreSQL integration test seeds the exact failed instance and workspace cursors and proves the runner completes recovery and does not re-run on the following invocation.

**Tech Stack:** NestJS, TypeORM `QueryRunner`, PostgreSQL, Jest, existing Twenty upgrade integration harness.

## Global Constraints

- Do not mutate Railway configuration, deployments, databases, or persisted cursors outside the test database.
- Preserve the entrypoint’s fatal upgrade failure behavior; no bypass, warning-only path, or direct production SQL.
- Use one shared idempotent schema helper; do not duplicate approval schema DDL.
- Preserve fresh-install and already-upgraded paths.
- Use canonical PostgreSQL `text` for `providerConversationId` and `recipientIgsid` when they are first created.
- The recovery regression must use the actual `UpgradeSequenceRunnerService`, `InstanceCommandRunnerService`, PostgreSQL database, and production provider-binding command.

---

### Task 1: Extract the idempotent approval-schema prerequisite and make provider binding self-recovering

**Files:**
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/ensure-instagram-reply-approval-schema.ts`
- Modify: `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112688976-pending-migration-check.ts:1-45`
- Modify: `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding.ts:1-31`
- Modify: `packages/twenty-server/src/database/commands/__tests__/run-instance-commands.command.spec.ts:1-139`

**Interfaces:**
- Produces: `ensureInstagramReplyApprovalSchema(queryRunner: QueryRunner): Promise<void>`.
- Consumes: the caller-owned `QueryRunner`; the helper neither opens nor commits a transaction.
- Guarantees: approval request/receipt enums, tables, indexes, and `core.workspace` foreign key exist before provider-column DDL executes.

- [ ] **Step 1: Write the failing unit tests for shared prerequisite ordering and canonical types**

  Replace the provider-binding assertion with an assertion for nine calls: the seven prerequisite statements first, then the two provider columns. Keep the pending-check test, but assert it makes the same seven prerequisite calls through the helper.

  ```ts
  expect(query).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining(
      'CREATE TABLE IF NOT EXISTS "core"."instagramReplyApprovalRequest"',
    ),
  );
  expect(query).toHaveBeenNthCalledWith(
    8,
    'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text',
  );
  expect(query).toHaveBeenNthCalledWith(
    9,
    'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text',
  );
  expect(query).toHaveBeenCalledTimes(9);
  ```

- [ ] **Step 2: Run the focused unit test and verify RED**

  Run:

  ```bash
  yarn nx test twenty-server --runInBand --testPathPattern=run-instance-commands.command.spec.ts
  ```

  Expected: the provider-binding test fails because current production code calls only two `character varying` DDL statements.

- [ ] **Step 3: Create the shared helper by moving—not copying—the seven existing statements**

  Create `ensure-instagram-reply-approval-schema.ts` with this interface and move the exact seven `queryRunner.query()` statements currently in `PendingMigrationCheckFastInstanceCommand.up()` into its body, preserving their order and SQL verbatim:

  ```ts
  import { type QueryRunner } from 'typeorm';

  export const ensureInstagramReplyApprovalSchema = async (
    queryRunner: QueryRunner,
  ): Promise<void> => {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "core"."instagramReplyApprovalRequest_state_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$`,
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS "core"."instagramReplyApprovalRequest" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userWorkspaceId" uuid NOT NULL, "threadId" uuid NOT NULL, "approvalId" uuid NOT NULL, "toolName" character varying NOT NULL, "connectedAccountId" character varying NOT NULL, "draftId" uuid NOT NULL, "conversationId" uuid NOT NULL, "previewTextSha256" character varying(64) NOT NULL, "state" "core"."instagramReplyApprovalRequest_state_enum" NOT NULL DEFAULT \'PENDING\', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID" UNIQUE ("workspaceId", "approvalId"), CONSTRAINT "PK_0570e6a0a7170ee067a969dcf27" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON "core"."instagramReplyApprovalRequest" ("workspaceId", "threadId")',
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "core"."instagramReplyExecutionReceipt_state_enum" AS ENUM('PROCESSING', 'SENT', 'FAILED', 'BLOCKED', 'UNKNOWN');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$`,
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS "core"."instagramReplyExecutionReceipt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approvalRequestId" uuid NOT NULL, "state" "core"."instagramReplyExecutionReceipt_state_enum" NOT NULL DEFAULT \'PROCESSING\', "providerMessageId" text, "failureCode" text, "failureReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST" UNIQUE ("approvalRequestId"), CONSTRAINT "PK_1ecd8d74d2ebde2854db62b469e" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON "core"."instagramReplyExecutionReceipt" ("state")',
    );
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "core"."instagramReplyApprovalRequest" ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$`,
    );
  };
  ```

  In the pending-check command, replace the inlined body with:

  ```ts
  import { ensureInstagramReplyApprovalSchema } from './ensure-instagram-reply-approval-schema';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await ensureInstagramReplyApprovalSchema(queryRunner);
  }
  ```

  In the provider-binding command, invoke that same helper before its DDL and change both creation statements to canonical `text`:

  ```ts
  await ensureInstagramReplyApprovalSchema(queryRunner);
  await queryRunner.query(
    'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "providerConversationId" text',
  );
  await queryRunner.query(
    'ALTER TABLE "core"."instagramReplyApprovalRequest" ADD COLUMN IF NOT EXISTS "recipientIgsid" text',
  );
  ```

  Do not change `down()` or command registration metadata.

- [ ] **Step 4: Run the focused unit test and verify GREEN**

  Run:

  ```bash
  yarn nx test twenty-server --runInBand --testPathPattern=run-instance-commands.command.spec.ts
  ```

  Expected: PASS; provider binding makes the seven prerequisite calls before the two `text` DDL calls, and pending-check still performs all seven prerequisite calls.

- [ ] **Step 5: Commit the focused schema-recovery change**

  ```bash
  git add \
    packages/twenty-server/src/database/commands/upgrade-version-command/2-19/ensure-instagram-reply-approval-schema.ts \
    packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112688976-pending-migration-check.ts \
    packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding.ts \
    packages/twenty-server/src/database/commands/__tests__/run-instance-commands.command.spec.ts
  git commit -m "fix: recover approval schema at provider binding"
  ```

### Task 2: Reproduce the persisted failed cursor in PostgreSQL and prove replay is safe

**Files:**
- Create: `packages/twenty-server/test/integration/upgrade/suites/sequence-runner/instagram-reply-approval-provider-binding-recovery.integration-spec.ts`
- Reuse without modification: `packages/twenty-server/test/integration/upgrade/utils/upgrade-sequence-runner-integration-test.util.ts`

**Interfaces:**
- Consumes: `createUpgradeSequenceRunnerIntegrationTestModule`, `seedInstanceMigration`, `setMockActiveWorkspaceIds`, `testGetExecutedMigrationsInOrder`, and `WS_1`.
- Consumes: `AddInstagramReplyApprovalProviderBindingSlowInstanceCommand` as the actual recovery command.
- Produces: a regression that verifies exact failed attempt-one state becomes completed attempt-two state and a second run appends no attempt-three rows.

- [ ] **Step 1: Write the failing real PostgreSQL recovery regression**

  Create the integration suite. In `beforeEach`, remove the approval schema in dependency order, clear migration records, restore the seed counter, and mark `WS_1` active:

  ```ts
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."instagramReplyExecutionReceipt" CASCADE',
  );
  await context.dataSource.query(
    'DROP TABLE IF EXISTS core."instagramReplyApprovalRequest" CASCADE',
  );
  await context.dataSource.query(
    'DROP TYPE IF EXISTS core."instagramReplyExecutionReceipt_state_enum"',
  );
  await context.dataSource.query(
    'DROP TYPE IF EXISTS core."instagramReplyApprovalRequest_state_enum"',
  );
  await context.dataSource.query('DELETE FROM core."upgradeMigration"');
  resetSeedSequenceCounter();
  setMockActiveWorkspaceIds([WS_1]);
  ```

  Use these exact steps and seed state:

  ```ts
  const providerBindingName =
    '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001';
  const workspaceReplayName = '2.19.0_TestWorkspaceReplay_1784113000000';
  const sequence: UpgradeStep[] = [
    {
      kind: 'slow-instance',
      name: providerBindingName,
      version: '2.19.0',
      timestamp: 1784106536001,
      command: new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand(),
    } as unknown as UpgradeStep,
    {
      kind: 'workspace',
      name: workspaceReplayName,
      version: '2.19.0',
      timestamp: 1784113000000,
      command: { runOnWorkspace: async () => {} },
    } as unknown as UpgradeStep,
  ];
  await seedInstanceMigration(context.dataSource, {
    name: providerBindingName,
    status: 'failed',
    workspaceIds: [WS_1],
  });
  ```

  Run `context.runner.run({ sequence, options: DEFAULT_OPTIONS })`; assert success and assert the exact migration record order:

  ```ts
  expect(executed.map(migrationRecordToKey)).toStrictEqual([
    `${providerBindingName}:instance:failed:1`,
    `${providerBindingName}:${WS_1}:failed:1`,
    `${providerBindingName}:instance:completed:2`,
    `${providerBindingName}:${WS_1}:completed:2`,
    `${workspaceReplayName}:${WS_1}:completed:1`,
  ]);
  ```

  Also query `information_schema.columns` and assert the two provider columns both have `data_type === 'text'`; assert both approval tables exist through `to_regclass`; assert the workspace FK exists through `pg_constraint`. Run the same runner call a second time and assert the migration-record list is unchanged.

- [ ] **Step 2: Run the new integration test and verify RED**

  Run:

  ```bash
  yarn nx test:integration twenty-server --testPathPattern=instagram-reply-approval-provider-binding-recovery.integration-spec.ts --runInBand
  ```

  Expected: FAIL before Task 1 implementation because the actual provider-binding command attempts `ALTER TABLE` while the approval-request table is absent.

- [ ] **Step 3: Run the new integration test after Task 1 and verify GREEN**

  Run:

  ```bash
  yarn nx test:integration twenty-server --testPathPattern=instagram-reply-approval-provider-binding-recovery.integration-spec.ts --runInBand
  ```

  Expected: PASS; PostgreSQL contains both approval tables, the workspace foreign key, and `text` provider columns; first recovery writes completed attempt-two records and the second invocation writes no third attempt.

- [ ] **Step 4: Commit the production-state regression**

  ```bash
  git add packages/twenty-server/test/integration/upgrade/suites/sequence-runner/instagram-reply-approval-provider-binding-recovery.integration-spec.ts
  git commit -m "test: cover failed provider binding recovery"
  ```

### Task 3: Verify the production build boundary

**Files:**
- Modify: none.

**Interfaces:**
- Consumes: Task 1 implementation and Task 2 passing PostgreSQL regression.
- Produces: build evidence that the server source compiles in the target used by Railway.

- [ ] **Step 1: Run both focused test suites together**

  ```bash
  yarn nx test twenty-server --runInBand --testPathPattern=run-instance-commands.command.spec.ts
  yarn nx test:integration twenty-server --testPathPattern=instagram-reply-approval-provider-binding-recovery.integration-spec.ts --runInBand
  ```

  Expected: both commands PASS.

- [ ] **Step 2: Build the Railway production Docker target**

  ```bash
  docker build --target production -f packages/twenty-docker/twenty/Dockerfile .
  ```

  Expected: exit status 0; no TypeScript compilation or Docker-stage error.

- [ ] **Step 3: Commit only if verification required source adjustments**

  ```bash
  git status --short
  ```

  Expected: no uncommitted source changes. If a verification-driven source correction is necessary, add its focused test and source files together and commit with `fix: preserve cursor-safe approval recovery`.

## Self-Review

- **Spec coverage:** Task 1 implements one shared idempotent helper, preserves the fatal path and registration metadata, and changes newly created provider columns to `text`. Task 2 uses actual runner/services/command and real PostgreSQL, seeds failed instance and active-workspace attempt-one rows, proves provider recovery and workspace replay, validates database objects and types, and proves no third attempt. Task 3 proves focused tests and production-target build. No Railway mutation is planned.
- **Placeholder scan:** No deferred work, generic validation, or undefined implementation steps are present. The only comments in code blocks identify the fixed seven-statement extraction order.
- **Type consistency:** `ensureInstagramReplyApprovalSchema` has one `QueryRunner` argument in both command callers. The integration test’s `providerBindingName` is the registered command identity, the exact persisted production cursor, and the seeded migration name.
