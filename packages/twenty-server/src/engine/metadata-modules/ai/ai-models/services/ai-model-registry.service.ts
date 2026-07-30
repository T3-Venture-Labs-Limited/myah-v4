import { Injectable, Logger } from '@nestjs/common';

import { type LanguageModel } from 'ai';
import { type AiSdkPackage } from 'twenty-shared/ai';

import { ConfigVariablesGroup } from 'src/engine/core-modules/twenty-config/enums/config-variables-group.enum';
import { ConfigGroupHashService } from 'src/engine/core-modules/twenty-config/services/config-group-hash.service';
import {
  MANAGED_OPENROUTER_MODEL_IDS,
  MANAGED_OPENROUTER_PROVIDER_NAME,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';
import { AiModelRole } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-role.enum';

import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import { AiModelPreferencesService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-preferences.service';
import { ProviderConfigService } from 'src/engine/metadata-modules/ai/ai-models/services/provider-config.service';
import { SdkProviderFactoryService } from 'src/engine/metadata-modules/ai/ai-models/services/sdk-provider-factory.service';
import { type AiModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-config.type';
import { type AiProviderConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-provider-config.type';
import { type AiProviderModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-provider-model-config.type';
import { type AiProvidersConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-providers-config.type';
import { DEFAULT_CONTEXT_WINDOW_TOKENS } from 'src/engine/metadata-modules/ai/ai-models/types/default-context-window-tokens.const';
import {
  AUTO_SELECT_FAST_MODEL_ID,
  AUTO_SELECT_SMART_MODEL_ID,
} from 'twenty-shared/constants';
import { isAutoSelectModelId } from 'twenty-shared/utils';

import { DEFAULT_MAX_OUTPUT_TOKENS } from 'src/engine/metadata-modules/ai/ai-models/types/default-max-output-tokens.const';
import { buildCompositeModelId } from 'src/engine/metadata-modules/ai/ai-models/utils/composite-model-id.util';
import { inferModelFamily } from 'src/engine/metadata-modules/ai/ai-models/utils/infer-model-family.util';
import { isProviderConfigured } from 'src/engine/metadata-modules/ai/ai-models/utils/is-provider-configured.util';
import {
  isModelAllowedByWorkspace,
  type WorkspaceModelAvailabilitySettings,
} from 'src/engine/metadata-modules/ai/ai-models/utils/is-model-allowed.util';
import { workspaceHasEnabledModels } from 'src/engine/metadata-modules/ai/ai-models/utils/workspace-has-enabled-models.util';

export interface RegisteredAiModel {
  modelId: string;
  sdkPackage: AiSdkPackage;
  model: LanguageModel;
  supportsReasoning?: boolean;
  providerName?: string;
  modelsDevName?: string;
}

@Injectable()
export class AiModelRegistryService {
  private readonly logger = new Logger(AiModelRegistryService.name);
  private modelRegistry: Map<string, RegisteredAiModel> = new Map();
  private modelConfigCache: Map<string, AiModelConfig> = new Map();
  private providerModelDefCache: Map<
    string,
    { providerName: string; modelDef: AiProviderModelConfig }
  > = new Map();
  private currentConfigHash: string | null = null;

  constructor(
    private readonly providerConfigService: ProviderConfigService,
    private readonly sdkProviderFactory: SdkProviderFactoryService,
    private readonly preferencesService: AiModelPreferencesService,
    private readonly configGroupHashService: ConfigGroupHashService,
  ) {}

  // The registry is rebuilt lazily whenever the LLM-group config hash changes,
  // so any mutation to an LLM-tagged config variable is picked up automatically
  // on the next read — no explicit refresh from callers needed.
  private ensureFresh(): void {
    const configHash = [
      this.configGroupHashService.computeHash(ConfigVariablesGroup.LLM),
      this.providerConfigService.isManagedOpenRouterEnabled(),
      this.providerConfigService.hasCustomOpenRouterProvider(),
    ].join(':');

    if (configHash === this.currentConfigHash) {
      return;
    }

    this.buildModelRegistry();
    this.currentConfigHash = configHash;
  }

  private buildModelRegistry(): void {
    this.modelRegistry.clear();
    this.sdkProviderFactory.clearCache();
    this.modelConfigCache.clear();
    this.providerModelDefCache.clear();

    const providers = this.providerConfigService.getResolvedProviders();

    this.registerModelsFromProviders(providers);
  }

  private registerModelsFromProviders(providers: AiProvidersConfig): void {
    for (const [providerKey, config] of Object.entries(providers)) {
      const isManagedProvider =
        providerKey === MANAGED_OPENROUTER_PROVIDER_NAME;

      if (
        isManagedProvider &&
        !this.providerConfigService.isManagedOpenRouterEnabled()
      ) {
        continue;
      }
      if (!config.npm) {
        this.logger.warn(
          `Skipping provider "${providerKey}": missing npm field`,
        );
        continue;
      }

      const models = config.models ?? [];

      if (models.length === 0) {
        continue;
      }

      const sdkInstance = isProviderConfigured(config)
        ? this.sdkProviderFactory.createProvider(providerKey, config)
        : undefined;

      for (const modelDef of models) {
        const compositeId = buildCompositeModelId(providerKey, modelDef.name);

        this.modelConfigCache.set(
          compositeId,
          this.toAiModelConfig(compositeId, config, modelDef),
        );

        this.providerModelDefCache.set(compositeId, {
          providerName: providerKey,
          modelDef,
        });

        if (sdkInstance) {
          this.modelRegistry.set(compositeId, {
            modelId: compositeId,
            sdkPackage: config.npm,
            model: sdkInstance.createModel(modelDef.name),
            supportsReasoning: modelDef.supportsReasoning,
            providerName: providerKey,
            modelsDevName: config.name,
          });
        }
      }
    }
  }

  private toAiModelConfig(
    compositeId: string,
    providerConfig: AiProviderConfig,
    modelDef: AiProviderModelConfig,
  ): AiModelConfig {
    return {
      modelId: compositeId,
      label: modelDef.label,
      sdkPackage: providerConfig.npm,
      description: modelDef.description ?? compositeId,
      modelFamily:
        modelDef.modelFamily ??
        inferModelFamily(providerConfig.name ?? '', modelDef.name),
      dataResidency: providerConfig.dataResidency,
      inputCostPerMillionTokens: modelDef.inputCostPerMillionTokens ?? 0,
      outputCostPerMillionTokens: modelDef.outputCostPerMillionTokens ?? 0,
      cachedInputCostPerMillionTokens: modelDef.cachedInputCostPerMillionTokens,
      cacheCreationCostPerMillionTokens:
        modelDef.cacheCreationCostPerMillionTokens,
      longContextCost: modelDef.longContextCost,
      contextWindowTokens:
        modelDef.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: modelDef.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      modalities: modelDef.modalities,
      supportsReasoning: modelDef.supportsReasoning,
      isDeprecated: modelDef.isDeprecated,
    };
  }

  getModel(modelId: string): RegisteredAiModel | undefined {
    this.ensureFresh();

    return this.modelRegistry.get(modelId);
  }

  getAvailableModels(): RegisteredAiModel[] {
    this.ensureFresh();

    return Array.from(this.modelRegistry.values());
  }

  getModelConfig(modelId: string): AiModelConfig | undefined {
    this.ensureFresh();

    return this.modelConfigCache.get(modelId);
  }

  getRecommendedModelIds(): Set<string> {
    return this.preferencesService.getRecommendedModelIds();
  }
  private getFirstAvailableModelFromList(
    modelIds: string[],
    workspaceId?: string,
  ): RegisteredAiModel | undefined {
    for (const modelId of modelIds) {
      const model = this.getModel(modelId);

      if (model && this.isModelAllowedForWorkspace(model, workspaceId)) {
        return model;
      }
    }

    return undefined;
  }

  private isModelAllowedForWorkspace(
    model: RegisteredAiModel,
    workspaceId?: string,
  ): boolean {
    if (!workspaceId) {
      return model.providerName !== MANAGED_OPENROUTER_PROVIDER_NAME;
    }

    const workspaceEligible =
      this.providerConfigService.isManagedOpenRouterWorkspaceEligible(
        workspaceId,
      );
    const isManaged = model.providerName === MANAGED_OPENROUTER_PROVIDER_NAME;

    if (workspaceEligible !== isManaged) {
      return false;
    }

    return (
      !isManaged ||
      !model.modelId.endsWith('google/gemma-4-31b-it:free') ||
      this.providerConfigService.isManagedOpenRouterGemmaWorkspaceEligible(
        workspaceId,
      )
    );
  }

  getAvailableModelsForWorkspace(workspaceId?: string): RegisteredAiModel[] {
    return this.getAvailableModels().filter((model) =>
      this.isModelAllowedForWorkspace(model, workspaceId),
    );
  }

  getDefaultSpeedModel(workspaceId?: string): RegisteredAiModel {
    return this.getDefaultModelForRole(AiModelRole.FAST, workspaceId);
  }

  getDefaultPerformanceModel(workspaceId?: string): RegisteredAiModel {
    return this.getDefaultModelForRole(AiModelRole.SMART, workspaceId);
  }

  private getDefaultModelForRole(
    role: AiModelRole,
    workspaceId?: string,
  ): RegisteredAiModel {
    const prefs = this.preferencesService.getPreferences();
    const preferenceKey =
      role === AiModelRole.FAST ? 'defaultFastModels' : 'defaultSmartModels';

    const managedDefault = this.getModel(
      'openrouter/deepseek/deepseek-v4-flash',
    );
    let model =
      managedDefault &&
      this.isModelAdminAllowed(managedDefault.modelId) &&
      this.isModelAllowedForWorkspace(managedDefault, workspaceId)
        ? managedDefault
        : this.getFirstAvailableModelFromList(
            prefs[preferenceKey] ?? [],
            workspaceId,
          );

    if (!model) {
      model = this.getAvailableModels().find(
        (candidate) =>
          this.isModelAdminAllowed(candidate.modelId) &&
          this.isModelAllowedForWorkspace(candidate, workspaceId),
      );
    }

    if (!model) {
      throw new AiException(
        'No AI models are available. Configure at least one AI provider.',
        AiExceptionCode.API_KEY_NOT_CONFIGURED,
      );
    }

    return model;
  }

  getEffectiveModelConfig(
    modelId: string,
    workspaceId?: string,
  ): AiModelConfig {
    this.ensureFresh();

    if (isAutoSelectModelId(modelId)) {
      const defaultModel =
        modelId === AUTO_SELECT_FAST_MODEL_ID
          ? this.getDefaultSpeedModel(workspaceId)
          : this.getDefaultPerformanceModel(workspaceId);

      return (
        this.modelConfigCache.get(defaultModel.modelId) ??
        this.createDefaultConfigForCustomModel(defaultModel)
      );
    }
    const managedModel = modelId.startsWith(
      `${MANAGED_OPENROUTER_PROVIDER_NAME}/`,
    );
    const workspaceEligible =
      workspaceId !== undefined &&
      this.providerConfigService.isManagedOpenRouterWorkspaceEligible(
        workspaceId,
      );

    const invalidForWorkspace =
      workspaceId === undefined
        ? false
        : workspaceEligible !== managedModel ||
          (managedModel &&
            (!MANAGED_OPENROUTER_MODEL_IDS.includes(
              modelId as (typeof MANAGED_OPENROUTER_MODEL_IDS)[number],
            ) ||
              (modelId.endsWith('google/gemma-4-31b-it:free') &&
                !this.providerConfigService.isManagedOpenRouterGemmaWorkspaceEligible(
                  workspaceId,
                ))));

    if (invalidForWorkspace) {
      throw new AiException(
        'The selected model is not available in this workspace.',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }

    const config = this.modelConfigCache.get(modelId);

    if (config) {
      return config;
    }

    const registeredModel = this.getModel(modelId);

    if (registeredModel) {
      return this.createDefaultConfigForCustomModel(registeredModel);
    }

    throw new AiException(
      `Model with ID ${modelId} not found`,
      AiExceptionCode.AGENT_EXECUTION_FAILED,
    );
  }

  private createDefaultConfigForCustomModel(
    registeredModel: RegisteredAiModel,
  ): AiModelConfig {
    return {
      modelId: registeredModel.modelId,
      label: registeredModel.modelId,
      description: `Custom model: ${registeredModel.modelId}`,
      modelFamily: inferModelFamily(
        registeredModel.modelsDevName ?? '',
        registeredModel.modelId,
      ),
      sdkPackage: registeredModel.sdkPackage,
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
      contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    };
  }

  isModelAdminAllowed(modelId: string): boolean {
    if (isAutoSelectModelId(modelId)) {
      return true;
    }

    const prefs = this.preferencesService.getPreferences();
    const disabledModels = prefs.disabledModels ?? [];

    return !disabledModels.includes(modelId);
  }

  validateModelAvailability(
    modelId: string,
    availabilitySettings: WorkspaceModelAvailabilitySettings,
  ): void {
    const workspaceId = availabilitySettings.id;
    const managedModel = modelId.startsWith(
      `${MANAGED_OPENROUTER_PROVIDER_NAME}/`,
    );
    const isGemmaModel = modelId.endsWith('google/gemma-4-31b-it:free');

    if (
      managedModel &&
      (!MANAGED_OPENROUTER_MODEL_IDS.some(
        (approvedId) => approvedId === modelId,
      ) ||
        !this.providerConfigService.isManagedOpenRouterWorkspaceEligible(
          workspaceId,
        ) ||
        (isGemmaModel &&
          !this.providerConfigService.isManagedOpenRouterGemmaWorkspaceEligible(
            workspaceId,
          )))
    ) {
      throw new AiException(
        'The selected model is not available in this workspace.',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }

    if (!this.isModelAdminAllowed(modelId)) {
      throw new AiException(
        'The selected model has been disabled by the administrator.',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }

    const workspaceEligible =
      this.providerConfigService.isManagedOpenRouterWorkspaceEligible(
        workspaceId,
      );
    const recommendedModelIds =
      this.preferencesService.getRecommendedModelIds();
    const isAvailable = workspaceEligible
      ? managedModel || isAutoSelectModelId(modelId)
      : managedModel
        ? false
        : isAutoSelectModelId(modelId)
          ? workspaceHasEnabledModels(availabilitySettings, recommendedModelIds)
          : isModelAllowedByWorkspace(
              modelId,
              availabilitySettings,
              recommendedModelIds,
            );

    if (!isAvailable) {
      throw new AiException(
        'The selected model is not available in this workspace.',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }
  }

  getAdminFilteredModels(): RegisteredAiModel[] {
    return this.getAvailableModels().filter((model) =>
      this.isModelAdminAllowed(model.modelId),
    );
  }
  getAllModelsWithStatus(): Array<{
    modelConfig: AiModelConfig;
    isAvailable: boolean;
    isAdminEnabled: boolean;
    isRecommended: boolean;
    providerName?: string;
    name?: string;
  }> {
    this.ensureFresh();
    const recommended = this.getRecommendedModelIds();

    return Array.from(this.modelConfigCache.values()).map((modelConfig) => {
      const registered = this.modelRegistry.get(modelConfig.modelId);
      const cached = this.providerModelDefCache.get(modelConfig.modelId);

      return {
        modelConfig,
        isAvailable: !!registered,
        isAdminEnabled: this.isModelAdminAllowed(modelConfig.modelId),
        isRecommended: recommended.has(modelConfig.modelId),
        providerName: registered?.providerName ?? cached?.providerName,
        name: cached?.modelDef.name,
      };
    });
  }

  async setModelAdminEnabled(modelId: string, enabled: boolean): Promise<void> {
    this.validateModelInRegistry(modelId);
    await this.preferencesService.setModelAdminEnabled(modelId, enabled);
  }

  async setModelRecommended(
    modelId: string,
    recommended: boolean,
  ): Promise<void> {
    this.validateModelInRegistry(modelId);
    await this.preferencesService.setModelRecommended(modelId, recommended);
  }

  async setModelsAdminEnabled(
    modelIds: string[],
    enabled: boolean,
  ): Promise<void> {
    modelIds.forEach((id) => this.validateModelInRegistry(id));
    await this.preferencesService.setModelsAdminEnabled(modelIds, enabled);
  }

  async setModelsRecommended(
    modelIds: string[],
    recommended: boolean,
  ): Promise<void> {
    modelIds.forEach((id) => this.validateModelInRegistry(id));
    await this.preferencesService.setModelsRecommended(modelIds, recommended);
  }

  async setDefaultModel(role: AiModelRole, modelId: string): Promise<void> {
    this.validateModelInRegistry(modelId);
    await this.preferencesService.setDefaultModel(role, modelId);
  }

  private validateModelInRegistry(modelId: string): void {
    this.ensureFresh();

    if (!this.providerModelDefCache.has(modelId)) {
      throw new AiException(
        `Cannot update model "${modelId}": not found in registry`,
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }
  }

  getResolvedProvidersForAdmin(): AiProvidersConfig {
    return this.providerConfigService.getResolvedProviders();
  }

  getCatalogProviderNames(): Set<string> {
    return this.providerConfigService.getCatalogProviderNames();
  }

  resolveModelForAgent(
    agent: { modelId: string } | null,
    workspaceId?: string,
  ): RegisteredAiModel {
    const aiModel = this.getEffectiveModelConfig(
      agent?.modelId ?? AUTO_SELECT_SMART_MODEL_ID,
      workspaceId,
    );

    const registeredModel = this.getModel(aiModel.modelId);

    if (!registeredModel) {
      throw new AiException(
        `Model ${aiModel.modelId} not found in registry. Check that the corresponding AI provider is configured.`,
        AiExceptionCode.API_KEY_NOT_CONFIGURED,
      );
    }

    return registeredModel;
  }
}
