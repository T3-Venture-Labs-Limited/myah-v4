import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { IsNull } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { normalizeCampaignCreatorEmail } from 'src/modules/myah-outreach/utils/normalize-campaign-creator-email.util';
import {
  type CampaignCreatorMaterialPort,
  type CampaignMaterialPortResult,
  type CampaignCreatorMaterial,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

type CampaignCreatorRow = {
  id: string;
  campaignId: string;
  creatorId: string | null;
  deletedAt: Date | null;
};

type CreatorRow = {
  id: string;
  name: string;
  email: string;
  deletedAt: Date | null;
};

const creatorUnavailable =
  (): CampaignMaterialPortResult<CampaignCreatorMaterial> => ({
    kind: 'BLOCKED',
    blockers: [
      {
        code: 'CREATOR_NOT_FOUND',
        message: 'Creator material is unavailable or inaccessible',
      },
    ],
  });

const missingVariable = (
  variable: 'creator.name' | 'creator.email',
): CampaignMaterialPortResult<CampaignCreatorMaterial> => ({
  kind: 'BLOCKED',
  blockers: [
    {
      code: 'MISSING_VARIABLE',
      message: `Creator value required for ${variable} is missing`,
    },
  ],
});

@Injectable()
export class CampaignCreatorMaterialAdapter implements CampaignCreatorMaterialPort {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async load(
    input: Parameters<CampaignCreatorMaterialPort['load']>[0],
  ): Promise<CampaignMaterialPortResult<CampaignCreatorMaterial>> {
    const { authContext, coordinates } = input;

    if (authContext.workspace.id !== coordinates.workspaceId) {
      return creatorUnavailable();
    }

    try {
      if (input.transactionManager) {
        const runner = input.transactionManager.queryRunner;
        if (
          !runner?.isTransactionActive ||
          runner.isReleased ||
          runner.manager !== input.transactionManager
        )
          return creatorUnavailable();
        const schemaName = getWorkspaceSchemaName(coordinates.workspaceId);
        const rows = await runner.query(
          `SELECT cc."creatorId", c.id, c.name, c.email
             FROM "${schemaName}"."campaignCreator" cc
             JOIN "${schemaName}".creator c ON c.id=cc."creatorId" AND c."deletedAt" IS NULL
            WHERE cc.id=$1 AND cc."campaignId"=$2 AND cc."deletedAt" IS NULL`,
          [coordinates.campaignCreatorId, coordinates.campaignId],
        );
        if (!Array.isArray(rows) || rows.length !== 1)
          return creatorUnavailable();
        const creator = rows[0];
        if (typeof creator.name !== 'string' || creator.name.trim() === '')
          return missingVariable('creator.name');
        const normalizedRecipient = normalizeCampaignCreatorEmail(
          creator.email,
        );
        if (normalizedRecipient === null) return creatorUnavailable();
        return {
          kind: 'READY',
          value: {
            creatorId: creator.id,
            normalizedRecipient,
            variables: {
              'creator.name': creator.name,
              'creator.email': normalizedRecipient,
            },
          },
        };
      }
      if (authContext.type !== 'user') return creatorUnavailable();
      return await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () => this.loadInWorkspaceContext(authContext, coordinates),
        authContext,
      );
    } catch {
      return creatorUnavailable();
    }
  }

  private async loadInWorkspaceContext(
    authContext: UserWorkspaceAuthContext,
    coordinates: Parameters<
      CampaignCreatorMaterialPort['load']
    >[0]['coordinates'],
  ): Promise<CampaignMaterialPortResult<CampaignCreatorMaterial>> {
    const workspaceContext = getWorkspaceContext();
    const permissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });

    if (permissionConfig === null) {
      return creatorUnavailable();
    }

    const campaignCreatorRepository =
      await this.globalWorkspaceOrmManager.getRepository<CampaignCreatorRow>(
        coordinates.workspaceId,
        'campaignCreator',
        permissionConfig,
      );
    const campaignCreator = await campaignCreatorRepository.findOne({
      where: {
        id: coordinates.campaignCreatorId,
        campaignId: coordinates.campaignId,
        deletedAt: IsNull(),
      },
    });

    if (
      campaignCreator === null ||
      typeof campaignCreator.creatorId !== 'string' ||
      !isUUID(campaignCreator.creatorId, '4')
    ) {
      return creatorUnavailable();
    }

    const creatorRepository =
      await this.globalWorkspaceOrmManager.getRepository<CreatorRow>(
        coordinates.workspaceId,
        'creator',
        permissionConfig,
      );
    const creator = await creatorRepository.findOne({
      where: { id: campaignCreator.creatorId, deletedAt: IsNull() },
    });

    if (creator === null) {
      return creatorUnavailable();
    }

    if (typeof creator.name !== 'string' || creator.name.trim().length === 0) {
      return missingVariable('creator.name');
    }

    if (
      typeof creator.email !== 'string' ||
      creator.email.trim().length === 0
    ) {
      return missingVariable('creator.email');
    }

    const normalizedRecipient = normalizeCampaignCreatorEmail(creator.email);

    if (normalizedRecipient === null) return creatorUnavailable();

    return {
      kind: 'READY',
      value: {
        creatorId: creator.id,
        normalizedRecipient,
        variables: {
          'creator.name': creator.name,
          'creator.email': normalizedRecipient,
        },
      },
    };
  }
}
