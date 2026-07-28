import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Injectable } from '@nestjs/common';

import { IsNull, Not } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
  type UpdateManyResolverArgs,
  type UpdateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  CAMPAIGN_ALLOWED_TRANSITIONS,
  CAMPAIGN_STATUSES,
  MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';
import { type CampaignCreatorWorkspaceRecord } from 'src/modules/myah-campaign/types/campaign-creator-workspace-record.type';
import { type CampaignStatus } from 'src/modules/myah-campaign/types/campaign-status.type';
import {
  type CampaignMutationData,
  type CampaignUpdateFilter,
  type CampaignWorkspaceRecord,
} from 'src/modules/myah-campaign/types/campaign-workspace-record.type';

type CampaignCreateOneArgs = CreateOneResolverArgs<CampaignMutationData>;
type CampaignCreateManyArgs = CreateManyResolverArgs<CampaignMutationData>;
type CampaignUpdateOneArgs = UpdateOneResolverArgs<CampaignMutationData>;
export type CampaignUpdateManyArgs = UpdateManyResolverArgs<
  CampaignMutationData,
  CampaignUpdateFilter
>;

const LIFECYCLE_ERRORS = {
  upsert: {
    message: 'Campaign upsert is not supported; use create or update.',
    userFriendlyMessage: msg`Campaign upsert is not supported; use create or update.`,
  },
  updateOne: {
    message: 'Change Campaign status from Campaign Overview.',
    userFriendlyMessage: msg`Change Campaign status from Campaign Overview.`,
  },
  oneCampaign: {
    message: 'Change one Campaign status at a time.',
    userFriendlyMessage: msg`Change one Campaign status at a time.`,
  },
  name: {
    message: 'Campaign name is required before activation.',
    userFriendlyMessage: msg`Campaign name is required before activation.`,
  },
  objective: {
    message: 'Campaign objective is required before activation.',
    userFriendlyMessage: msg`Campaign objective is required before activation.`,
  },
  audience: {
    message: 'Add at least one creator before activating this campaign.',
    userFriendlyMessage: msg`Add at least one creator before activating this campaign.`,
  },
  invalidStatus: {
    message: 'Campaign status is invalid.',
    userFriendlyMessage: msg`Campaign status is invalid.`,
  },
  transition: {
    message: 'This Campaign status change is not allowed.',
    userFriendlyMessage: msg`This Campaign status change is not allowed.`,
  },
} as const;
function throwBadRequest({
  message,
  userFriendlyMessage,
}: {
  message: string;
  userFriendlyMessage: MessageDescriptor;
}): never {
  throw new CommonQueryRunnerException(
    message,
    CommonQueryRunnerExceptionCode.BAD_REQUEST,
    { userFriendlyMessage },
  );
}

const isCampaignStatus = (value: unknown): value is CampaignStatus =>
  typeof value === 'string' &&
  CAMPAIGN_STATUSES.some((campaignStatus) => campaignStatus === value);

const isNonEmptyTrimmedString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasRequiredText = (value: string | null | undefined): boolean =>
  isNonEmptyTrimmedString(value);

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

