import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

export const readCampaignCreatorManagedMailboxId = async (
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  workspaceId: string,
  campaignCreatorId: string,
): Promise<string | null> => {
  const dataSource =
    await globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
  const rows = await dataSource.query<
    Array<{ assignedManagedMailboxId: string | null }>
  >(
    `SELECT "assignedManagedMailboxId"
       FROM "${getWorkspaceSchemaName(workspaceId)}"."campaignCreator"
      WHERE "id" = $1
      LIMIT 1`,
    [campaignCreatorId],
    undefined,
    { shouldBypassPermissionChecks: true },
  );

  if (rows.length !== 1) {
    throw new Error('Campaign Creator was not found in this workspace');
  }

  return rows[0].assignedManagedMailboxId;
};
