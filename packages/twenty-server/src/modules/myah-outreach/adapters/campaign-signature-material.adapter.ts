import { Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  type CampaignMaterialPortResult,
  type CampaignSignatureMaterialPort,
} from 'src/modules/myah-outreach/types/campaign-message-render.type';

type CampaignRow = {
  id: string;
  emailSignature: unknown;
  deletedAt: Date | null;
};

type CampaignSignatureMaterial = Readonly<{ html: string | null }> | null;

type CampaignRichTextSignature = Readonly<{
  markdown: string;
  blocknote: string;
}>;

type CampaignSignatureStorageRow = Readonly<{
  emailSignatureMarkdown: unknown;
  emailSignatureBlocknote: unknown;
}>;

const getSignatureMaterial = (
  emailSignature: unknown,
): CampaignSignatureMaterial | undefined => {
  if (emailSignature === null || typeof emailSignature === 'string') {
    return { html: emailSignature };
  }

  if (
    typeof emailSignature === 'object' &&
    emailSignature !== null &&
    !Array.isArray(emailSignature) &&
    typeof (emailSignature as CampaignRichTextSignature).markdown ===
      'string' &&
    typeof (emailSignature as CampaignRichTextSignature).blocknote === 'string'
  ) {
    return { html: (emailSignature as CampaignRichTextSignature).markdown };
  }

  return undefined;
};

const getSignatureMaterialFromStorageRow = (
  row: unknown,
): CampaignSignatureMaterial | undefined => {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return undefined;
  }

  const { emailSignatureMarkdown, emailSignatureBlocknote } =
    row as CampaignSignatureStorageRow;

  if (emailSignatureMarkdown === null && emailSignatureBlocknote === null) {
    return getSignatureMaterial(null);
  }

  if (
    typeof emailSignatureMarkdown === 'string' &&
    typeof emailSignatureBlocknote === 'string'
  ) {
    return getSignatureMaterial({
      markdown: emailSignatureMarkdown,
      blocknote: emailSignatureBlocknote,
    });
  }

  return undefined;
};

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
      if (input.transactionManager) {
        const runner = input.transactionManager.queryRunner;
        if (
          !runner?.isTransactionActive ||
          runner.isReleased ||
          runner.manager !== input.transactionManager
        )
          return signatureUnavailable();
        const rows = await runner.query(
          `SELECT "emailSignatureMarkdown", "emailSignatureBlocknote" FROM "${getWorkspaceSchemaName(workspaceId)}".campaign
            WHERE id=$1 AND "deletedAt" IS NULL FOR KEY SHARE`,
          [campaignId],
        );
        if (!Array.isArray(rows) || rows.length !== 1)
          return signatureUnavailable();
        const signatureMaterial = getSignatureMaterialFromStorageRow(rows[0]);
        if (signatureMaterial === undefined) return signatureUnavailable();
        return { kind: 'READY', value: signatureMaterial };
      }
      if (authContext.type !== 'user') return signatureUnavailable();
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

    const signatureMaterial =
      campaign === null
        ? undefined
        : getSignatureMaterial(campaign.emailSignature);

    if (signatureMaterial === undefined) return signatureUnavailable();

    return { kind: 'READY', value: signatureMaterial };
  }
}
