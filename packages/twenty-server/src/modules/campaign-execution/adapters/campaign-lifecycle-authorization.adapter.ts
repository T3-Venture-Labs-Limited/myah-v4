import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  type CampaignLifecycleActorPermissionResolverPort,
  type CampaignLifecycleWriteAuthorizationPort,
  type LockedCampaignLifecycleContext,
} from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';

const assertActiveManager = (manager: EntityManager): void => {
  const runner = manager.queryRunner;

  if (
    !runner ||
    !runner.isTransactionActive ||
    runner.isReleased ||
    runner.manager !== manager
  ) {
    throw new Error(
      'Campaign authorization requires the supplied active manager',
    );
  }
};

@Injectable()
export class CampaignLifecycleActorPermissionResolverAdapter implements CampaignLifecycleActorPermissionResolverPort {
  async resolveRolePermissionConfig(
    input: Parameters<
      CampaignLifecycleActorPermissionResolverPort['resolveRolePermissionConfig']
    >[0],
  ) {
    const context = getWorkspaceContext();

    if (context.authContext.workspace.id !== input.workspaceId) return null;

    return resolveRolePermissionConfig({
      authContext: input.authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });
  }
}

@Injectable()
export class CampaignLifecycleWriteAuthorizationAdapter implements CampaignLifecycleWriteAuthorizationPort {
  async assertCampaignWriteAllowedInTransaction(
    context: LockedCampaignLifecycleContext,
  ): Promise<void> {
    assertActiveManager(context.manager);
    const permission = context.actorPermissionContext.rolePermissionConfig;

    if ('shouldBypassPermissionChecks' in permission) return;

    const workspaceContext = getWorkspaceContext();
    const objectId = workspaceContext.objectIdByNameSingular.campaign;
    const lifecycleField = Object.values(
      workspaceContext.flatFieldMetadataMaps.byUniversalIdentifier,
    ).find(
      (field) =>
        field?.objectMetadataId === objectId &&
        field.name === 'lifecycleStatus' &&
        field.isActive,
    );

    if (!lifecycleField) {
      throw new Error('Campaign lifecycle field permission is unavailable');
    }

    const isUnion = 'unionOf' in permission;
    const roleIds = isUnion ? permission.unionOf : permission.intersectionOf;
    const decisions = roleIds.map((roleId) => {
      const objectPermission =
        workspaceContext.permissionsPerRoleId[roleId]?.[objectId];

      return (
        objectPermission?.canUpdateObjectRecords === true &&
        objectPermission.restrictedFields?.[lifecycleField.id]?.canUpdate !==
          false
      );
    });

    if (isUnion ? !decisions.some(Boolean) : !decisions.every(Boolean)) {
      throw new Error('Campaign lifecycle update permission is required');
    }
  }
}
