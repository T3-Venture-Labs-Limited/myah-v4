# Twenty cursor-safe Instagram approval recovery

## Problem

Production's last persisted upgrade cursor is the failed `2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001`. The Instagram approval request table is absent. PR #28 moved that same command to the normal slow-instance segment, but `UpgradeSequenceRunnerService` resumes at the persisted failed command and skips preceding recovery commands. The binding command then runs `ALTER TABLE` against the missing table, startup aborts, and Railway cannot reach `/healthz`.

## Decision

Keep the fail-closed entrypoint and the existing persisted cursor. Make the failed provider-binding command recover its schema prerequisite idempotently before altering it.

Extract the existing approval-schema creation SQL from `PendingMigrationCheckFastInstanceCommand` into a focused helper. Both the pending-check command and the provider-binding command call that helper. The provider-binding command then adds its provider columns as it does today.

## Constraints

- No Railway configuration, deployment, database, or cursor mutation is part of this change.
- No startup bypass, warning-only upgrade path, or direct production SQL.
- Do not duplicate the approval-table DDL.
- Preserve successful fresh-install and already-upgraded paths.

## Data flow

1. The normal runner resumes at the recorded failed provider-binding command.
2. The provider-binding command first ensures the approval request/receipt enums, tables, indexes, and workspace foreign key exist.
3. It adds the provider-binding columns with idempotent DDL.
4. The command records completion; the normal sequence proceeds to workspace commands.
5. A later invocation sees the completed cursor and skips safely.

## Tests and verification

Add a regression matching the production state: provider-binding cursor failed, approval schema absent, and one active workspace. Assert the resumed flow creates the schema before provider binding and advances successfully. Run the focused Jest suite in RED then GREEN. Run a disposable PostgreSQL smoke twice and confirm both approval tables, provider columns, and the foreign key. Build the production Twenty Docker target before opening a PR.

## Scope stop

This does not redesign the generic upgrade runner to backfill arbitrary prerequisites inserted before historical cursors. That broader behavior remains a separate design problem after production recovery is complete.
