import { Injectable } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

export type OpenRouterGenerationLookup =
  | {
      status: 'found';
      id: string;
      model: string;
      promptTokens: number;
      cachedPromptTokens: number;
      completionTokens: number;
      totalCostUsd: number;
    }
  | { status: 'not_found' | 'unavailable' | 'malformed' };

@Injectable()
export class OpenRouterGenerationLookupService {
  constructor(private readonly configService: TwentyConfigService) {}

  async lookup(
    providerExecutionId: string,
  ): Promise<OpenRouterGenerationLookup> {
    const apiKey = this.configService.get('OPENROUTER_API_KEY');

    if (!apiKey || !providerExecutionId.trim()) {
      return { status: 'unavailable' };
    }

    try {
      const response = await fetch(
        `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(providerExecutionId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      if (response.status === 404) {
        return { status: 'not_found' };
      }

      if (!response.ok) {
        return { status: 'unavailable' };
      }

      const body: unknown = await response.json();
      const data =
        typeof body === 'object' && body !== null && 'data' in body
          ? (body as { data?: unknown }).data
          : undefined;

      if (!this.isRecord(data)) {
        return { status: 'malformed' };
      }

      const id = this.string(data.id);
      const model = this.string(data.model);
      const promptTokens = this.nonNegativeInteger(data.tokens_prompt);
      const completionTokens = this.nonNegativeInteger(data.tokens_completion);
      const cachedPromptTokens = this.nonNegativeInteger(
        data.native_tokens_cached,
      );
      const totalCostUsd = this.nonNegativeNumber(data.total_cost);

      if (
        !id ||
        !model ||
        promptTokens === null ||
        completionTokens === null ||
        cachedPromptTokens === null ||
        cachedPromptTokens > promptTokens ||
        totalCostUsd === null
      ) {
        return { status: 'malformed' };
      }

      return {
        status: 'found',
        cachedPromptTokens,
        completionTokens,
        id,
        model,
        promptTokens,
        totalCostUsd,
      };
    } catch {
      return { status: 'unavailable' };
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private nonNegativeInteger(value: unknown): number | null {
    return Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : null;
  }

  private nonNegativeNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : null;
  }
}
