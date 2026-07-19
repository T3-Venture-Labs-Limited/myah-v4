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
  MANAGED_OPENROUTER_GEMMA_PAID_REFERENCE_PRICE_PER_MILLION,
  MANAGED_OPENROUTER_MODEL_IDS,
  MANAGED_OPENROUTER_PROVIDER_NAME,
  MANAGED_OPENROUTER_TARIFF_VERSION,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';
import { type AiModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-config.type';
import { runWithManagedOpenRouterResponseObserver } from 'src/engine/metadata-modules/ai/ai-models/utils/create-managed-openrouter-fetch.util';
import { getManagedOpenRouterChargeCentUnits } from 'src/engine/metadata-modules/ai/ai-models/utils/get-managed-openrouter-charge-cent-units.util';

const MANAGED_OPENROUTER_OPERATION_KEY = 'generation';

type ManagedOpenRouterModelContext = {
  actorUserWorkspaceId: string | null;
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
        this.applyManagedRequestTransport(params, workspaceId);
        const reservation = await this.reserveGeneration({
          actorUserWorkspaceId,
          invocationOrdinal: invocationOrdinal++,
          modelConfig,
          params,
          requestIdRoot,
          workspaceId,
        });

        params.maxOutputTokens = reservation.maximumOutputUnits;

        let providerExecutionId: string | undefined;
        let providerExecutionIdAttached = false;
        let result;

        try {
          this.logLifecycle('provider_started', reservation);
          result = await runWithManagedOpenRouterResponseObserver(
            async (observedProviderExecutionId) => {
              providerExecutionId = observedProviderExecutionId;
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
          await this.completeBillable({
            providerCostMicrousd: this.getProviderCostMicrousd(
              result.usage.raw,
            ),
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
        this.applyManagedRequestTransport(params, workspaceId);
        const reservation = await this.reserveGeneration({
          actorUserWorkspaceId,
          invocationOrdinal: invocationOrdinal++,
          modelConfig,
          params,
          requestIdRoot,
          workspaceId,
        });

        params.maxOutputTokens = reservation.maximumOutputUnits;

        let providerExecutionId: string | undefined;
        let providerExecutionIdAttached = false;

        try {
          this.logLifecycle('provider_started', reservation);
          const result = await runWithManagedOpenRouterResponseObserver(
            async (observedProviderExecutionId) => {
              providerExecutionId = observedProviderExecutionId;
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
    const cashPaidMicrousd = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_CASH_PAID_MICROUSD',
    );
    const usableCreditsReceivedMicrousd = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_USABLE_CREDITS_MICROUSD',
    );
    const multiplierEvidenceVersion = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_MULTIPLIER_EVIDENCE_VERSION',
    );

    if (
      typeof cashPaidMicrousd !== 'string' ||
      typeof usableCreditsReceivedMicrousd !== 'string' ||
      typeof multiplierEvidenceVersion !== 'string' ||
      multiplierEvidenceVersion.trim() === ''
    ) {
      throw this.createSafeProviderError();
    }

    const estimatedMaximumInputUnits =
      Buffer.byteLength(JSON.stringify(params), 'utf8') + 256;
    if (estimatedMaximumInputUnits > modelConfig.contextWindowTokens) {
      throw new AiException(
        'Managed AI request exceeds the model context window',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }
    const maximumOutputUnits = Math.min(
      this.getMaximumOutputUnits(modelConfig, params.maxOutputTokens),
      modelConfig.contextWindowTokens - estimatedMaximumInputUnits,
    );
    const isGemma =
      modelConfig.modelId === 'openrouter/google/gemma-4-31b-it:free';
    const baseInputRate = isGemma
      ? MANAGED_OPENROUTER_GEMMA_PAID_REFERENCE_PRICE_PER_MILLION.input
      : modelConfig.inputCostPerMillionTokens || 0;
    const baseOutputRate = isGemma
      ? MANAGED_OPENROUTER_GEMMA_PAID_REFERENCE_PRICE_PER_MILLION.output
      : modelConfig.outputCostPerMillionTokens || 0;
    const baseCachedInputRate = isGemma
      ? MANAGED_OPENROUTER_GEMMA_PAID_REFERENCE_PRICE_PER_MILLION.cacheRead
      : (modelConfig.cachedInputCostPerMillionTokens ?? baseInputRate);
    const baseCacheCreationRate = isGemma
      ? MANAGED_OPENROUTER_GEMMA_PAID_REFERENCE_PRICE_PER_MILLION.cacheWrite
      : (modelConfig.cacheCreationCostPerMillionTokens ?? baseInputRate);
    const longContextInputRate =
      modelConfig.longContextCost?.inputCostPerMillionTokens;
    const longContextOutputRate =
      modelConfig.longContextCost?.outputCostPerMillionTokens;
    const longContextCachedInputRate = modelConfig.longContextCost
      ? (modelConfig.longContextCost.cachedInputCostPerMillionTokens ??
        baseCachedInputRate)
      : undefined;
    const longContextCacheCreationRate = modelConfig.longContextCost
      ? (modelConfig.longContextCost.cacheCreationCostPerMillionTokens ??
        baseCacheCreationRate)
      : undefined;
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
        MANAGED_OPENROUTER_TARIFF_VERSION,
      );
      const operation = await this.operationService.reserveOperation(
        {
          actorUserWorkspaceId,
          expectedProductIds: [chargeProductId],
          maximumUsageProperties: {
            inputUnits: estimatedMaximumInputUnits,
            model: modelConfig.modelId,
            outputUnits: maximumOutputUnits,
            tariffVersion: MANAGED_OPENROUTER_TARIFF_VERSION,
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
            ...(modelConfig.longContextCost && {
              longContextCachedInputRate,
              longContextCacheCreationRate,
              longContextInputRate,
              longContextOutputRate,
              longContextThreshold: modelConfig.longContextCost.thresholdTokens,
            }),
            chargeCentUnits: maximumChargeCentUnits,
            charge_cent_unit: maximumChargeCentUnits.toString(),
            model_id: modelConfig.modelId,
            tariff_version: MANAGED_OPENROUTER_TARIFF_VERSION,
          },
          metronomeEventType: MANAGED_OPENROUTER_EVENT_TYPE,
          operationKey: MANAGED_OPENROUTER_OPERATION_KEY,
          providerConfigurationKey: modelConfig.modelId,
          providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
          requestId: `${requestIdRoot}:${invocationOrdinal}`,
          workspaceId,
        },
        { rejectReplay: true },
      );
      const reservation = {
        actorUserWorkspaceId,
        modelId: modelConfig.modelId,
        operationId: operation.id,
        workspaceId,
        tariffVersion: MANAGED_OPENROUTER_TARIFF_VERSION,
        inputRate: baseInputRate,
        outputRate: baseOutputRate,
        cachedInputRate: baseCachedInputRate,
        cacheCreationRate: baseCacheCreationRate,
        baseInputRate,
        baseOutputRate,
        baseCachedInputRate,
        baseCacheCreationRate,
        ...(modelConfig.longContextCost && {
          longContextCachedInputRate,
          longContextCacheCreationRate,
          longContextInputRate,
          longContextOutputRate,
          longContextThreshold: modelConfig.longContextCost.thresholdTokens,
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
    providerCostMicrousd,
    providerExecutionId,
    reservation,
    usage,
  }: {
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

    const rawDetails = usage.raw?.prompt_tokens_details as
      | Record<string, unknown>
      | undefined;
    const rawCacheRead =
      rawDetails?.cached_tokens ?? rawDetails?.cache_read_tokens;
    const rawCacheWrite =
      rawDetails?.cache_write_tokens ??
      rawDetails?.cache_creation_tokens ??
      rawDetails?.cache_creation_input_tokens;
    const inputCacheReadUnits =
      usage.inputTokens.cacheRead ??
      (typeof rawCacheRead === 'number' ? rawCacheRead : undefined);
    const inputCacheWriteUnits =
      usage.inputTokens.cacheWrite ??
      (typeof rawCacheWrite === 'number' ? rawCacheWrite : undefined);
    const inputNoCacheUnits =
      usage.inputTokens.noCache ??
      (Number.isSafeInteger(inputUnits) &&
      Number.isSafeInteger(inputCacheReadUnits) &&
      Number.isSafeInteger(inputCacheWriteUnits)
        ? Number(inputUnits) -
          Number(inputCacheReadUnits) -
          Number(inputCacheWriteUnits)
        : undefined);
    const hasNoCacheUnits = inputNoCacheUnits !== undefined;
    const hasCacheReadUnits = inputCacheReadUnits !== undefined;
    const hasCacheWriteUnits = inputCacheWriteUnits !== undefined;
    const hasAnyInputBreakdown =
      hasNoCacheUnits || hasCacheReadUnits || hasCacheWriteUnits;
    const hasCompleteInputBreakdown =
      hasNoCacheUnits && hasCacheReadUnits && hasCacheWriteUnits;

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

    return status === 401 || status === 403;
  }

  private wrapUsageStream(
    stream: ReadableStream<
      { type: string; id?: string; usage?: unknown } | Record<string, unknown>
    >,
    reservation: ReservedGeneration,
    initialProviderExecutionId?: string,
  ) {
    const reader = stream.getReader();
    let completed = false;
    let providerExecutionId = initialProviderExecutionId;
    return new ReadableStream({
      cancel: async (reason) => {
        try {
          await reader.cancel(reason);
        } catch {
          // Upstream cancellation errors must not escape to the caller.
        } finally {
          if (!completed) {
            completed = true;
            await this.completeUnknownSafely(
              reservation,
              providerExecutionId ?? null,
            );
          }
        }
      },
      pull: async (controller) => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            if (!completed) {
              completed = true;
              await this.completeUnknownSafely(
                reservation,
                providerExecutionId ?? null,
              );
              controller.error(this.createSafeProviderError());

              return;
            }

            controller.close();

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
              completed = true;
              await this.completeUnknownSafely(
                reservation,
                providerExecutionId ?? null,
              );
              controller.error(this.createSafeProviderError());

              return;
            }

            const usage = value.usage as {
              inputTokens: { total: number | undefined };
              outputTokens: { total: number | undefined };
              raw?: Record<string, unknown>;
            };

            await this.completeBillable({
              providerCostMicrousd: this.getProviderCostMicrousd(usage.raw),
              providerExecutionId,
              reservation,
              usage,
            });
            completed = true;
          } else if (value.type === 'error' && !completed) {
            completed = true;
            this.metricsService.incrementCounterBy({
              amount: 1,
              attributes: this.getMetricAttributes(reservation.modelId),
              key: MetricsKeys.ManagedOpenRouterProviderFailed,
            });
            this.logLifecycle('provider_failed', reservation);
            await this.completeUnknownSafely(
              reservation,
              providerExecutionId ?? null,
            );
            controller.error(this.createSafeProviderError());

            return;
          }

          controller.enqueue(value);
        } catch {
          if (!completed) {
            completed = true;
            await this.completeUnknownSafely(
              reservation,
              providerExecutionId ?? null,
            );
          }

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
