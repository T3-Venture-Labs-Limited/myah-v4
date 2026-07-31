import { msg } from '@lingui/core/macro';
import { Injectable } from '@nestjs/common';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import {
  type CreateOneResolverArgs,
  type UpdateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import type { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';

type WorkflowAssignmentMutationData = Partial<
  Pick<WorkflowWorkspaceEntity, 'id' | 'campaignId' | 'sourceWorkflowId'>
> & {
  campaign?: unknown;
};

type WorkflowAssignmentRecord = Pick<
  WorkflowWorkspaceEntity,
  'id' | 'campaignId' | 'sourceWorkflowId'
>;

type CampaignAssignmentRecord = {
  id: string;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const throwAssignmentForbidden = (message: string): never => {
  throw new WorkflowQueryValidationException(
    message,
    WorkflowQueryValidationExceptionCode.FORBIDDEN,
    {
      userFriendlyMessage: msg`Campaign Automation ownership cannot be changed.`,
    },
  );
};

@Injectable()
export class WorkflowCampaignAssignmentService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async prepareCreateOne<T extends Partial<ObjectRecord>>(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs<T>,
  ): Promise<CreateOneResolverArgs<T>> {
    const data = payload.data as T & WorkflowAssignmentMutationData;
    const hasCampaignId = Object.prototype.hasOwnProperty.call(
      data,
      'campaignId',
    );
    const hasSourceWorkflowId = Object.prototype.hasOwnProperty.call(
      data,
      'sourceWorkflowId',
    );
    const hasCampaignRelation = Object.prototype.hasOwnProperty.call(
      data,
      'campaign',
    );

    if (hasCampaignRelation) {
      return throwAssignmentForbidden(
        'Campaign ownership must be set with campaignId.',
      );
    }

    if (payload.upsert && (hasCampaignId || hasSourceWorkflowId)) {
      return throwAssignmentForbidden(
        'Campaign ownership cannot be set with upsert.',
      );
    }

    if (!hasCampaignId && !hasSourceWorkflowId) {
      return payload;
    }

    const { campaignId, sourceWorkflowId, id } = data;

    if (!isNonEmptyString(campaignId)) {
      return throwAssignmentForbidden(
        'Workflow copy provenance requires Campaign ownership.',
      );
    }

    if (
      sourceWorkflowId !== undefined &&
      sourceWorkflowId !== null &&
      !isNonEmptyString(sourceWorkflowId)
    ) {
      return throwAssignmentForbidden('Workflow source is invalid.');
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const campaignRepository = await this.getCampaignRepository(authContext);

      await this.assertCampaign({ campaignRepository, campaignId });

      if (isNonEmptyString(sourceWorkflowId)) {
        const workflowRepository =
          await this.getWorkflowRepository(authContext);

        await this.assertGeneralSource({
          workflowRepository,
          sourceWorkflowId,
          targetWorkflowId: isNonEmptyString(id) ? id : undefined,
        });
      }
    }, authContext);

    return payload;
  }

  async prepareUpdateOne<T extends Partial<ObjectRecord>>(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs<T>,
  ): Promise<UpdateOneResolverArgs<T>> {
    const hasCampaignId = Object.prototype.hasOwnProperty.call(
      payload.data,
      'campaignId',
    );
    const hasSourceWorkflowId = Object.prototype.hasOwnProperty.call(
      payload.data,
      'sourceWorkflowId',
    );
    const hasCampaignRelation = Object.prototype.hasOwnProperty.call(
      payload.data,
      'campaign',
    );

    if (hasCampaignRelation) {
      return throwAssignmentForbidden(
        'Campaign ownership must be set with campaignId.',
      );
    }

    if (!hasCampaignId && !hasSourceWorkflowId) {
      return payload;
    }

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workflowRepository =
          await this.getWorkflowRepository(authContext);
        const currentWorkflow = await workflowRepository.findOne({
          where: { id: payload.id },
          select: { id: true, campaignId: true, sourceWorkflowId: true },
        });

        if (!isDefined(currentWorkflow)) {
          return throwAssignmentForbidden('Workflow was not found.');
        }

        if (
          currentWorkflow.campaignId !== null ||
          currentWorkflow.sourceWorkflowId !== null
        ) {
          return throwAssignmentForbidden(
            'Campaign ownership and copy provenance are immutable.',
          );
        }

        const { campaignId, sourceWorkflowId } = payload.data as T &
          WorkflowAssignmentMutationData;

        if (!hasCampaignId || !isNonEmptyString(campaignId)) {
          return throwAssignmentForbidden(
            'Campaign ownership may only be set once.',
          );
        }

        const campaignRepository =
          await this.getCampaignRepository(authContext);

        await this.assertCampaign({ campaignRepository, campaignId });

        if (
          hasSourceWorkflowId &&
          sourceWorkflowId !== undefined &&
          sourceWorkflowId !== null
        ) {
          if (!isNonEmptyString(sourceWorkflowId)) {
            return throwAssignmentForbidden('Workflow source is invalid.');
          }

          await this.assertGeneralSource({
            workflowRepository,
            sourceWorkflowId,
            targetWorkflowId: payload.id,
          });
        }

        return payload;
      },
      authContext,
    );
  }

  private async getCampaignRepository(
    authContext: WorkspaceAuthContext,
  ): Promise<WorkspaceRepository<CampaignAssignmentRecord>> {
    const { userWorkspaceRoleMap, apiKeyRoleMap } = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap,
      apiKeyRoleMap,
    });

    if (!isDefined(rolePermissionConfig)) {
      return throwAssignmentForbidden(
        'Campaign is not accessible with the current permissions.',
      );
    }

    return this.globalWorkspaceOrmManager.getRepository<CampaignAssignmentRecord>(
      authContext.workspace.id,
      'campaign',
      rolePermissionConfig,
    );
  }

  private async assertCampaign({
    campaignRepository,
    campaignId,
  }: {
    campaignRepository: WorkspaceRepository<CampaignAssignmentRecord>;
    campaignId: string;
  }): Promise<void> {
    const campaign = await campaignRepository.findOne({
      where: { id: campaignId },
      select: { id: true },
    });

    if (!isDefined(campaign)) {
      return throwAssignmentForbidden('Campaign was not found.');
    }
  }

  private async getWorkflowRepository(
    authContext: WorkspaceAuthContext,
  ): Promise<WorkspaceRepository<WorkflowAssignmentRecord>> {
    const { userWorkspaceRoleMap, apiKeyRoleMap } = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap,
      apiKeyRoleMap,
    });

    if (!isDefined(rolePermissionConfig)) {
      return throwAssignmentForbidden(
        'Workflow source is not accessible with the current permissions.',
      );
    }

    return this.globalWorkspaceOrmManager.getRepository<WorkflowAssignmentRecord>(
      authContext.workspace.id,
      'workflow',
      rolePermissionConfig,
    );
  }

  private async assertGeneralSource({
    workflowRepository,
    sourceWorkflowId,
    targetWorkflowId,
  }: {
    workflowRepository: WorkspaceRepository<WorkflowAssignmentRecord>;
    sourceWorkflowId: string;
    targetWorkflowId?: string;
  }): Promise<void> {
    if (sourceWorkflowId === targetWorkflowId) {
      return throwAssignmentForbidden('Workflow cannot copy itself.');
    }

    const sourceWorkflow = await workflowRepository.findOne({
      where: { id: sourceWorkflowId },
      select: { id: true, campaignId: true },
    });

    if (!isDefined(sourceWorkflow)) {
      return throwAssignmentForbidden('Workflow source was not found.');
    }

    if (sourceWorkflow.campaignId !== null) {
      return throwAssignmentForbidden(
        'Campaign-owned Workflows cannot be copied into another Campaign.',
      );
    }
  }
}
