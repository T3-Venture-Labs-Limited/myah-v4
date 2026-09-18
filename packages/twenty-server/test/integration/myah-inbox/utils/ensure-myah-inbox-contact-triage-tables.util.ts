import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';

/**
 * Provisions the private contact-triage relations for a workspace and marks the
 * migration READY, using the same services as the 2.20 upgrade command and the
 * workspace initializer rather than duplicating their DDL.
 *
 * Integration shards reset and seed the database but never run the upgrade, so
 * a suite that exercises contact-wide triage must provision what it depends on
 * instead of inheriting another suite's side effects. Both steps are idempotent,
 * so calling this for an already-provisioned workspace is a no-op.
 */
export const ensureMyahInboxContactTriageTables = async (
  workspaceId: string,
): Promise<void> => {
  const runner = global.testDataSource.createQueryRunner();

  await runner.connect();
  await runner.startTransaction();
  try {
    const triageSchema = new MyahInboxContactTriageSchemaService();

    await triageSchema.ensureWorkspaceTables(runner, workspaceId);
    await triageSchema.initializeNewWorkspaceInTransaction(runner, workspaceId);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
};
