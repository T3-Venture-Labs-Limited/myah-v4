import { Injectable } from '@nestjs/common';

import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { DefaultAiCatalogService } from 'src/engine/metadata-modules/ai/ai-models/services/default-ai-catalog.service';
import { MANAGED_OPENROUTER_PROVIDER_NAME } from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

import { type AiProviderConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-provider-config.type';
import { type AiProvidersConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-providers-config.type';
import { extractConfigVariableName } from 'src/engine/metadata-modules/ai/ai-models/utils/extract-config-variable-name.util';

@Injectable()
export class ProviderConfigService {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly defaultAiCatalogService: DefaultAiCatalogService,
  ) {}

  getCatalogProviderNames(): Set<string> {
    return new Set(
      Object.keys(this.defaultAiCatalogService.getDefaultAiCatalog()),
    );
  }
  hasCustomOpenRouterProvider(): boolean {
    const customProviders = this.twentyConfigService.get('AI_PROVIDERS');

    return (
      customProviders !== null &&
      typeof customProviders === 'object' &&
      Object.prototype.hasOwnProperty.call(
        customProviders,
        MANAGED_OPENROUTER_PROVIDER_NAME,
      )
    );
  }

  isManagedOpenRouterEnabled(): boolean {
    return this.twentyConfigService.get('MANAGED_OPENROUTER_ENABLED');
  }

  getResolvedProviders(): AiProvidersConfig {
    const rawCatalog = this.defaultAiCatalogService.getDefaultAiCatalog();
    // Only resolve {{VAR}} templates in the committed catalog — never in
    // user-supplied custom providers, to prevent config variable exfiltration.
    const catalog = this.resolveTemplates(rawCatalog);
    const custom = this.twentyConfigService.get('AI_PROVIDERS');

    if (
      custom &&
      typeof custom === 'object' &&
      Object.prototype.hasOwnProperty.call(
        custom,
        MANAGED_OPENROUTER_PROVIDER_NAME,
      )
    ) {
      const { [MANAGED_OPENROUTER_PROVIDER_NAME]: customOpenRouter, ...rest } =
        custom;

      return {
        ...catalog,
        ...rest,
        [`${MANAGED_OPENROUTER_PROVIDER_NAME}-custom`]: customOpenRouter,
      };
    }

    return { ...catalog, ...custom };
  }

  private resolveTemplates(providers: AiProvidersConfig): AiProvidersConfig {
    const result: AiProvidersConfig = {};

    for (const [name, config] of Object.entries(providers)) {
      result[name] = this.resolveProviderTemplates(config);
    }

    return result;
  }

  private resolveProviderTemplates(config: AiProviderConfig): AiProviderConfig {
    return {
      ...config,
      baseUrl: this.resolveTemplate(config.baseUrl),
      apiKey: this.resolveTemplate(config.apiKey),
      accessKeyId: this.resolveTemplate(config.accessKeyId),
      secretAccessKey: this.resolveTemplate(config.secretAccessKey),
    };
  }

  private resolveTemplate(value?: string): string | undefined {
    if (!value) {
      return value;
    }

    const varName = extractConfigVariableName(value);

    if (!varName) {
      return value;
    }

    // Registered config variables first (supports admin panel / DB overrides),
    // then fall back to process.env for vars not in ConfigVariables
    // (e.g. when CI replaces the catalog with custom provider entries).
    try {
      const resolved = this.twentyConfigService.get(
        varName as keyof ConfigVariables,
      ) as string | undefined;

      if (resolved) {
        return resolved;
      }
    } catch {
      // Not a registered config variable — fall through to env
    }

    return process.env[varName] || undefined;
  }
}
