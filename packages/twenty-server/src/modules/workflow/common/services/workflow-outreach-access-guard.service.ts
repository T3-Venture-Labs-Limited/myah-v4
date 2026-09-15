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

  async assertGenericWorkflowMutationAllowed({
    workflowId,
    workspaceId,
  }: {
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.assertGenericMutationAllowed({
      sourceTable: 'workflow',
      sourceId: workflowId,
      workspaceId,
    });
  }

  async assertGenericWorkflowVersionMutationAllowed({
    workflowVersionId,
    workspaceId,
  }: {
    workflowVersionId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.assertGenericMutationAllowed({
      sourceTable: 'workflowVersion',
      sourceId: workflowVersionId,
      workspaceId,
    });
  }

  async assertLegacyCampaignWorkflowVersionReplacementAllowed({
    workflowVersionId,
    workspaceId,
  }: {
    workflowVersionId: string;
    workspaceId: string;
  }): Promise<void> {
    const workspaceDataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const rows = await workspaceDataSource.query<
      Array<{
        campaignSequence: unknown | null;
        outreachCampaignId: string | null;
      }>
    >(
      `SELECT source."campaignSequence", workflow."outreachCampaignId"
         FROM "${workspaceSchemaName}"."workflowVersion" source
         INNER JOIN "${workspaceSchemaName}"."workflow" workflow
           ON workflow.id = source."workflowId"
        WHERE source.id = $1
        LIMIT 1`,
      [workflowVersionId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    const [ownership] = rows;

    if (
      !ownership ||
      !isDefined(ownership.outreachCampaignId) ||
      ownership.campaignSequence !== null
    ) {
      throw new WorkflowQueryValidationException(
        'Only a legacy Campaign sequence version can use the replacement lifecycle.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }

  async assertLegacyCampaignWorkflowRunReplacementAllowed({
    workflowRunId,
    workspaceId,
  }: {
    workflowRunId: string;
    workspaceId: string;
  }): Promise<void> {
    const workspaceDataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const rows = await workspaceDataSource.query<
      Array<{
        campaignSequence: unknown | null;
        outreachCampaignId: string | null;
      }>
    >(
      `SELECT version."campaignSequence", workflow."outreachCampaignId"
         FROM "${workspaceSchemaName}"."workflowRun" source
         INNER JOIN "${workspaceSchemaName}"."workflowVersion" version
           ON version.id = source."workflowVersionId"
         INNER JOIN "${workspaceSchemaName}"."workflow" workflow
           ON workflow.id = source."workflowId"
        WHERE source.id = $1
        LIMIT 1`,
      [workflowRunId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    const [ownership] = rows;

    if (
      !ownership ||
      !isDefined(ownership.outreachCampaignId) ||
      ownership.campaignSequence !== null
    ) {
      throw new WorkflowQueryValidationException(
        'Only a run of a legacy Campaign sequence can use the replacement lifecycle.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }

  async assertGenericWorkflowRunMutationAllowed({
    workflowRunId,
    workspaceId,
  }: {
    workflowRunId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.assertGenericMutationAllowed({
      sourceTable: 'workflowRun',
      sourceId: workflowRunId,
      workspaceId,
    });
  }

  async assertGenericWorkflowRunMutationsAllowed({
    workflowRunIds,
    workspaceId,
  }: {
    workflowRunIds: string[];
    workspaceId: string;
  }): Promise<void> {
    const uniqueWorkflowRunIds = [...new Set(workflowRunIds)];

    if (uniqueWorkflowRunIds.length === 0) {
      return;
    }

    const workspaceDataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const rows = await workspaceDataSource.query<
      Array<{ id: string; outreachCampaignId: string | null }>
    >(
      `SELECT source."id", workflow."outreachCampaignId"
         FROM "${workspaceSchemaName}"."workflowRun" source
         INNER JOIN "${workspaceSchemaName}"."workflow" workflow
           ON workflow.id = source."workflowId"
        WHERE source.id = ANY($1::uuid[])`,
      [uniqueWorkflowRunIds],
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    if (rows.length !== uniqueWorkflowRunIds.length) {
      throw new WorkflowQueryValidationException(
        'Workflow record is not available for generic mutation.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    if (rows.some(({ outreachCampaignId }) => isDefined(outreachCampaignId))) {
      throw new WorkflowQueryValidationException(
        'Use the Campaign sequence editor.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }

  private async assertGenericMutationAllowed({
    sourceId,
    sourceTable,
    workspaceId,
  }: {
    sourceId: string;
    sourceTable: 'workflow' | 'workflowRun' | 'workflowVersion';
    workspaceId: string;
  }): Promise<void> {
    const ownership = await this.getWorkflowOwnership({
      sourceId,
      sourceTable,
      workspaceId,
    });

    if (!ownership.found) {
      throw new WorkflowQueryValidationException(
        'Workflow record is not available for generic mutation.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    if (isDefined(ownership.outreachCampaignId)) {
      throw new WorkflowQueryValidationException(
        'Use the Campaign sequence editor.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
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
    const ownership = await this.getWorkflowOwnership({
      sourceId,
      sourceTable,
      workspaceId,
    });

    return ownership.outreachCampaignId;
  }

  private async getWorkflowOwnership({
    sourceId,
    sourceTable,
    workspaceId,
  }: {
    sourceId: string;
    sourceTable: 'workflow' | 'workflowRun' | 'workflowVersion';
    workspaceId: string;
  }): Promise<{
    found: boolean;
    outreachCampaignId: string | null | undefined;
  }> {
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

    return {
      found: rows.length > 0,
      outreachCampaignId: rows[0]?.outreachCampaignId,
    };
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