@Injectable()
export class CampaignLifecycleService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async prepareCreateOne(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignCreateOneArgs,
  ): Promise<CampaignCreateOneArgs> {
    return this.executeForMyahCampaign({
      authContext,
      payload,
      callback: async (workspaceContext) => {
        if (payload.upsert === true) {
          throwBadRequest(LIFECYCLE_ERRORS.upsert);
        }

        await this.prepareCreateData({
          authContext,
          workspaceContext,
          data: payload.data,
        });

        return payload;
      },
    });
  }

  async prepareCreateMany(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignCreateManyArgs,
  ): Promise<CampaignCreateManyArgs> {
    return this.executeForMyahCampaign({
      authContext,
      payload,
      callback: async (workspaceContext) => {
        if (payload.upsert === true) {
          throwBadRequest(LIFECYCLE_ERRORS.upsert);
        }

        for (const data of payload.data) {
          await this.prepareCreateData({
            authContext,
            workspaceContext,
            data,
          });
        }

        return payload;
      },
    });
  }

  async validateStatusBearingUpdateOne(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignUpdateOneArgs,
  ): Promise<CampaignUpdateOneArgs> {
    return this.executeForMyahCampaign({
      authContext,
      payload,
      callback: () => {
        if (!hasOwn(payload.data, 'status')) {
          return payload;
        }

        return throwBadRequest(LIFECYCLE_ERRORS.updateOne);
      },
    });
  }

  async prepareUpdateMany(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignUpdateManyArgs,
  ): Promise<CampaignUpdateManyArgs> {
    return this.executeForMyahCampaign({
      authContext,
      payload,
      callback: async (workspaceContext) => {
        if (!hasOwn(payload.data, 'status')) {
          return payload;
        }

        const targetStatus = payload.data.status;

        if (!isCampaignStatus(targetStatus)) {
          return throwBadRequest(LIFECYCLE_ERRORS.invalidStatus);
        }

        const campaignId = this.getSingleCampaignId(payload.filter);
        const rolePermissionConfig = this.resolveRolePermissionConfig({
          authContext,
          workspaceContext,
        });
        const campaignRepository =
          await this.globalWorkspaceOrmManager.getRepository<CampaignWorkspaceRecord>(
            authContext.workspace.id,
            'campaign',
            rolePermissionConfig,
          );
        const campaign = await campaignRepository.findOne({
          where: { id: campaignId },
          select: { id: true, status: true },
        });

        if (!isDefined(campaign)) {
          return throwBadRequest(LIFECYCLE_ERRORS.transition);
        }

        const observedStatus = campaign.status;

        if (!isCampaignStatus(observedStatus)) {
          return throwBadRequest(LIFECYCLE_ERRORS.invalidStatus);
        }

        if (observedStatus !== targetStatus) {
          if (
            !CAMPAIGN_ALLOWED_TRANSITIONS[observedStatus].includes(targetStatus)
          ) {
            return throwBadRequest(LIFECYCLE_ERRORS.transition);
          }

          if (targetStatus === 'ACTIVE') {
            const needsPersistedName = !hasOwn(payload.data, 'name');
            const needsPersistedObjective = !hasOwn(payload.data, 'objective');
            const campaignSetup =
              needsPersistedName || needsPersistedObjective
                ? await campaignRepository.findOne({
                    where: { id: campaignId },
                    select: {
                      id: true,
                      ...(needsPersistedName ? { name: true } : {}),
                      ...(needsPersistedObjective ? { objective: true } : {}),
                    },
                  })
                : undefined;

            if (
              (needsPersistedName || needsPersistedObjective) &&
              !isDefined(campaignSetup)
            ) {
              return throwBadRequest(LIFECYCLE_ERRORS.transition);
            }

            await this.validateActivationReadiness({
              authContext,
              workspaceContext,
              rolePermissionConfig,
              campaignId,
              name: needsPersistedName
                ? campaignSetup?.name
                : payload.data.name,
              objective: needsPersistedObjective
                ? campaignSetup?.objective
                : payload.data.objective,
            });
          }
        }

        return {
          ...payload,
          filter: {
            and: [payload.filter, { status: { eq: observedStatus } }],
          },
        };
      },
    });
  }

  private async executeForMyahCampaign<TPayload>({
    authContext,
    payload,
    callback,
  }: {
    authContext: WorkspaceAuthContext;
    payload: TPayload;
    callback: (
      workspaceContext: ORMWorkspaceContext,
    ) => Promise<TPayload> | TPayload;
  }): Promise<TPayload> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const campaignObjectMetadata =
          workspaceContext.flatObjectMetadataMaps.byUniversalIdentifier[
            MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER
          ];

        if (
          !isDefined(campaignObjectMetadata) ||
          campaignObjectMetadata.nameSingular !== 'campaign'
        ) {
          return payload;
        }

        return callback(workspaceContext);
      },
      authContext,
    );
  }

  private async prepareCreateData({
    authContext,
    workspaceContext,
    data,
  }: {
    authContext: WorkspaceAuthContext;
    workspaceContext: ORMWorkspaceContext;
    data: CampaignMutationData;
  }): Promise<void> {
    if (
      !hasOwn(data, 'status') ||
      data.status === undefined ||
      data.status === null ||
      data.status === ''
    ) {
      data.status = 'DRAFT';
    }

    if (!isCampaignStatus(data.status)) {
      return throwBadRequest(LIFECYCLE_ERRORS.invalidStatus);
    }

    if (
      isUserAuthContext(authContext) &&
      !hasOwn(data, 'ownerId') &&
      this.hasInstalledOwnerField(workspaceContext)
    ) {
      data.ownerId = authContext.workspaceMemberId;
    }

    if (data.status === 'ACTIVE') {
      await this.validateActivationReadiness({
        authContext,
        workspaceContext,
        campaignId: data.id,
        name: data.name,
        objective: data.objective,
      });
    }
  }

  private hasInstalledOwnerField(
    workspaceContext: ORMWorkspaceContext,
  ): boolean {
    const campaignObjectMetadata =
      workspaceContext.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER
      ];

    if (!isDefined(campaignObjectMetadata)) {
      return false;
    }

    return Object.values(
      workspaceContext.flatFieldMetadataMaps.byUniversalIdentifier,
    ).some(
      (fieldMetadata) =>
        isDefined(fieldMetadata) &&
        fieldMetadata.objectMetadataId === campaignObjectMetadata.id &&
        fieldMetadata.name === 'owner' &&
        fieldMetadata.isActive,
    );
  }

  private getSingleCampaignId(filter: CampaignUpdateFilter): string {
    const idFilter = filter.id;

    if (!isDefined(idFilter) || typeof idFilter !== 'object') {
      return throwBadRequest(LIFECYCLE_ERRORS.oneCampaign);
    }

    const hasEq = hasOwn(idFilter, 'eq');
    const hasIn = hasOwn(idFilter, 'in');

    if (hasEq === hasIn) {
      return throwBadRequest(LIFECYCLE_ERRORS.oneCampaign);
    }

    if (hasEq && isNonEmptyTrimmedString(idFilter.eq)) {
      return idFilter.eq;
    }

    if (
      hasIn &&
      Array.isArray(idFilter.in) &&
      idFilter.in.length === 1 &&
      isNonEmptyTrimmedString(idFilter.in[0])
    ) {
      return idFilter.in[0];
    }

    return throwBadRequest(LIFECYCLE_ERRORS.oneCampaign);
  }

  private resolveRolePermissionConfig({
    authContext,
    workspaceContext,
  }: {
    authContext: WorkspaceAuthContext;
    workspaceContext: ORMWorkspaceContext;
  }): RolePermissionConfig {
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });

    if (!isDefined(rolePermissionConfig)) {
      throw new CommonQueryRunnerException(
        'Role could not be resolved.',
        CommonQueryRunnerExceptionCode.INVALID_AUTH_CONTEXT,
        {
          userFriendlyMessage: msg`Your permissions could not be resolved.`,
        },
      );
    }

    return rolePermissionConfig;
  }

  private async validateActivationReadiness({
    authContext,
    workspaceContext,
    rolePermissionConfig,
    campaignId,
    name,
    objective,
  }: {
    authContext: WorkspaceAuthContext;
    workspaceContext: ORMWorkspaceContext;
    rolePermissionConfig?: RolePermissionConfig;
    campaignId: string | undefined;
    name: string | null | undefined;
    objective: string | null | undefined;
  }): Promise<void> {
    if (!hasRequiredText(name)) {
      throwBadRequest(LIFECYCLE_ERRORS.name);
    }

    if (!hasRequiredText(objective)) {
      throwBadRequest(LIFECYCLE_ERRORS.objective);
    }

    const campaignCreatorObjectMetadata =
      workspaceContext.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER
      ];

    if (
      !isDefined(campaignId) ||
      !isDefined(campaignCreatorObjectMetadata) ||
      campaignCreatorObjectMetadata.nameSingular !== 'campaignCreator'
    ) {
      throwBadRequest(LIFECYCLE_ERRORS.audience);
    }

    const resolvedRolePermissionConfig =
      rolePermissionConfig ??
      this.resolveRolePermissionConfig({ authContext, workspaceContext });
    const campaignCreatorRepository =
      await this.globalWorkspaceOrmManager.getRepository<CampaignCreatorWorkspaceRecord>(
        authContext.workspace.id,
        'campaignCreator',
        resolvedRolePermissionConfig,
      );
    const hasEffectiveCreator = await campaignCreatorRepository.exists({
      where: {
        campaignId,
        creatorId: Not(IsNull()),
        deletedAt: IsNull(),
      },
    });

    if (!hasEffectiveCreator) {
      throwBadRequest(LIFECYCLE_ERRORS.audience);
    }
  }
}
