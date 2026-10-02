import { type EntityManager } from 'typeorm';

/** Credential/account reconnect changes the incarnation, not the stored evidence.
 * Run in the credential update transaction so no old READY generation remains
 * current after a successful reconnect. Absent reply-only schema is inert.
 */
export const invalidateCampaignEmailBaselineInTransaction = async (
  manager: EntityManager,
  workspaceId: string,
  connectedAccountId: string,
): Promise<void> => {
  // The account row serializes credential changes, remote-scan snapshots and
  // READY finalization. Rotating even without a current baseline fences an
  // enumeration that began before this reconnect/reset.
  const accounts: Array<{ id: string }> = await manager.query(
    `SELECT "id" FROM core."connectedAccount" WHERE "id" = $1 AND "workspaceId" = $2 FOR UPDATE`,
    [connectedAccountId, workspaceId],
  );
  if (!accounts.length) return;
  const [column]: Array<{ hasIncarnation: boolean }> = await manager.query(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'core."connectedAccount"'::regclass
      AND attname = 'campaignEmailIncarnationId' AND NOT attisdropped) AS "hasIncarnation"`,
  );
  if (column?.hasIncarnation) {
    await manager.query(
      `UPDATE core."connectedAccount" SET "campaignEmailIncarnationId" = uuid_generate_v4()
       WHERE "id" = $1 AND "workspaceId" = $2`,
      [connectedAccountId, workspaceId],
    );
  }
  const [schema]: [{ tableName: string | null }] = await manager.query(
    `SELECT to_regclass('core."campaignEmailBaselineGeneration"') AS "tableName"`,
  );
  if (!schema?.tableName) return;

  await manager.query(
    `UPDATE core."campaignEmailBaselineGeneration"
      SET "status" = 'INVALID', "isCurrent" = false
      WHERE "workspaceId" = $1 AND "connectedAccountId" = $2
        AND "isCurrent" = true`,
    [workspaceId, connectedAccountId],
  );
};
