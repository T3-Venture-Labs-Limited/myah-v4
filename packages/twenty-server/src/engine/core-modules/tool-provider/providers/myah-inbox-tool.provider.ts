import { Inject, Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { PermissionFlagType } from 'twenty-shared/constants';
import { ToolCategory } from 'twenty-shared/ai';
import {
  type ObjectsPermissions,
  type ObjectsPermissionsByRoleId,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import {
  MYAH_INBOX_MUTATION_TOOL_NAMES,
  MYAH_INBOX_READ_TOOL_NAMES,
  MYAH_INBOX_REPLY_SEND_STATUS_TOOL_NAMES,
  MYAH_INBOX_TOOL_NAMES,
} from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { executeMyahToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-myah-tool-from-tool-set.util';
import { toolSetToDescriptors } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { computePermissionIntersection } from 'src/engine/twenty-orm/utils/compute-permission-intersection.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

type InboxPermissionState = {
  authContext: UserWorkspaceAuthContext;
  objectPermissions: ObjectsPermissions;
  messageThreadObjectId: string;
};

@Injectable()
export class MyahInboxToolProvider implements ToolProvider {
  readonly category = ToolCategory.MYAH_INBOX;

  constructor(
    @Inject(MYAH_INBOX_TOOL_SERVICE_TOKEN)
    private readonly myahInboxToolService: MyahInboxToolWorkspaceService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    const permissionState = await this.getPermissionState(context);

    return permissionState !== null && this.hasReadPermission(permissionState);
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    return toolSetToDescriptors(
      await this.buildToolSet(context),
      ToolCategory.MYAH_INBOX,
      { includeSchemas: options?.includeSchemas ?? true },
    );
  }

  async executeStaticTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolProviderContext,
  ): Promise<ToolOutput> {
    return executeMyahToolFromToolSet(
      await this.buildToolSet(context),
      toolName,
      args,
      ToolCategory.MYAH_INBOX,
    );
  }

  private async buildToolSet(context: ToolProviderContext): Promise<ToolSet> {
    const permissionState = await this.getPermissionState(context);

    if (!permissionState || !this.hasReadPermission(permissionState)) return {};

    const [tools, hasEmailPermission] = await Promise.all([
      this.myahInboxToolService.generateMyahInboxTools(context),
      this.permissionsService.hasToolPermission(
        context.rolePermissionConfig,
        context.workspaceId,
        PermissionFlagType.SEND_EMAIL_TOOL,
      ),
    ]);

    return Object.fromEntries(
      MYAH_INBOX_TOOL_NAMES.filter(
        (toolName) =>
          tools[toolName] !== undefined &&
          this.hasToolPermission(toolName, permissionState, hasEmailPermission),
      ).map((toolName) => [toolName, tools[toolName]]),
    ) as ToolSet;
  }

  private hasReadPermission(permissionState: InboxPermissionState): boolean {
    return (
      permissionState.objectPermissions[permissionState.messageThreadObjectId]
        ?.canReadObjectRecords === true
    );
  }

  private hasToolPermission(
    toolName: (typeof MYAH_INBOX_TOOL_NAMES)[number],
    permissionState: InboxPermissionState,
    hasEmailPermission: boolean,
  ): boolean {
    if (MYAH_INBOX_READ_TOOL_NAMES.includes(toolName as never)) return true;

    if (MYAH_INBOX_MUTATION_TOOL_NAMES.includes(toolName as never)) {
      return (
        permissionState.objectPermissions[permissionState.messageThreadObjectId]
          ?.canUpdateObjectRecords === true
      );
    }

    return (
      MYAH_INBOX_REPLY_SEND_STATUS_TOOL_NAMES.includes(toolName as never) &&
      hasEmailPermission
    );
  }

  private async getPermissionState(
    context: ToolProviderContext,
  ): Promise<InboxPermissionState | null> {
    const authContext = this.getMatchingUserAuthContext(context);

    if (!authContext) return null;

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
    const objectPermissions = this.getObjectPermissions(
      rolesPermissions,
      context.rolePermissionConfig,
    );

    if (!messageThreadObject || !objectPermissions) return null;

    return {
      authContext,
      objectPermissions,
      messageThreadObjectId: messageThreadObject.id,
    };
  }

  private getMatchingUserAuthContext(
    context: ToolProviderContext,
  ): UserWorkspaceAuthContext | null {
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
      return null;
    }

    return context.authContext;
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
