import { Inject, Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { ToolCategory } from 'twenty-shared/ai';
import {
  type ObjectsPermissions,
  type ObjectsPermissionsByRoleId,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { executeToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-tool-from-tool-set.util';
import { toolSetToDescriptors } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { computePermissionIntersection } from 'src/engine/twenty-orm/utils/compute-permission-intersection.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';

@Injectable()
export class MyahInboxToolProvider implements ToolProvider {
  readonly category = ToolCategory.MYAH_INBOX;

  constructor(
    @Inject(MYAH_INBOX_TOOL_SERVICE_TOKEN)
    private readonly myahInboxToolService: MyahInboxToolWorkspaceService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    if (
      !context.authContext ||
      !isUserAuthContext(context.authContext) ||
      !context.authContext.user ||
      context.authContext.workspace.id !== context.workspaceId ||
      context.authContext.user.id !== context.userId ||
      context.authContext.userWorkspaceId !== context.userWorkspaceId ||
      context.authContext.workspaceMemberId !==
        context.actorContext?.workspaceMemberId
    ) {
      return false;
    }

    const [{ rolesPermissions }, { flatObjectMetadataMaps }] =
      await Promise.all([
        this.workspaceCacheService.getOrRecompute(context.workspaceId, [
          'rolesPermissions',
        ]),
        this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps({
          workspaceId: context.workspaceId,
          flatMapsKeys: ['flatObjectMetadataMaps'],
        }),
      ]);
    const messageThreadObject = Object.values(
      flatObjectMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .find(({ nameSingular }) => nameSingular === 'messageThread');

    if (!messageThreadObject) {
      return false;
    }

    return (
      this.getObjectPermissions(
        rolesPermissions,
        context.rolePermissionConfig,
      )?.[messageThreadObject.id]?.canReadObjectRecords === true
    );
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    return toolSetToDescriptors(
      this.buildToolSet(context),
      ToolCategory.MYAH_INBOX,
      { includeSchemas: options?.includeSchemas ?? true },
    );
  }

  async executeStaticTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolProviderContext,
  ): Promise<ToolOutput> {
    return executeToolFromToolSet(
      this.buildToolSet(context),
      toolName,
      args,
      ToolCategory.MYAH_INBOX,
    );
  }

  private buildToolSet(context: ToolProviderContext): ToolSet {
    return this.myahInboxToolService.generateMyahInboxTools(context);
  }

  private getObjectPermissions(
    rolesPermissions: ObjectsPermissionsByRoleId,
    rolePermissionConfig: ToolProviderContext['rolePermissionConfig'],
  ): ObjectsPermissions | null {
    if ('intersectionOf' in rolePermissionConfig) {
      const allRolePermissions = rolePermissionConfig.intersectionOf
        .map((roleId) => rolesPermissions[roleId])
        .filter(isDefined);

      if (
        allRolePermissions.length !== rolePermissionConfig.intersectionOf.length
      ) {
        return null;
      }

      return allRolePermissions.length === 1
        ? allRolePermissions[0]
        : computePermissionIntersection(allRolePermissions);
    }

    if (
      'unionOf' in rolePermissionConfig &&
      rolePermissionConfig.unionOf.length === 1
    ) {
      return rolesPermissions[rolePermissionConfig.unionOf[0]] ?? null;
    }

    return null;
  }
}
