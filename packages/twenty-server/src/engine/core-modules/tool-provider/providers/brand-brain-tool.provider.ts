import { Inject, Injectable, Optional } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { ToolCategory } from 'twenty-shared/ai';

import { BRAND_BRAIN_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/brand-brain-tool-service.token';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { executeToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-tool-from-tool-set.util';
import { toolSetToDescriptors } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { MyahBrandBrainWorkspaceService } from 'src/modules/myah-brand-brain/services/myah-brand-brain.workspace-service';

const BRAND_BRAIN_PUBLIC_TOOL_PREFIX = 'app_';

@Injectable()
export class BrandBrainToolProvider implements ToolProvider {
  readonly category = ToolCategory.BRAND_BRAIN;

  constructor(
    @Optional()
    @Inject(BRAND_BRAIN_TOOL_SERVICE_TOKEN)
    private readonly workspaceService: MyahBrandBrainWorkspaceService | null,
  ) {}

  async isAvailable(_context: ToolProviderContext): Promise<boolean> {
    return this.workspaceService !== null;
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    const toolSet = this.buildPublicToolSet(context);

    return toolSetToDescriptors(toolSet, this.category, {
      includeSchemas: options?.includeSchemas,
      icon: 'IconNotebook',
    });
  }

  async executeStaticTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolProviderContext,
  ): Promise<ToolOutput> {
    const result = (await executeToolFromToolSet(
      this.buildPublicToolSet(context),
      toolName,
      args,
      this.category,
    )) as unknown as object;

    return {
      success: true,
      message: 'Brand Brain tool executed successfully',
      result,
    };
  }

  private buildPublicToolSet(context: ToolProviderContext): ToolSet {
    if (!this.workspaceService) {
      throw new Error('Brand Brain workspace service is not available.');
    }

    const sourceToolSet = this.workspaceService.generateBrandBrainTools({
      workspaceId: context.workspaceId,
      rolePermissionConfig: context.rolePermissionConfig,
    });

    return Object.fromEntries(
      Object.entries(sourceToolSet).map(([name, tool]) => [
        `${BRAND_BRAIN_PUBLIC_TOOL_PREFIX}${name.replace(/-/g, '_')}`,
        tool,
      ]),
    ) as ToolSet;
  }
}
