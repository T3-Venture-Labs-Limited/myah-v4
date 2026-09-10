import { Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  type CampaignMaterialPortResult,
  type CampaignSignatureMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

type CampaignRow = {
  id: string;
  emailSignature: string | null;
  deletedAt: Date | null;
};

type CampaignSignatureMaterial = Readonly<{ html: string | null }> | null;

const signatureUnavailable =
  (): CampaignMaterialPortResult<CampaignSignatureMaterial> => ({
    kind: 'BLOCKED',
    blockers: [
      {
        code: 'MATERIAL_STALE',
        message: 'Campaign signature is unavailable',
      },
    ],
  });

@Injectable()
export class CampaignSignatureMaterialAdapter implements CampaignSignatureMaterialPort {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async load(
    input: Parameters<CampaignSignatureMaterialPort['load']>[0],
  ): Promise<CampaignMaterialPortResult<CampaignSignatureMaterial>> {
    const { authContext, campaignId, workspaceId } = input;

    if (authContext.workspace.id !== workspaceId) {
      return signatureUnavailable();
    }

    try {
      return await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () => this.loadInWorkspaceContext(authContext, workspaceId, campaignId),
        authContext,
      );
    } catch {
      return signatureUnavailable();
    }
  }

  private async loadInWorkspaceContext(
    authContext: UserWorkspaceAuthContext,
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignMaterialPortResult<CampaignSignatureMaterial>> {
    const workspaceContext = getWorkspaceContext();
    const permissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });

    if (permissionConfig === null) {
      return signatureUnavailable();
    }

    const campaignRepository =
      await this.globalWorkspaceOrmManager.getRepository<CampaignRow>(
        workspaceId,
        'campaign',
        permissionConfig,
      );
    const campaign = await campaignRepository.findOne({
      where: { id: campaignId, deletedAt: IsNull() },
    });

    if (
      campaign === null ||
      (campaign.emailSignature !== null &&
        typeof campaign.emailSignature !== 'string')
    ) {
      return signatureUnavailable();
    }

    return {
      kind: 'READY',
      value: { html: campaign.emailSignature },
    };
  }
}
