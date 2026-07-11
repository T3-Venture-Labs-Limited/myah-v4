import { Injectable, Logger } from '@nestjs/common';

import { type UIMessage } from 'ai';

import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { type ToolContext } from 'src/engine/core-modules/tool-provider/types/tool-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import {
  escapeXmlAttribute,
  extractBrandNameForBrandWork,
  isBrandSpecificTask,
  slugifyBrandName,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/brand-brain-preflight-prompt.util';

export const BRAND_BRAIN_GET_CONTEXT_TOOL_NAME = 'app_brand_brain_get_context';

export type BrandBrainPreflightResult = {
  required: boolean;
  called: boolean;
  brandNameOrSlug: string | null;
  brandSlug: string | null;
  pageCount: number | null;
  hasRoot: boolean | null;
  hasIndex: boolean | null;
  hasLog: boolean | null;
  contextPart: string | null;
  durationMs: number;
  cacheHit: boolean;
  error: string | null;
};

type BrandBrainContextToolResult = {
  brandSlug?: string;
  pageCount?: number;
  hasRoot?: boolean;
  hasIndex?: boolean;
  hasLog?: boolean;
  contextMarkdown?: string;
};

type SpilledToolOutputResult = {
  spilled?: boolean;
  outputRef?: {
    fileId?: string;
    filename?: string;
  };
  hint?: string;
};

@Injectable()
export class BrandBrainPreflightService {
  private readonly logger = new Logger(BrandBrainPreflightService.name);

  constructor(private readonly toolRegistry: ToolRegistryService) {}

  injectContextIntoLastUserMessage(
    messages: UIMessage[],
    contextPart: string,
  ): UIMessage[] {
    const lastUserIndex = messages
      .map((message) => message.role)
      .lastIndexOf('user');

    if (lastUserIndex === -1 || !contextPart) {
      return messages;
    }

    const lastUserMessage = messages[lastUserIndex];

    return [
      ...messages.slice(0, lastUserIndex),
      {
        ...lastUserMessage,
        parts: [
          ...lastUserMessage.parts,
          {
            type: 'text',
            text: contextPart,
          },
        ],
      },
      ...messages.slice(lastUserIndex + 1),
    ];
  }

  async run({
    lastUserMessageText,
    toolContext,
  }: {
    lastUserMessageText: string;
    toolContext: ToolContext;
  }): Promise<BrandBrainPreflightResult> {
    const startedAt = performance.now();
    const brandNameOrSlug = extractBrandNameForBrandWork(lastUserMessageText);

    if (!brandNameOrSlug) {
      const required = isBrandSpecificTask(lastUserMessageText);

      return this.buildResult({
        startedAt,
        required,
        called: false,
        brandNameOrSlug: null,
        brandSlug: null,
        pageCount: null,
        hasRoot: null,
        hasIndex: null,
        hasLog: null,
        contextPart: required ? this.buildMissingBrandNameContext() : null,
        error: null,
      });
    }

    const output = await this.toolRegistry.resolveAndExecute(
      BRAND_BRAIN_GET_CONTEXT_TOOL_NAME,
      {
        brandNameOrSlug,
        task: lastUserMessageText,
      },
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );

    const durationMs = Math.round(performance.now() - startedAt);

    if (!output.success) {
      const error = this.extractError(output);

      if (this.isToolUnavailableError(error)) {
        this.logger.warn(
          `Brand Brain preflight skipped for ${brandNameOrSlug}: ${error}`,
        );

        return {
          required: false,
          called: true,
          brandNameOrSlug,
          brandSlug: null,
          pageCount: null,
          hasRoot: null,
          hasIndex: null,
          hasLog: null,
          contextPart: null,
          durationMs,
          cacheHit: false,
          error,
        };
      }

      this.logger.warn(
        `Brand Brain preflight failed for ${brandNameOrSlug}: ${error}`,
      );

      return {
        required: true,
        called: true,
        brandNameOrSlug,
        brandSlug: null,
        pageCount: null,
        hasRoot: null,
        hasIndex: null,
        hasLog: null,
        contextPart: this.buildFailedPreflightContext({
          brandNameOrSlug,
          error,
          durationMs,
        }),
        durationMs,
        cacheHit: false,
        error,
      };
    }

    if (this.isSpilledToolOutputResult(output.result)) {
      const error = `Brand Brain preflight output spilled before context could be injected${
        output.result.outputRef?.fileId
          ? `: ${output.result.outputRef.fileId}`
          : ''
      }`;

      this.logger.warn(`${error} for ${brandNameOrSlug}`);

      return {
        required: true,
        called: true,
        brandNameOrSlug,
        brandSlug: null,
        pageCount: null,
        hasRoot: null,
        hasIndex: null,
        hasLog: null,
        contextPart: this.buildFailedPreflightContext({
          brandNameOrSlug,
          error,
          durationMs,
        }),
        durationMs,
        cacheHit: false,
        error,
      };
    }

    const result = (output.result ?? {}) as BrandBrainContextToolResult;
    const pageCount = result.pageCount ?? 0;
    const brandSlug = result.brandSlug ?? slugifyBrandName(brandNameOrSlug);
    const hasRoot = result.hasRoot ?? pageCount > 0;
    const hasIndex = result.hasIndex ?? false;
    const hasLog = result.hasLog ?? false;

    return {
      required: true,
      called: true,
      brandNameOrSlug,
      brandSlug,
      pageCount,
      hasRoot,
      hasIndex,
      hasLog,
      contextPart:
        pageCount > 0 && result.contextMarkdown
          ? this.buildLoadedContext({
              brandNameOrSlug,
              brandSlug,
              pageCount,
              hasRoot,
              hasIndex,
              hasLog,
              durationMs,
              contextMarkdown: result.contextMarkdown,
            })
          : this.buildNoContextFoundContext({
              brandNameOrSlug,
              brandSlug,
              durationMs,
            }),
      durationMs,
      cacheHit: false,
      error: null,
    };
  }

