import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Injectable } from '@nestjs/common';

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
import { type WorkspaceRawInputPreQueryHookContext } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-campaign/constants/campaign-lifecycle.constants';
import {
  type CampaignMutationData,
  type CampaignUpdateFilter,
} from 'src/modules/myah-campaign/types/campaign-workspace-record.type';
import {
  hasOwnCampaignInputKey,
  isForbiddenGenericCampaignCreateData,
  isForbiddenGenericCampaignUpdateData,
  rejectGenericCampaignLifecycleOperation,
} from 'src/modules/myah-campaign/utils/reject-generic-campaign-lifecycle-operation.util';

type CampaignCreateOneArgs = CreateOneResolverArgs<CampaignMutationData>;
type CampaignCreateManyArgs = CreateManyResolverArgs<CampaignMutationData>;
type CampaignUpdateOneArgs = UpdateOneResolverArgs<CampaignMutationData>;
export type CampaignUpdateManyArgs = UpdateManyResolverArgs<
  CampaignMutationData,
  CampaignUpdateFilter
>;

const UPSERT_ERROR = {
  message: 'Campaign upsert is not supported; use create or update.',
  userFriendlyMessage: msg`Campaign upsert is not supported; use create or update.`,
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

@Injectable()
export class CampaignLifecycleService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  validateRawCreateOne(
    context: WorkspaceRawInputPreQueryHookContext,
    payload: CampaignCreateOneArgs,
  ): void {
    if (
      this.isCanonicalCampaign(context) &&
      isForbiddenGenericCampaignCreateData(payload.data)
    ) {
      rejectGenericCampaignLifecycleOperation();
    }
  }

  validateRawCreateMany(
    context: WorkspaceRawInputPreQueryHookContext,
    payload: CampaignCreateManyArgs,
  ): void {
    if (
      this.isCanonicalCampaign(context) &&
      payload.data.some(isForbiddenGenericCampaignCreateData)
    ) {
      rejectGenericCampaignLifecycleOperation();
    }
  }

  validateRawUpdate(
    context: WorkspaceRawInputPreQueryHookContext,
    payload: CampaignUpdateOneArgs | CampaignUpdateManyArgs,
  ): void {
    if (
      this.isCanonicalCampaign(context) &&
      isForbiddenGenericCampaignUpdateData(payload.data)
    ) {
      rejectGenericCampaignLifecycleOperation();
    }
  }

  async prepareCreateOne(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CampaignCreateOneArgs,
  ): Promise<CampaignCreateOneArgs> {
    return this.executeForMyahCampaign({
      authContext,
      payload,
      callback: (workspaceContext) => {
        if (payload.upsert === true) {
          throwBadRequest(UPSERT_ERROR);
        }

        this.prepareCreateData({
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
      callback: (workspaceContext) => {
        if (payload.upsert === true) {
          throwBadRequest(UPSERT_ERROR);
        }

        if (payload.data.some(isForbiddenGenericCampaignCreateData)) {
          rejectGenericCampaignLifecycleOperation();
        }

        for (const data of payload.data) {
          this.prepareCreateData({ authContext, workspaceContext, data });
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
        if (isForbiddenGenericCampaignUpdateData(payload.data)) {
          rejectGenericCampaignLifecycleOperation();
        }

        return payload;
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
      callback: () => {
        if (isForbiddenGenericCampaignUpdateData(payload.data)) {
          rejectGenericCampaignLifecycleOperation();
        }

        return payload;
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

  private prepareCreateData({
    authContext,
    workspaceContext,
    data,
  }: {
    authContext: WorkspaceAuthContext;
    workspaceContext: ORMWorkspaceContext;
    data: CampaignMutationData;
  }): void {
    if (isForbiddenGenericCampaignCreateData(data)) {
      rejectGenericCampaignLifecycleOperation();
    }

    if (!hasOwnCampaignInputKey(data, 'lifecycleStatus')) {
      data.lifecycleStatus = 'DRAFT';
    }

    if (
      isUserAuthContext(authContext) &&
      !hasOwnCampaignInputKey(data, 'ownerId') &&
      this.hasInstalledOwnerField(workspaceContext)
    ) {
      data.ownerId = authContext.workspaceMemberId;
    }
  }

  private isCanonicalCampaign(
    context: WorkspaceRawInputPreQueryHookContext,
  ): boolean {
    return (
      context.objectMetadataUniversalIdentifier ===
      MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER
    );
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
}
