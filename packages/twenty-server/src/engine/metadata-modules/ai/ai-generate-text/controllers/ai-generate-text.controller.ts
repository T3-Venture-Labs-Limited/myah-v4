import { Body, Controller, Post, UseFilters, UseGuards } from '@nestjs/common';

import { generateText } from 'ai';
import { PermissionFlagType } from 'twenty-shared/constants';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { BillingUsageService } from 'src/engine/core-modules/billing/services/billing-usage.service';
import { UsageOperationType } from 'src/engine/core-modules/usage/enums/usage-operation-type.enum';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import { AiBillingService } from 'src/engine/metadata-modules/ai/ai-billing/services/ai-billing.service';
import { AiRestApiExceptionFilter } from 'src/engine/metadata-modules/ai/filters/ai-api-exception.filter';
import { GenerateTextInput } from 'src/engine/metadata-modules/ai/ai-generate-text/dtos/generate-text.input';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';
import { PermissionsRestApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-rest-api-exception.filter';

@Controller('rest/ai')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(
  PermissionsRestApiExceptionFilter,
  AiRestApiExceptionFilter,
  RestApiExceptionFilter,
)
export class AiGenerateTextController {
  constructor(
    private readonly aiModelRegistryService: AiModelRegistryService,
    private readonly aiBillingService: AiBillingService,
    private readonly billingUsageService: BillingUsageService,
    private readonly managedOpenRouterModelService: ManagedOpenRouterModelService,
  ) {}

  @Post('generate-text')
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.AI))
  async handleGenerateText(
    @Body() body: GenerateTextInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    if (this.aiModelRegistryService.getAvailableModels().length === 0) {
      throw new AiException(
        'No AI models are available. Please configure at least one AI provider API key.',
        AiExceptionCode.API_KEY_NOT_CONFIGURED,
      );
    }

    const resolvedModelId = body.modelId ?? workspace.fastModel;

    this.aiModelRegistryService.validateModelAvailability(
      resolvedModelId,
      workspace,
    );

    const registeredModel =
      await this.aiModelRegistryService.resolveModelForAgent(
        { modelId: resolvedModelId },
        workspace.id,
      );
    const modelConfig = this.aiModelRegistryService.getEffectiveModelConfig(
      registeredModel.modelId,
      workspace.id,
    );
    const usesManagedOpenRouter =
      this.managedOpenRouterModelService.isManagedModel({
        modelId: registeredModel.modelId,
        providerName: registeredModel.providerName,
      });

    if (!usesManagedOpenRouter) {
      await this.billingUsageService.hasAvailableCreditsOrThrow(workspace.id);
    }
    const executionModel = this.managedOpenRouterModelService.wrapModel({
      executionSurface: 'rest-generate',
      actorUserWorkspaceId: userWorkspaceId,
      model: registeredModel.model,
      modelConfig,
      providerName: registeredModel.providerName,
      requestIdRoot: body.operationId,
      workspaceId: workspace.id,
    });

    let result: Awaited<ReturnType<typeof generateText>> | undefined;

    try {
      result = await generateText({
        model: executionModel,
        system: body.systemPrompt,
        prompt: body.userPrompt,
        maxRetries: usesManagedOpenRouter ? 0 : undefined,
      });

      return {
        text: result.text,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        },
      };
    } finally {
      if (result && !usesManagedOpenRouter) {
        void this.aiBillingService.calculateAndBillUsage(
          resolvedModelId,
          {
            usage: result.usage,
            cacheCreationTokens:
              result.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
          },
          workspace.id,
          UsageOperationType.AI_WORKFLOW_TOKEN,
          null,
          userWorkspaceId,
        );
      }
    }
  }
}