  private buildResult({
    startedAt,
    required,
    called,
    brandNameOrSlug,
    brandSlug,
    pageCount,
    hasRoot,
    hasIndex,
    hasLog,
    contextPart,
    error,
  }: Omit<BrandBrainPreflightResult, 'durationMs' | 'cacheHit'> & {
    startedAt: number;
  }): BrandBrainPreflightResult {
    return {
      required,
      called,
      brandNameOrSlug,
      brandSlug,
      pageCount,
      hasRoot,
      hasIndex,
      hasLog,
      contextPart,
      durationMs: Math.round(performance.now() - startedAt),
      cacheHit: false,
      error,
    };
  }

  private buildLoadedContext({
    brandNameOrSlug,
    brandSlug,
    pageCount,
    hasRoot,
    hasIndex,
    hasLog,
    durationMs,
    contextMarkdown,
  }: {
    brandNameOrSlug: string;
    brandSlug: string;
    pageCount: number;
    hasRoot: boolean;
    hasIndex: boolean;
    hasLog: boolean;
    durationMs: number;
    contextMarkdown: string;
  }): string {
    return `<brand_brain_preflight required="true" called="true" brand_name_or_slug="${escapeXmlAttribute(brandNameOrSlug)}" brand_slug="${escapeXmlAttribute(brandSlug)}" page_count="${pageCount}" has_root="${hasRoot}" has_index="${hasIndex}" has_log="${hasLog}" duration_ms="${durationMs}" cache_hit="false">
Use this Brand Brain context before answering the user's brand-specific request.
Do not invent brand facts outside this context. If the context is incomplete, explicitly say what is missing.

${contextMarkdown}
</brand_brain_preflight>`;
  }

  private buildNoContextFoundContext({
    brandNameOrSlug,
    brandSlug,
    durationMs,
  }: {
    brandNameOrSlug: string;
    brandSlug: string;
    durationMs: number;
  }): string {
    return `<brand_brain_preflight required="true" called="true" brand_name_or_slug="${escapeXmlAttribute(brandNameOrSlug)}" brand_slug="${escapeXmlAttribute(brandSlug)}" page_count="0" duration_ms="${durationMs}" cache_hit="false">
No Brand Brain context was found for this brand.
Do not invent brand facts. Ask 2-3 setup questions or offer to create Brand Brain before drafting brand-specific output.
</brand_brain_preflight>`;
  }

  private buildMissingBrandNameContext(): string {
    return `<brand_brain_preflight required="true" called="false" reason="missing_brand_name">
This looks like brand-specific work, but no brand was resolved.
Ask which brand or client the user wants to work on before drafting.
</brand_brain_preflight>`;
  }

  private buildFailedPreflightContext({
    brandNameOrSlug,
    error,
    durationMs,
  }: {
    brandNameOrSlug: string;
    error: string;
    durationMs: number;
  }): string {
    return `<brand_brain_preflight required="true" called="true" brand_name_or_slug="${escapeXmlAttribute(brandNameOrSlug)}" duration_ms="${durationMs}" error="${escapeXmlAttribute(error)}">
Brand Brain preflight failed.
Do not invent brand-specific facts. State that Brand Brain could not be loaded and ask the user for the missing brand context.
</brand_brain_preflight>`;
  }

  private isSpilledToolOutputResult(
    result: unknown,
  ): result is SpilledToolOutputResult {
    return (
      typeof result === 'object' &&
      result !== null &&
      'spilled' in result &&
      (result as SpilledToolOutputResult).spilled === true
    );
  }

  private isToolUnavailableError(error: string): boolean {
    return /tool\s+"?app_brand_brain_get_context"?\s+not\s+found/i.test(error);
  }

  private extractError(output: ToolOutput): string {
    return (
      output.error ?? output.message ?? 'Unknown Brand Brain preflight error'
    );
  }
}
