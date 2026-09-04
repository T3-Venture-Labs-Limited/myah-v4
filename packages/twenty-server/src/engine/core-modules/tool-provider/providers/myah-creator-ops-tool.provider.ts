import { Inject, Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { ToolCategory } from 'twenty-shared/ai';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  type ObjectsPermissions,
  type ObjectsPermissionsByRoleId,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_CREATOR_OPS_READ_TOOL_NAMES,
  MYAH_CREATOR_OPS_TOOL_NAMES,
} from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-creator-ops-tool-service.token';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { executeMyahToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-myah-tool-from-tool-set.util';
import { toolSetToDescriptors } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { computePermissionIntersection } from 'src/engine/twenty-orm/utils/compute-permission-intersection.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';

const creatorOpsObjectUniversalIdentifiers = {
  creator: MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
  creatorList: MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
  creatorListMember:
    MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
  campaign: MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
  campaignCreator: MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
  campaignCreatorList:
    MYAH_STANDARD_OBJECTS.campaignCreatorList.universalIdentifier,
  campaignCreatorListSource:
    MYAH_STANDARD_OBJECTS.campaignCreatorListSource.universalIdentifier,
} as const;

type CreatorOpsObjectName = keyof typeof creatorOpsObjectUniversalIdentifiers;
const ALL_CREATOR_OPS_OBJECT_NAMES = Object.keys(
  creatorOpsObjectUniversalIdentifiers,
) as CreatorOpsObjectName[];
type CreatorOpsPermissionState = {
  authContext: UserWorkspaceAuthContext;
  objectPermissions: ObjectsPermissions;
  objectIds: Record<CreatorOpsObjectName, string>;
};

@Injectable()
export class MyahCreatorOpsToolProvider implements ToolProvider {
  readonly category = ToolCategory.MYAH_CREATOR_OPS;

  constructor(
    @Inject(MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN)
    private readonly myahCreatorOpsToolService: MyahCreatorOpsToolWorkspaceService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    const permissionState = await this.getPermissionState(context);

    return (
      permissionState !== null &&
      MYAH_CREATOR_OPS_TOOL_NAMES.some((toolName) =>
        this.hasToolPermission(toolName, permissionState),
      )
    );
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    return toolSetToDescriptors(
      await this.buildToolSet(context),
      this.category,
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
      this.category,
    );
  }

  private async buildToolSet(context: ToolProviderContext): Promise<ToolSet> {
    const permissionState = await this.getPermissionState(context);

    if (!permissionState) return {};

    const tools = this.myahCreatorOpsToolService.generateMyahCreatorOpsTools({
      authContext: permissionState.authContext,
    });

    return Object.fromEntries(
      MYAH_CREATOR_OPS_TOOL_NAMES.filter(
        (toolName) =>
          tools[toolName] !== undefined &&
          this.hasToolPermission(toolName, permissionState),
      ).map((toolName) => [toolName, tools[toolName]]),
    ) as ToolSet;
  }

  private hasToolPermission(
    toolName: (typeof MYAH_CREATOR_OPS_TOOL_NAMES)[number],
    permissionState: CreatorOpsPermissionState,
  ): boolean {
    const hasRequiredReads = this.getRequiredReadObjectNames(toolName).every(
      (objectName) =>
        permissionState.objectPermissions[permissionState.objectIds[objectName]]
          ?.canReadObjectRecords === true,
    );

    if (!hasRequiredReads || this.isReadToolName(toolName)) {
      return hasRequiredReads;
    }

    return this.getRequiredUpdateObjectNames(toolName).every(
      (objectName) =>
        permissionState.objectPermissions[permissionState.objectIds[objectName]]
          ?.canUpdateObjectRecords === true,
    );
  }

  private isReadToolName(
    toolName: (typeof MYAH_CREATOR_OPS_TOOL_NAMES)[number],
  ): toolName is (typeof MYAH_CREATOR_OPS_READ_TOOL_NAMES)[number] {
    return MYAH_CREATOR_OPS_READ_TOOL_NAMES.includes(toolName as never);
  }

  private getRequiredReadObjectNames(
    toolName: (typeof MYAH_CREATOR_OPS_TOOL_NAMES)[number],
  ): readonly CreatorOpsObjectName[] {
    switch (toolName) {
      case 'add_creators_to_creator_list':
      case 'remove_creator_from_creator_list':
        return ['creator', 'creatorList', 'creatorListMember'];
      default:
        return ALL_CREATOR_OPS_OBJECT_NAMES;
    }
  }

  private getRequiredUpdateObjectNames(
    toolName: Exclude<
      (typeof MYAH_CREATOR_OPS_TOOL_NAMES)[number],
      (typeof MYAH_CREATOR_OPS_READ_TOOL_NAMES)[number]
    >,
  ): readonly CreatorOpsObjectName[] {
    switch (toolName) {
      case 'add_creators_to_creator_list':
      case 'remove_creator_from_creator_list':
        return ['creatorList'];
      case 'add_direct_campaign_creators':
      case 'approve_campaign_creator_list_additions':
        return ['campaign'];
      case 'attach_creator_lists_to_campaign':
        return ['campaign', 'creatorList'];
      case 'detach_creator_list_from_campaign':
        return ['campaign'];
    }
  }

  private async getPermissionState(
    context: ToolProviderContext,
  ): Promise<CreatorOpsPermissionState | null> {
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
    const objectIds = Object.fromEntries(
      Object.entries(creatorOpsObjectUniversalIdentifiers).map(
        ([name, universalIdentifier]) => {
          const object =
            flatObjectMetadataMaps.byUniversalIdentifier[universalIdentifier];

          return [name, object?.isActive === true ? object.id : undefined];
        },
      ),
    ) as Record<CreatorOpsObjectName, string | undefined>;

    if (Object.values(objectIds).some((objectId) => !objectId)) return null;

    const objectPermissions = this.getObjectPermissions(
      rolesPermissions,
      context.rolePermissionConfig,
    );

    if (!objectPermissions) return null;

    return {
      authContext,
      objectPermissions,
      objectIds: objectIds as Record<CreatorOpsObjectName, string>,
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
