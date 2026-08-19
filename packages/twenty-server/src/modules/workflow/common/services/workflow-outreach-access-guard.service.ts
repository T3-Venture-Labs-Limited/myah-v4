import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type CustomWorkspaceEntity } from 'src/engine/twenty-orm/custom.workspace-entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';

@Injectable()
export class WorkflowOutreachAccessGuardService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assertWorkflowIsAccessible({
    authContext,
    workflowId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    const outreachCampaignId = await this.getOutreachCampaignId({
      sourceTable: 'workflow',
      sourceId: workflowId,
      workspaceId,
    });

    await this.assertOutreachCampaignIsAccessible({
      authContext,
      outreachCampaignId,
      workspaceId,
    });
  }

  async assertWorkflowVersionIsAccessible({
    authContext,
    workflowVersionId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    workflowVersionId: string;
    workspaceId: string;
  }): Promise<void> {
    const outreachCampaignId = await this.getOutreachCampaignId({
      sourceTable: 'workflowVersion',
      sourceId: workflowVersionId,
      workspaceId,
    });

    await this.assertOutreachCampaignIsAccessible({
      authContext,
      outreachCampaignId,
      workspaceId,
    });
  }

  async assertWorkflowRunIsAccessible({
    authContext,
    workflowRunId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    workflowRunId: string;
    workspaceId: string;
  }): Promise<void> {
    const outreachCampaignId = await this.getOutreachCampaignId({
      sourceTable: 'workflowRun',
      sourceId: workflowRunId,
      workspaceId,
    });

    await this.assertOutreachCampaignIsAccessible({
      authContext,
      outreachCampaignId,
      workspaceId,
    });
  }

  private async getOutreachCampaignId({
    sourceId,
    sourceTable,
    workspaceId,
  }: {
    sourceId: string;
    sourceTable: 'workflow' | 'workflowRun' | 'workflowVersion';
    workspaceId: string;
  }): Promise<string | null | undefined> {
    const workspaceDataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const workflowJoin =
      sourceTable === 'workflow'
        ? ''
        : `INNER JOIN "${workspaceSchemaName}"."workflow" workflow
             ON workflow.id = source."workflowId"`;
    const outreachCampaignIdSelect =
      sourceTable === 'workflow'
        ? 'source."outreachCampaignId"'
        : 'workflow."outreachCampaignId"';
    const rows = await workspaceDataSource.query<
      Array<{ outreachCampaignId: string | null }>
    >(
      `SELECT ${outreachCampaignIdSelect} AS "outreachCampaignId"
       FROM "${workspaceSchemaName}"."${sourceTable}" source
       ${workflowJoin}
       WHERE source.id = $1
       LIMIT 1`,
      [sourceId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    return rows[0]?.outreachCampaignId;
  }

  private async assertOutreachCampaignIsAccessible({
    authContext,
    outreachCampaignId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    outreachCampaignId: string | null | undefined;
    workspaceId: string;
  }): Promise<void> {
    if (!isDefined(outreachCampaignId)) {
      return;
    }

    const effectiveAuthContext = authContext ?? getWorkspaceAuthContext();

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workspaceContext = getWorkspaceContext();
      const rolePermissionConfig = resolveRolePermissionConfig({
        apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        authContext: workspaceContext.authContext,
        userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      });
      const campaignRepository =
        await this.globalWorkspaceOrmManager.getRepository<CustomWorkspaceEntity>(
          workspaceId,
          'campaign',
          rolePermissionConfig ?? undefined,
        );
      const campaign = await campaignRepository.findOne({
        where: { id: outreachCampaignId },
      });

      if (!isDefined(campaign)) {
        throw new WorkflowQueryValidationException(
          'Campaign Outreach workflow is not accessible',
          WorkflowQueryValidationExceptionCode.FORBIDDEN,
        );
      }
    }, effectiveAuthContext);
  }
}
