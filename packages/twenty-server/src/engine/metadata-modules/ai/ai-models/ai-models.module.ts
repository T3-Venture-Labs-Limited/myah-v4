import { Global, Module } from '@nestjs/common';

import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { MetricsModule } from 'src/engine/core-modules/metrics/metrics.module';
import { AiModelConfigService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-config.service';
import { AiModelPreferencesService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-preferences.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { DefaultAiCatalogService } from 'src/engine/metadata-modules/ai/ai-models/services/default-ai-catalog.service';
import { ModelsDevCatalogService } from 'src/engine/metadata-modules/ai/ai-models/services/models-dev-catalog.service';
import { NativeToolBinderService } from 'src/engine/metadata-modules/ai/ai-models/services/native-tool-binder.service';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';
import { ManagedOpenRouterAdmissionService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-admission.service';
import { ProviderConfigService } from 'src/engine/metadata-modules/ai/ai-models/services/provider-config.service';
import { SdkProviderFactoryService } from 'src/engine/metadata-modules/ai/ai-models/services/sdk-provider-factory.service';

@Global()
@Module({
  imports: [MetricsModule, ManagedProviderBillingModule],
  providers: [
    DefaultAiCatalogService,
    ProviderConfigService,
    SdkProviderFactoryService,
    ModelsDevCatalogService,
    AiModelPreferencesService,
    AiModelRegistryService,
    AiModelConfigService,
    NativeToolBinderService,
    ManagedOpenRouterModelService,
    ManagedOpenRouterAdmissionService,
  ],
  exports: [
    DefaultAiCatalogService,
    AiModelRegistryService,
    AiModelPreferencesService,
    AiModelConfigService,
    SdkProviderFactoryService,
    ModelsDevCatalogService,
    NativeToolBinderService,
    ManagedOpenRouterModelService,
  ],
})
export class AiModelsModule {}
