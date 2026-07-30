import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  type LanguageModel,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from 'ai';

import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { MetricsKeys } from 'src/engine/core-modules/metrics/types/metrics-keys.type';
import { ManagedProviderOperationService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-operation.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import {
  MANAGED_OPENROUTER_EVENT_TYPE,
  MANAGED_OPENROUTER_MODEL_IDS,
  MANAGED_OPENROUTER_PROVIDER_NAME,
  MANAGED_OPENROUTER_TARIFF_MANIFEST,
  MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED,
  getManagedOpenRouterManifestModel,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';
import { type AiModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-config.type';
import { type ManagedOpenRouterExecutionSurface } from 'src/engine/metadata-modules/ai/ai-models/types/managed-openrouter-execution-surface.type';
import {
  getManagedOpenRouterRawUsage,
  runWithManagedOpenRouterResponseObserver,
  type ManagedOpenRouterRawUsage,
} from 'src/engine/metadata-modules/ai/ai-models/utils/create-managed-openrouter-fetch.util';
import { getManagedOpenRouterChargeCentUnits } from 'src/engine/metadata-modules/ai/ai-models/utils/get-managed-openrouter-charge-cent-units.util';

const MANAGED_OPENROUTER_OPERATION_KEY = 'generation';

type ManagedOpenRouterModelContext = {
  actorUserWorkspaceId: string | null;
  executionSurface: ManagedOpenRouterExecutionSurface;
  model: LanguageModel;
  modelConfig: AiModelConfig;
  providerName: string | undefined;
  requestIdRoot?: string;
  workspaceId: string;
};

type ReservedGeneration = {
  actorUserWorkspaceId: string | null;
  modelId: string;
  operationId: string;
  workspaceId: string;
  tariffVersion: string;
  inputRate: number;
  outputRate: number;
  cachedInputRate: number;
  cacheCreationRate: number;
  reservedAmountCents: number;
  maximumOutputUnits: number;
  baseInputRate: number;
  baseOutputRate: number;
  baseCachedInputRate: number;
  baseCacheCreationRate: number;
  longContextInputRate?: number;
  longContextOutputRate?: number;
  longContextCachedInputRate?: number;
  longContextCacheCreationRate?: number;
  longContextThreshold?: number;
  cashPaidMicrousd: string;
  usableCreditsReceivedMicrousd: string;
  multiplierEvidenceVersion: string;
};

@Injectable()
export class ManagedOpenRouterModelService {
  private readonly logger = new Logger(ManagedOpenRouterModelService.name);

  constructor(
    private readonly operationService: ManagedProviderOperationService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  isManagedModel({
    modelId,
    providerName,
  }: {
    modelId: string;
    providerName: string | undefined;
  }): boolean {
    return (
      this.isApprovedManagedModel({ modelId, providerName }) &&
      this.twentyConfigService.get('MANAGED_OPENROUTER_ENABLED')
    );
  }

  private isApprovedManagedModel({
    modelId,
    providerName,
  }: {
    modelId: string;
    providerName: string | undefined;
  }): boolean {
    return (
      providerName === MANAGED_OPENROUTER_PROVIDER_NAME &&
      MANAGED_OPENROUTER_MODEL_IDS.some(
        (managedModelId) => managedModelId === modelId,
      )
    );
  }

  private isWorkspaceEligible(workspaceId: string): boolean {
    const eligibleWorkspaceIds = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS',
    );

    return (
      Array.isArray(eligibleWorkspaceIds) &&
      eligibleWorkspaceIds.includes(workspaceId)
    );
  }
  private isGemmaTestWorkspaceEligible(workspaceId: string): boolean {
    const eligibleWorkspaceIds = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_GEMMA_TEST_WORKSPACE_IDS',
    );

    return (
      Array.isArray(eligibleWorkspaceIds) &&
      eligibleWorkspaceIds.includes(workspaceId)
    );
  }

  wrapModel({
    actorUserWorkspaceId,
    executionSurface,
    model,
    modelConfig,
    providerName,
    requestIdRoot,
    workspaceId,
  }: ManagedOpenRouterModelContext): LanguageModel {
    const isApprovedManagedModel = this.isApprovedManagedModel({
      modelId: modelConfig.modelId,
      providerName,
    });
    const isManagedWorkspace =
      this.twentyConfigService.get('MANAGED_OPENROUTER_ENABLED') &&
      this.isWorkspaceEligible(workspaceId);
    if (isManagedWorkspace !== isApprovedManagedModel) {
      throw this.createSafeProviderError();
    }

    if (!isManagedWorkspace) {
      return model;
    }
    if (
      modelConfig.modelId === 'openrouter/google/gemma-4-31b-it:free' &&
      !this.isGemmaTestWorkspaceEligible(workspaceId)
    ) {
      throw this.createSafeProviderError();
    }
    if (!requestIdRoot) {
      throw new AiException(
        'Managed AI execution requires a stable operation identifier',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }

    let invocationOrdinal = 0;
    const middleware: LanguageModelMiddleware = {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate, params }) => {
        this.assertManagedPromptSupportsReservation(params.prompt);
        this.applyManagedRequestTransport(params, workspaceId);
        const reservation = await this.reserveGeneration({
          actorUserWorkspaceId,
          executionSurface,
          invocationOrdinal: invocationOrdinal++,
          modelConfig,
          params,
          requestIdRoot,
          workspaceId,
        });
        params.maxOutputTokens = reservation.maximumOutputUnits;

        let providerExecutionId: string | undefined;
        let authoritativeRawUsagePromise:
          | Promise<ManagedOpenRouterRawUsage | undefined>
          | undefined;
        let providerExecutionIdAttached = false;
        let result;

        try {
          this.logLifecycle('provider_started', reservation);
          result = await runWithManagedOpenRouterResponseObserver(
            async (observedProviderExecutionId) => {
              providerExecutionId = observedProviderExecutionId;
              authoritativeRawUsagePromise = getManagedOpenRouterRawUsage();
              await this.attachProviderExecutionId(
                reservation,
                observedProviderExecutionId,
              );
              providerExecutionIdAttached = true;
            },
            doGenerate,
          );
        } catch (error) {
          this.metricsService.incrementCounterBy({
            amount: 1,
            attributes: this.getMetricAttributes(reservation.modelId),
            key: MetricsKeys.ManagedOpenRouterProviderFailed,
          });
          this.logLifecycle('provider_failed', reservation);
          if (
            !providerExecutionId &&
            this.isDefinitelyNonBillableProviderError(error)
          ) {
            await this.completeNonBillableSafely(reservation);
          } else {
            await this.completeUnknownSafely(
              reservation,
              providerExecutionId ?? null,
            );
          }
          throw this.createSafeProviderError();
        }

        providerExecutionId ??= this.getProviderExecutionId(result.response);

        if (!providerExecutionId) {
          await this.completeUnknownSafely(reservation);
          throw this.createSafeProviderError();
        }

        try {
          if (!providerExecutionIdAttached) {
            await this.attachProviderExecutionId(
              reservation,
              providerExecutionId,
            );
          }
          const authoritativeRawUsage = authoritativeRawUsagePromise
            ? await authoritativeRawUsagePromise
            : undefined;
          await this.completeBillable({
            authoritativeRawUsage,
            providerCostMicrousd:
              this.getProviderCostMicrousd(authoritativeRawUsage) ??
              this.getProviderCostMicrousd(result.usage.raw),
            providerExecutionId,
            reservation,
            usage: result.usage,
          });
        } catch {
          await this.completeUnknownSafely(reservation, providerExecutionId);
          throw this.createSafeProviderError();
        }

        return {
          ...result,
          response: { id: providerExecutionId },
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        };
      },
      wrapStream: async ({ doStream, params }) => {
        this.assertManagedPromptSupportsReservation(params.prompt);
        this.applyManagedRequestTransport(params, workspaceId);
        const reservation = await this.reserveGeneration({
          executionSurface,
          actorUserWorkspaceId,
          invocationOrdinal: invocationOrdinal++,
          modelConfig,
          params,
          requestIdRoot,
          workspaceId,
        });

        params.maxOutputTokens = reservation.maximumOutputUnits;
        let authoritativeRawUsagePromise:
          | Promise<ManagedOpenRouterRawUsage | undefined>
          | undefined;

        let providerExecutionId: string | undefined;
        let providerExecutionIdAttached = false;

        try {
          this.logLifecycle('provider_started', reservation);
          const result = await runWithManagedOpenRouterResponseObserver(
            async (observedProviderExecutionId) => {
              providerExecutionId = observedProviderExecutionId;
              authoritativeRawUsagePromise = getManagedOpenRouterRawUsage();
              await this.attachProviderExecutionId(
                reservation,
                observedProviderExecutionId,
              );
              providerExecutionIdAttached = true;
            },
            doStream,
          );
          providerExecutionId ??= this.getProviderExecutionId(result.response);
          if (providerExecutionId && !providerExecutionIdAttached) {
            await this.attachProviderExecutionId(
              reservation,
              providerExecutionId,
            );
          }

          return {
            ...result,
            stream: this.wrapUsageStream(
              result.stream,
              reservation,
              providerExecutionId,
              authoritativeRawUsagePromise,
            ),
          };
        } catch (error) {
          this.metricsService.incrementCounterBy({
            amount: 1,
            attributes: this.getMetricAttributes(reservation.modelId),
            key: MetricsKeys.ManagedOpenRouterProviderFailed,
          });
          this.logLifecycle('provider_failed', reservation);
          if (
            !providerExecutionId &&
            this.isDefinitelyNonBillableProviderError(error)
          ) {
            await this.completeNonBillableSafely(reservation);
          } else {
            await this.completeUnknownSafely(
              reservation,
              providerExecutionId ?? null,
            );
          }
          throw this.createSafeProviderError();
        }
      },
    };

    if (typeof model === 'string' || model.specificationVersion !== 'v3') {
      throw this.createSafeProviderError();
    }

    return wrapLanguageModel({ model, middleware });
  }

  private getMaximumOutputUnits(
    modelConfig: AiModelConfig,
    requestedMaximumOutputUnits: number | undefined,
  ): number {
    const configuredMaximumOutputUnits = modelConfig.maxOutputTokens;

    if (
      !Number.isSafeInteger(configuredMaximumOutputUnits) ||
      configuredMaximumOutputUnits < 0
    ) {
      return 0;
    }

    return requestedMaximumOutputUnits === undefined ||
      !Number.isSafeInteger(requestedMaximumOutputUnits) ||
      requestedMaximumOutputUnits < 0
      ? configuredMaximumOutputUnits
      : Math.min(configuredMaximumOutputUnits, requestedMaximumOutputUnits);
  }

  private assertManagedPromptSupportsReservation(prompt: unknown): void {
    if (this.containsUnsupportedMultimodalPart(prompt)) {
      throw this.createSafeProviderError();
    }
  }

  private containsUnsupportedMultimodalPart(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((entry) =>
        this.containsUnsupportedMultimodalPart(entry),
      );
    }
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;
    if (record.type === 'image' || record.type === 'file') {
      return true;
    }

    return Object.values(record).some((entry) =>
      this.containsUnsupportedMultimodalPart(entry),
    );
  }

  private applyManagedRequestTransport(
    params: {
      maxOutputTokens?: number;
      providerOptions?: Record<string, unknown>;
      prompt: unknown;
    },
    workspaceId: string,
  ): void {
    const providerOptions = { ...(params.providerOptions ?? {}) };
    const user = `managed-${createHash('sha256')
      .update(workspaceId)
      .digest('hex')
      .slice(0, 24)}`;

    providerOptions.openrouter = {
      ...(providerOptions.openrouter as Record<string, unknown> | undefined),
      user,
    };
    params.providerOptions = providerOptions;
  }
  private async reserveGeneration({
    actorUserWorkspaceId,
    executionSurface,
    invocationOrdinal,
    modelConfig,
    params,
    requestIdRoot,
    workspaceId,
  }: Omit<ManagedOpenRouterModelContext, 'model' | 'providerName'> & {
    invocationOrdinal: number;
    params: {
      maxOutputTokens?: number;
      prompt: unknown;
      [key: string]: unknown;
    };
  }): Promise<ReservedGeneration> {
    const chargeProductId = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID',
    );
    if (!MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED) {
      throw this.createSafeProviderError();
    }
    const tariffVersion: unknown =
      MANAGED_OPENROUTER_TARIFF_MANIFEST.tariffVersion;
    const {
      cashPaidMicrousd,
      usableCreditsReceivedMicrousd,
      evidenceIdentity,
    }: {
      cashPaidMicrousd: unknown;
      usableCreditsReceivedMicrousd: unknown;
      evidenceIdentity: unknown;
    } = MANAGED_OPENROUTER_TARIFF_MANIFEST.acquisition;
    if (
      typeof tariffVersion !== 'string' ||
      tariffVersion.trim() === '' ||
      typeof cashPaidMicrousd !== 'string' ||
      typeof usableCreditsReceivedMicrousd !== 'string' ||
      typeof evidenceIdentity !== 'string' ||
      evidenceIdentity.trim() === ''
    ) {
      throw this.createSafeProviderError();
    }
    const manifestModel = getManagedOpenRouterManifestModel(
      modelConfig.modelId,
    );
    if (!manifestModel) {
      throw this.createSafeProviderError();
    }
    const multiplierEvidenceVersion = evidenceIdentity;

    if (
      params.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(params.maxOutputTokens) ||
        params.maxOutputTokens <= 0)
    ) {
      throw new AiException(
        'Managed AI request has an invalid output limit',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }

    const estimatedMaximumInputUnits =
      Buffer.byteLength(JSON.stringify(params), 'utf8') + 256;
    if (estimatedMaximumInputUnits > manifestModel.contextWindowTokens) {
      throw new AiException(
        'Managed AI request exceeds the model context window',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }
    const maximumOutputUnits = Math.min(
      manifestModel.maxOutputTokens,
      params.maxOutputTokens ?? manifestModel.maxOutputTokens,
      manifestModel.contextWindowTokens - estimatedMaximumInputUnits,
    );
    if (maximumOutputUnits <= 0) {
      throw new AiException(
        'Managed AI request leaves no output capacity',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }
    const baseInputRate = manifestModel.input;
    const baseOutputRate = manifestModel.output;
    const baseCachedInputRate = manifestModel.cachedInput;
    const baseCacheCreationRate = manifestModel.cacheCreation;
    const longContextInputRate = manifestModel.longContext?.input;
    const longContextOutputRate = manifestModel.longContext?.output;
    const longContextCachedInputRate = manifestModel.longContext?.cachedInput;
    const longContextCacheCreationRate =
      manifestModel.longContext?.cacheCreation;
    const longContextThreshold = manifestModel.longContext?.thresholdTokens;
    const maximumInputRate = longContextInputRate ?? baseInputRate;
    const maximumOutputRate = longContextOutputRate ?? baseOutputRate;
    const maximumCachedInputRate =
      longContextCachedInputRate ?? baseCachedInputRate;
    const maximumCacheCreationRate =
      longContextCacheCreationRate ?? baseCacheCreationRate;
    const maximumPromptRate = Math.max(
      maximumInputRate,
      maximumCachedInputRate,
      maximumCacheCreationRate,
    );
    const maximumChargeCentUnits = getManagedOpenRouterChargeCentUnits({
      cashPaidMicrousd,
      ratedUnits: [
        { rate: maximumPromptRate, units: estimatedMaximumInputUnits },
        { rate: maximumOutputRate, units: maximumOutputUnits },
      ],
      usableCreditsReceivedMicrousd,
    });
    try {
      await this.operationService.assertProviderConfigurationActive(
        MANAGED_OPENROUTER_PROVIDER_NAME,
        modelConfig.modelId,
        tariffVersion,
      );
      const operation = await this.operationService.reserveOperation(
        {
          actorUserWorkspaceId,
          expectedProductIds: [chargeProductId],
          maximumUsageProperties: {
            inputUnits: estimatedMaximumInputUnits,
            model: modelConfig.modelId,
            outputUnits: maximumOutputUnits,
            tariffVersion,
            cashPaidMicrousd,
            usableCreditsReceivedMicrousd,
            multiplierEvidenceVersion,
            inputRate: maximumInputRate,
            outputRate: maximumOutputRate,
            cachedInputRate: maximumCachedInputRate,
            cacheCreationRate: maximumCacheCreationRate,
            baseInputRate,
            baseOutputRate,
            baseCachedInputRate,
            baseCacheCreationRate,
            ...(manifestModel.longContext && {
              longContextCachedInputRate,
              longContextCacheCreationRate,
              longContextInputRate,
              longContextOutputRate,
              longContextThreshold,
            }),
            chargeCentUnits: maximumChargeCentUnits,
            charge_cent_unit: maximumChargeCentUnits.toString(),
            model_id: modelConfig.modelId,
            tariff_version: tariffVersion,
          },
          requestId: `${executionSurface}:${requestIdRoot}:${invocationOrdinal}`,
          metronomeEventType: MANAGED_OPENROUTER_EVENT_TYPE,
          operationKey: MANAGED_OPENROUTER_OPERATION_KEY,
          providerConfigurationKey: modelConfig.modelId,
          providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
          workspaceId,
        },
        { rejectReplay: true },
      );
      const reservation = {
        actorUserWorkspaceId,
        modelId: modelConfig.modelId,
        operationId: operation.id,
        workspaceId,
        tariffVersion,
        inputRate: baseInputRate,
        outputRate: baseOutputRate,
        cachedInputRate: baseCachedInputRate,
        cacheCreationRate: baseCacheCreationRate,
        baseInputRate,
        baseOutputRate,
        baseCachedInputRate,
        baseCacheCreationRate,
        ...(manifestModel.longContext && {
          longContextCachedInputRate,
          longContextCacheCreationRate,
          longContextInputRate,
          longContextOutputRate,
          longContextThreshold,
        }),
        cashPaidMicrousd,
        usableCreditsReceivedMicrousd,
        multiplierEvidenceVersion,
        maximumOutputUnits,
        reservedAmountCents: Number(operation.reservedAmountCents),
      };

      this.metricsService.incrementCounterBy({
        amount: 1,
        attributes: this.getMetricAttributes(modelConfig.modelId),
        key: MetricsKeys.ManagedOpenRouterReservationSucceeded,
      });
      this.logLifecycle('reservation_succeeded', reservation);

      return reservation;
    } catch (error) {
      this.metricsService.incrementCounterBy({
        amount: 1,
        attributes: {
          ...this.getMetricAttributes(modelConfig.modelId),
          reason: error instanceof Error ? error.name : 'unknown',
        },
        key: MetricsKeys.ManagedOpenRouterReservationRejected,
      });
      throw error;
    }
  }

  private async completeBillable({
    authoritativeRawUsage,
    providerCostMicrousd,
    providerExecutionId,
    reservation,
    usage,
  }: {
    authoritativeRawUsage?: {
      cost?: unknown;
      prompt_tokens_details?: Record<string, unknown>;
      completion_tokens_details?: Record<string, unknown>;
    };
    providerCostMicrousd: string | null;
    providerExecutionId: string;
    reservation: ReservedGeneration;
    usage: {
      inputTokens: {
        total: number | undefined;
        noCache?: number;
        cacheRead?: number;
        cacheWrite?: number;
      };
      outputTokens: { total: number | undefined };
      raw?: Record<string, unknown>;
    };
  }): Promise<void> {
    const inputUnits = usage.inputTokens.total;
    const outputUnits = usage.outputTokens.total;
    const rawDetails = (authoritativeRawUsage?.prompt_tokens_details ??
      usage.raw?.prompt_tokens_details) as Record<string, unknown> | undefined;
    const rawCacheRead =
      rawDetails?.cached_tokens ?? rawDetails?.cache_read_tokens;
    const rawCacheWrite =
      rawDetails?.cache_write_tokens ??
      rawDetails?.cache_creation_tokens ??
      rawDetails?.cache_creation_input_tokens;
    const hasRawCacheWriteField =
      rawDetails !== undefined &&
      [
        'cache_write_tokens',
        'cache_creation_tokens',
        'cache_creation_input_tokens',
      ].some((key) => rawDetails[key] !== undefined);
    const inputCacheReadUnits =
      typeof rawCacheRead === 'number'
        ? rawCacheRead
        : usage.inputTokens.cacheRead;
    const hasNoCacheUnits = usage.inputTokens.noCache !== undefined;
    const hasCacheReadUnits = inputCacheReadUnits !== undefined;
    const hasReportedCacheWriteUnits =
      usage.inputTokens.cacheWrite !== undefined || hasRawCacheWriteField;
    const inputCacheWriteUnits =
      typeof rawCacheWrite === 'number'
        ? rawCacheWrite
        : hasReportedCacheWriteUnits
          ? usage.inputTokens.cacheWrite
          : hasNoCacheUnits && hasCacheReadUnits
            ? 0
            : undefined;
    const inputNoCacheUnits = hasRawCacheWriteField
      ? Number.isSafeInteger(inputUnits) &&
        Number.isSafeInteger(inputCacheReadUnits) &&
        Number.isSafeInteger(inputCacheWriteUnits)
        ? Number(inputUnits) -
          Number(inputCacheReadUnits) -
          Number(inputCacheWriteUnits)
        : undefined
      : (usage.inputTokens.noCache ??
        (Number.isSafeInteger(inputUnits) &&
        Number.isSafeInteger(inputCacheReadUnits) &&
        Number.isSafeInteger(inputCacheWriteUnits)
          ? Number(inputUnits) -
            Number(inputCacheReadUnits) -
            Number(inputCacheWriteUnits)
          : undefined));
    const hasAnyInputBreakdown =
      inputNoCacheUnits !== undefined ||
      inputCacheReadUnits !== undefined ||
      inputCacheWriteUnits !== undefined;
    const hasCompleteInputBreakdown =
      inputNoCacheUnits !== undefined &&
      inputCacheReadUnits !== undefined &&
      inputCacheWriteUnits !== undefined;

    if (
      providerCostMicrousd === null ||
      !Number.isSafeInteger(inputUnits) ||
      (inputUnits ?? -1) < 0 ||
      !Number.isSafeInteger(outputUnits) ||
      (outputUnits ?? -1) < 0 ||
      (inputNoCacheUnits !== undefined &&
        (!Number.isSafeInteger(inputNoCacheUnits) || inputNoCacheUnits < 0)) ||
      (inputCacheReadUnits !== undefined &&
        (!Number.isSafeInteger(inputCacheReadUnits) ||
          inputCacheReadUnits < 0)) ||
      (inputCacheWriteUnits !== undefined &&
        (!Number.isSafeInteger(inputCacheWriteUnits) ||
          inputCacheWriteUnits < 0)) ||
      (hasAnyInputBreakdown && !hasCompleteInputBreakdown)
    ) {
      throw new Error('Managed OpenRouter response included invalid usage');
    }

    const normalizedInputNoCacheUnits = inputNoCacheUnits ?? inputUnits ?? 0;
    const normalizedInputCacheReadUnits = inputCacheReadUnits ?? 0;
    const normalizedInputCacheWriteUnits = inputCacheWriteUnits ?? 0;
    if (
      normalizedInputNoCacheUnits +
        normalizedInputCacheReadUnits +
        normalizedInputCacheWriteUnits !==
      inputUnits
    ) {
      throw new Error('Managed OpenRouter response included invalid usage');
    }

    const usesLongContextTariff =
      reservation.longContextThreshold !== undefined &&
      inputUnits >= reservation.longContextThreshold;
    const inputRate = usesLongContextTariff
      ? (reservation.longContextInputRate ?? reservation.baseInputRate)
      : reservation.baseInputRate;
    const outputRate = usesLongContextTariff
      ? (reservation.longContextOutputRate ?? reservation.baseOutputRate)
      : reservation.baseOutputRate;
    const cachedInputRate = usesLongContextTariff
      ? (reservation.longContextCachedInputRate ??
        reservation.baseCachedInputRate)
      : reservation.baseCachedInputRate;
    const cacheCreationRate = usesLongContextTariff
      ? (reservation.longContextCacheCreationRate ??
        reservation.cacheCreationRate)
      : reservation.cacheCreationRate;
    const chargeCentUnits = getManagedOpenRouterChargeCentUnits({
      cashPaidMicrousd: reservation.cashPaidMicrousd,
      ratedUnits: [
        { rate: inputRate, units: normalizedInputNoCacheUnits },
        { rate: cachedInputRate, units: normalizedInputCacheReadUnits },
        { rate: cacheCreationRate, units: normalizedInputCacheWriteUnits },
        { rate: outputRate, units: outputUnits ?? 0 },
      ],
      usableCreditsReceivedMicrousd: reservation.usableCreditsReceivedMicrousd,
    });

    const hasOverrun =
      Number.isSafeInteger(reservation.reservedAmountCents) &&
      chargeCentUnits > reservation.reservedAmountCents;
    const cappedChargeCentUnits = hasOverrun
      ? reservation.reservedAmountCents
      : chargeCentUnits;
    if (hasOverrun) {
      this.metricsService.incrementCounterBy({
        amount: 1,
        attributes: this.getMetricAttributes(reservation.modelId),
        key: MetricsKeys.ManagedOpenRouterUsageOverrun,
      });
    }

    await this.operationService.completeOperation({
      actualUsageProperties: {
        inputUnits: inputUnits ?? 0,
        inputNoCacheUnits: normalizedInputNoCacheUnits,
        inputCacheReadUnits: normalizedInputCacheReadUnits,
        inputCacheWriteUnits: normalizedInputCacheWriteUnits,
        model: reservation.modelId,
        outputUnits: outputUnits ?? 0,
        tariffVersion: reservation.tariffVersion,
        cashPaidMicrousd: reservation.cashPaidMicrousd,
        usableCreditsReceivedMicrousd:
          reservation.usableCreditsReceivedMicrousd,
        multiplierEvidenceVersion: reservation.multiplierEvidenceVersion,
        inputRate,
        outputRate,
        cachedInputRate,
        cacheCreationRate,
        chargeCentUnits: cappedChargeCentUnits,
        charge_cent_unit: cappedChargeCentUnits.toString(),
        model_id: reservation.modelId,
        tariff_version: reservation.tariffVersion,
        operation_id: reservation.operationId,
        ...(hasOverrun && {
          uncappedChargeCentUnits: chargeCentUnits,
          overrun: true,
          absorbedCostMicrousd: providerCostMicrousd,
          excessChargeCentUnits:
            chargeCentUnits - reservation.reservedAmountCents,
        }),
      },
      actorUserWorkspaceId: reservation.actorUserWorkspaceId,
      operationId: reservation.operationId,
      operationKey: MANAGED_OPENROUTER_OPERATION_KEY,
      outcome: 'BILLABLE',
      providerConfigurationKey: reservation.modelId,
      providerCostMicrousd,
      providerExecutionId,
      providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
      workspaceId: reservation.workspaceId,
    });
    this.metricsService.incrementCounterBy({
      amount: 1,
      attributes: this.getMetricAttributes(reservation.modelId),
      key: MetricsKeys.ManagedOpenRouterUsageCompleted,
    });
    this.logLifecycle('usage_completed', reservation);
  }

  private async completeUnknown(
    reservation: ReservedGeneration,
    providerExecutionId: string | null = null,
  ): Promise<void> {
    await this.operationService.completeOperation({
      actualUsageProperties: {
        inputUnits: 0,
        model: reservation.modelId,
        outputUnits: 0,
      },
      actorUserWorkspaceId: reservation.actorUserWorkspaceId,
      operationId: reservation.operationId,
      operationKey: MANAGED_OPENROUTER_OPERATION_KEY,
      outcome: 'UNKNOWN',
      providerConfigurationKey: reservation.modelId,
      providerCostMicrousd: null,
      providerExecutionId,
      providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
      workspaceId: reservation.workspaceId,
    });
    this.metricsService.incrementCounterBy({
      amount: 1,
      attributes: this.getMetricAttributes(reservation.modelId),
      key: MetricsKeys.ManagedOpenRouterReconciliationRequired,
    });
    this.logLifecycle('reconciliation_required', reservation);
  }

  private async completeUnknownSafely(
    reservation: ReservedGeneration,
    providerExecutionId: string | null = null,
  ): Promise<void> {
    try {
      await this.completeUnknown(reservation, providerExecutionId);
    } catch {
      // Billing errors must never expose provider or settlement details.
    }
  }

  private async completeNonBillableSafely(
    reservation: ReservedGeneration,
  ): Promise<void> {
    try {
      await this.operationService.completeOperation({
        actualUsageProperties: {
          inputUnits: 0,
          model: reservation.modelId,
          outputUnits: 0,
        },
        actorUserWorkspaceId: reservation.actorUserWorkspaceId,
        operationId: reservation.operationId,
        operationKey: MANAGED_OPENROUTER_OPERATION_KEY,
        outcome: 'NON_BILLABLE_FAILURE',
        providerConfigurationKey: reservation.modelId,
        providerCostMicrousd: null,
        providerExecutionId: null,
        providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
        workspaceId: reservation.workspaceId,
      });
    } catch {
      // Billing errors must never expose provider or settlement details.
    }
  }

  private isDefinitelyNonBillableProviderError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const candidate = error as {
      response?: { status?: unknown };
      status?: unknown;
      statusCode?: unknown;
    };
    const status =
      candidate.statusCode ?? candidate.status ?? candidate.response?.status;

    return status === 401 || status === 402 || status === 403 || status === 429;
  }

  private wrapUsageStream(
    stream: ReadableStream<
      { type: string; id?: string; usage?: unknown } | Record<string, unknown>
    >,
    reservation: ReservedGeneration,
    initialProviderExecutionId?: string,
    authoritativeRawUsagePromise?: Promise<
      | {
          cost?: unknown;
          prompt_tokens_details?: Record<string, unknown>;
          completion_tokens_details?: Record<string, unknown>;
        }
      | undefined
    >,
  ) {
    const reader = stream.getReader();
    type CompletionState = 'open' | 'finishing' | 'completed' | 'unknown';
    let completionState: CompletionState = 'open';
    let providerExecutionId = initialProviderExecutionId;
    const completeUnknownOnce = async () => {
      if (completionState !== 'open') {
        return;
      }
      completionState = 'unknown';
      await this.completeUnknownSafely(
        reservation,
        providerExecutionId ?? null,
      );
    };

    return new ReadableStream({
      cancel: async (reason) => {
        try {
          await reader.cancel(reason);
        } catch {
          // Upstream cancellation errors must not escape to the caller.
        } finally {
          await completeUnknownOnce();
        }
      },
      pull: async (controller) => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            await completeUnknownOnce();
            if (completionState === 'unknown') {
              controller.error(this.createSafeProviderError());
            } else {
              controller.close();
            }

            return;
          }

          if (
            value.type === 'response-metadata' &&
            typeof value.id === 'string'
          ) {
            if (providerExecutionId && providerExecutionId !== value.id) {
              throw new Error('Conflicting OpenRouter generation identifiers');
            }
            providerExecutionId = value.id;
            await this.attachProviderExecutionId(reservation, value.id);
          }

          if (value.type === 'finish') {
            if (!providerExecutionId || !('usage' in value) || !value.usage) {
              await completeUnknownOnce();
              controller.error(this.createSafeProviderError());

              return;
            }

            const usage = value.usage as {
              inputTokens: { total: number | undefined };
              outputTokens: { total: number | undefined };
              raw?: Record<string, unknown>;
            };

            completionState = 'finishing';
            try {
              const authoritativeRawUsage = authoritativeRawUsagePromise
                ? await authoritativeRawUsagePromise
                : undefined;
              await this.completeBillable({
                authoritativeRawUsage,
                providerCostMicrousd:
                  this.getProviderCostMicrousd(authoritativeRawUsage) ??
                  this.getProviderCostMicrousd(usage.raw),
                providerExecutionId,
                reservation,
                usage,
              });
              completionState = 'completed';
            } catch {
              completionState = 'open';
              await completeUnknownOnce();
              controller.error(this.createSafeProviderError());

              return;
            }
          } else if (value.type === 'error') {
            await completeUnknownOnce();
            this.metricsService.incrementCounterBy({
              amount: 1,
              attributes: this.getMetricAttributes(reservation.modelId),
              key: MetricsKeys.ManagedOpenRouterProviderFailed,
            });
            this.logLifecycle('provider_failed', reservation);
            controller.error(this.createSafeProviderError());

            return;
          }

          controller.enqueue(value);
        } catch {
          await completeUnknownOnce();
          controller.error(this.createSafeProviderError());
        }
      },
    });
  }

  private getProviderExecutionId(
    response: { headers?: Record<string, string>; id?: string } | undefined,
  ): string | undefined {
    const headerId = Object.entries(response?.headers ?? {}).find(
      ([name]) => name.toLowerCase() === 'x-generation-id',
    )?.[1];

    return headerId || response?.id;
  }

  private async attachProviderExecutionId(
    reservation: ReservedGeneration,
    providerExecutionId: string,
  ): Promise<void> {
    await this.operationService.attachProviderExecutionId({
      operationId: reservation.operationId,
      providerConfigurationKey: reservation.modelId,
      providerExecutionId,
      providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
      workspaceId: reservation.workspaceId,
    });
  }

  private getProviderCostMicrousd(
    rawUsage: Record<string, unknown> | undefined,
  ): string | null {
    const cost = rawUsage?.cost;

    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      return null;
    }

    const costMicrousd = Math.ceil(cost * 1_000_000);

    if (!Number.isSafeInteger(costMicrousd)) {
      return null;
    }

    return costMicrousd.toString();
  }

  private createSafeProviderError(): Error {
    return new Error('Managed OpenRouter generation failed');
  }

  private getMetricAttributes(modelId: string) {
    return {
      model: modelId,
      provider: MANAGED_OPENROUTER_PROVIDER_NAME,
    };
  }

  private logLifecycle(event: string, reservation: ReservedGeneration): void {
    this.logger.log(
      JSON.stringify({
        event,
        model: reservation.modelId,
        operationId: reservation.operationId,
        provider: MANAGED_OPENROUTER_PROVIDER_NAME,
        workspaceId: reservation.workspaceId,
      }),
    );
  }
}
