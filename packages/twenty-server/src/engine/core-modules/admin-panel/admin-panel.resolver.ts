import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Int, Mutation, Query } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';

import GraphQLJSON from 'graphql-type-json';
import { isDefined } from 'twenty-shared/utils';
import { In, type Repository } from 'typeorm';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { InstanceAndAllWorkspacesUpgradeStatusDTO } from 'src/engine/core-modules/upgrade/dtos/instance-and-all-workspaces-upgrade-status.dto';
import { WorkspaceUpgradeStatusDTO } from 'src/engine/core-modules/upgrade/dtos/workspace-upgrade-status.dto';
import { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';

import { AdminResolver } from 'src/engine/api/graphql/graphql-config/decorators/admin-resolver.decorator';
import { AdminPanelHealthService } from 'src/engine/core-modules/admin-panel/admin-panel-health.service';
import { AdminPanelQueueService } from 'src/engine/core-modules/admin-panel/admin-panel-queue.service';
import { AdminChatThreadMessagesDTO } from 'src/engine/core-modules/admin-panel/dtos/admin-chat-thread-messages.dto';
import { AdminPanelRecentUserDTO } from 'src/engine/core-modules/admin-panel/dtos/admin-panel-recent-user.dto';
import { AdminPanelTopWorkspaceDTO } from 'src/engine/core-modules/admin-panel/dtos/admin-panel-top-workspace.dto';
import { AdminPanelWorkspaceBillingDTO } from 'src/engine/core-modules/admin-panel/dtos/admin-panel-workspace-billing.dto';
import { AdminWorkspaceChatThreadDTO } from 'src/engine/core-modules/admin-panel/dtos/admin-workspace-chat-thread.dto';
import { ConfigVariableDTO } from 'src/engine/core-modules/admin-panel/dtos/config-variable.dto';
import { ConfigVariablesDTO } from 'src/engine/core-modules/admin-panel/dtos/config-variables.dto';
import { DeleteJobsResponseDTO } from 'src/engine/core-modules/admin-panel/dtos/delete-jobs-response.dto';
import { CorrectManagedProviderFundingInput } from 'src/engine/core-modules/admin-panel/dtos/correct-managed-provider-funding.input';
import { GrantManagedProviderCreditInput } from 'src/engine/core-modules/admin-panel/dtos/grant-managed-provider-credit.input';
import { ManagedProviderCreditReceiptDTO } from 'src/engine/core-modules/admin-panel/dtos/managed-provider-credit-receipt.dto';
import { RecordManagedProviderOfflineCommitmentInput } from 'src/engine/core-modules/admin-panel/dtos/record-managed-provider-offline-commitment.input';
import { QueueJobsResponseDTO } from 'src/engine/core-modules/admin-panel/dtos/queue-jobs-response.dto';
import { RetryJobsResponseDTO } from 'src/engine/core-modules/admin-panel/dtos/retry-jobs-response.dto';
import { RevokeSigningKeyInput } from 'src/engine/core-modules/admin-panel/dtos/revoke-signing-key.input';
import { ServerAdminDTO } from 'src/engine/core-modules/admin-panel/dtos/server-admin.dto';
import { SigningKeyDTO } from 'src/engine/core-modules/admin-panel/dtos/signing-key.dto';
import { SigningKeysAdminPanelDTO } from 'src/engine/core-modules/admin-panel/dtos/signing-keys-admin-panel.dto';
import { SystemHealthDTO } from 'src/engine/core-modules/admin-panel/dtos/system-health.dto';
import { UpdateServerAdminAccessInput } from 'src/engine/core-modules/admin-panel/dtos/update-server-admin-access.input';
import { UpdateWorkspaceFeatureFlagInput } from 'src/engine/core-modules/admin-panel/dtos/update-workspace-feature-flag.input';
import { UserLookup } from 'src/engine/core-modules/admin-panel/dtos/user-lookup.dto';
import { UserLookupInput } from 'src/engine/core-modules/admin-panel/dtos/user-lookup.input';
import { VersionInfoDTO } from 'src/engine/core-modules/admin-panel/dtos/version-info.dto';
import { HealthIndicatorId } from 'src/engine/core-modules/admin-panel/enums/health-indicator-id.enum';
import { JobStateEnum } from 'src/engine/core-modules/admin-panel/enums/job-state.enum';
import { QueueMetricsTimeRange } from 'src/engine/core-modules/admin-panel/enums/queue-metrics-time-range.enum';
import { MaintenanceModeService } from 'src/engine/core-modules/admin-panel/maintenance-mode.service';
import { AdminPanelBillingService } from 'src/engine/core-modules/admin-panel/services/admin-panel-billing.service';
import { AdminPanelChatService } from 'src/engine/core-modules/admin-panel/services/admin-panel-chat.service';
import { AdminPanelConfigService } from 'src/engine/core-modules/admin-panel/services/admin-panel-config.service';
import { AdminPanelManagedProviderBillingService } from 'src/engine/core-modules/admin-panel/services/admin-panel-managed-provider-billing.service';
import { AdminPanelSigningKeyService } from 'src/engine/core-modules/admin-panel/services/admin-panel-signing-key.service';
import { AdminPanelServerAdminService } from 'src/engine/core-modules/admin-panel/services/admin-panel-server-admin.service';
import { AdminPanelStatisticsService } from 'src/engine/core-modules/admin-panel/services/admin-panel-statistics.service';
import { AdminPanelUserLookupService } from 'src/engine/core-modules/admin-panel/services/admin-panel-user-lookup.service';
import { AdminPanelVersionService } from 'src/engine/core-modules/admin-panel/services/admin-panel-version.service';
import { ApplicationRegistrationVariableDTO } from 'src/engine/core-modules/application/application-registration-variable/dtos/application-registration-variable.dto';
import { ApplicationRegistrationVariableService } from 'src/engine/core-modules/application/application-registration-variable/application-registration-variable.service';
import { UpdateApplicationRegistrationVariableInput } from 'src/engine/core-modules/application/application-registration-variable/dtos/update-application-registration-variable.input';
import { ApplicationRegistrationEntity } from 'src/engine/core-modules/application/application-registration/application-registration.entity';
import { ApplicationRegistrationService } from 'src/engine/core-modules/application/application-registration/application-registration.service';
import { ApplicationRegistrationInstalledWorkspacesDTO } from 'src/engine/core-modules/application/application-registration/dtos/application-registration-installed-workspaces.dto';
import { ApplicationRegistrationStatsDTO } from 'src/engine/core-modules/application/application-registration/dtos/application-registration-stats.dto';
import { FindApplicationRegistrationInstalledWorkspacesInput } from 'src/engine/core-modules/application/application-registration/dtos/find-application-registration-installed-workspaces.input';
import { UpdateApplicationRegistrationInput } from 'src/engine/core-modules/application/application-registration/dtos/update-application-registration.input';
import {
  BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
  type BackfillApplicationInstallationJobData,
} from 'src/engine/core-modules/application/jobs/backfill-application-installation.job-constants';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { AdminAiModelsDTO } from 'src/engine/core-modules/client-config/client-config.entity';
import { FeatureFlagException } from 'src/engine/core-modules/feature-flag/feature-flag.exception';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { MarketplaceCatalogSyncCronJob } from 'src/engine/core-modules/application/application-marketplace/crons/marketplace-catalog-sync.cron.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { ConfigVariableGraphqlApiExceptionFilter } from 'src/engine/core-modules/twenty-config/filters/config-variable-graphql-api-exception.filter';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { TwoFactorAuthenticationExceptionFilter } from 'src/engine/core-modules/two-factor-authentication/two-factor-authentication-exception.filter';
import { UsageBreakdownItemDTO } from 'src/engine/core-modules/usage/dtos/usage-breakdown-item.dto';
import { UsageAnalyticsService } from 'src/engine/core-modules/usage/services/usage-analytics.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { MyahTeamGuard } from 'src/engine/guards/myah-team.guard';
import { NoImpersonationGuard } from 'src/engine/guards/no-impersonation.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { MODEL_FAMILY_LABELS } from 'src/engine/metadata-modules/ai/ai-models/constants/model-family-labels.const';
import { AiModelPreferencesService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-preferences.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { DefaultAiCatalogService } from 'src/engine/metadata-modules/ai/ai-models/services/default-ai-catalog.service';
import { ModelsDevCatalogService } from 'src/engine/metadata-modules/ai/ai-models/services/models-dev-catalog.service';
import { AiModelRole } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-role.enum';
import { type AiProviderConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-provider-config.type';
import { type AiProviderModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-provider-model-config.type';
import { extractConfigVariableName } from 'src/engine/metadata-modules/ai/ai-models/utils/extract-config-variable-name.util';

import { AdminPanelHealthServiceDataDTO } from './dtos/admin-panel-health-service-data.dto';
import { MaintenanceModeDTO } from './dtos/maintenance-mode.dto';
import { ModelsDevModelSuggestionDTO } from './dtos/models-dev-model-suggestion.dto';
import { ModelsDevProviderSuggestionDTO } from './dtos/models-dev-provider-suggestion.dto';
import { QueueMetricsDataDTO } from './dtos/queue-metrics-data.dto';
import { SetMaintenanceModeInput } from './dtos/set-maintenance-mode.input';

const INSTALLED_WORKSPACES_PAGE_SIZE = 10;

@UsePipes(ResolverValidationPipe)
@AdminResolver()
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  TwoFactorAuthenticationExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
  ConfigVariableGraphqlApiExceptionFilter,
)
@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  MyahTeamGuard,
  NoImpersonationGuard,
)
export class AdminPanelResolver {
  constructor(
    private readonly adminUserLookupService: AdminPanelUserLookupService,
    private readonly adminServerAdminService: AdminPanelServerAdminService,
    private readonly adminStatisticsService: AdminPanelStatisticsService,
    private readonly adminBillingService: AdminPanelBillingService,
    private readonly adminChatService: AdminPanelChatService,
    private readonly adminManagedProviderBillingService: AdminPanelManagedProviderBillingService,
    private readonly adminConfigService: AdminPanelConfigService,
    private readonly adminVersionService: AdminPanelVersionService,
    private readonly adminPanelHealthService: AdminPanelHealthService,
    private readonly adminPanelSigningKeyService: AdminPanelSigningKeyService,
    private readonly applicationRegistrationService: ApplicationRegistrationService,
    private readonly applicationRegistrationVariableService: ApplicationRegistrationVariableService,
    private adminPanelQueueService: AdminPanelQueueService,
    private featureFlagService: FeatureFlagService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly aiModelRegistryService: AiModelRegistryService,
    private readonly aiModelPreferencesService: AiModelPreferencesService,
    private readonly modelsDevCatalogService: ModelsDevCatalogService,
    private readonly defaultAiCatalogService: DefaultAiCatalogService,
    private readonly usageAnalyticsService: UsageAnalyticsService,
    private readonly maintenanceModeService: MaintenanceModeService,
    private readonly upgradeStatusService: UpgradeStatusService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly cronQueueService: MessageQueueService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly workspaceQueueService: MessageQueueService,
  ) {}

  @Query(() => UserLookup)
  async userLookupAdminPanel(
    @Args() userLookupInput: UserLookupInput,
  ): Promise<UserLookup> {
    return await this.adminUserLookupService.userLookup(
      userLookupInput.userIdentifier,
    );
  }

  @Query(() => [AdminPanelRecentUserDTO])
  async adminPanelRecentUsers(
    @Args('searchTerm', {
      type: () => String,
      nullable: true,
      defaultValue: '',
    })
    searchTerm: string,
  ): Promise<AdminPanelRecentUserDTO[]> {
    return this.adminStatisticsService.getRecentUsers(searchTerm);
  }

  @Query(() => [AdminPanelTopWorkspaceDTO])
  async adminPanelTopWorkspaces(
    @Args('searchTerm', {
      type: () => String,
      nullable: true,
      defaultValue: '',
    })
    searchTerm: string,
  ): Promise<AdminPanelTopWorkspaceDTO[]> {
    return this.adminStatisticsService.getTopWorkspaces(searchTerm);
  }

  @Query(() => [ServerAdminDTO])
  async getServerAdmins(): Promise<ServerAdminDTO[]> {
    return this.adminServerAdminService.getServerAdmins();
  }

  @Mutation(() => ServerAdminDTO)
  async updateServerAdminAccess(
    @Args() input: UpdateServerAdminAccessInput,
    @AuthUser() actor: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ServerAdminDTO> {
    return this.adminServerAdminService.updateServerAdminAccess({
      actor,
      actorWorkspaceId: workspace.id,
      targetUserId: input.userId,
      canAccessFullAdminPanel: input.canAccessFullAdminPanel,
      canImpersonate: input.canImpersonate,
      otp: input.otp,
    });
  }

  @Mutation(() => Boolean)
  async updateWorkspaceFeatureFlag(
    @Args() updateFlagInput: UpdateWorkspaceFeatureFlagInput,
  ): Promise<boolean> {
    try {
      await this.featureFlagService.upsertWorkspaceFeatureFlag({
        workspaceId: updateFlagInput.workspaceId,
        featureFlag: updateFlagInput.featureFlag,
        value: updateFlagInput.value,
      });

      return true;
    } catch (error) {
      if (error instanceof FeatureFlagException) {
        throw new UserInputError(error.message);
      }

      throw error;
    }
  }

  @Query(() => ConfigVariablesDTO)
  async getConfigVariablesGrouped(): Promise<ConfigVariablesDTO> {
    return this.adminConfigService.getConfigVariablesGrouped();
  }

  @Query(() => SystemHealthDTO)
  async getSystemHealthStatus(): Promise<SystemHealthDTO> {
    return this.adminPanelHealthService.getSystemHealthStatus();
  }

  @Query(() => AdminPanelHealthServiceDataDTO)
  async getIndicatorHealthStatus(
    @Args('indicatorId', {
      type: () => HealthIndicatorId,
    })
    indicatorId: HealthIndicatorId,
  ): Promise<AdminPanelHealthServiceDataDTO> {
    return this.adminPanelHealthService.getIndicatorHealthStatus(indicatorId);
  }

  @Query(() => QueueMetricsDataDTO)
  async getQueueMetrics(
    @Args('queueName', { type: () => String })
    queueName: string,
    @Args('timeRange', {
      nullable: true,
      defaultValue: QueueMetricsTimeRange.OneHour,
      type: () => QueueMetricsTimeRange,
    })
    timeRange: QueueMetricsTimeRange = QueueMetricsTimeRange.OneHour,
  ): Promise<QueueMetricsDataDTO> {
    return await this.adminPanelHealthService.getQueueMetrics(
      queueName as MessageQueue,
      timeRange,
    );
  }

  @Query(() => VersionInfoDTO)
  async versionInfo(): Promise<VersionInfoDTO> {
    return this.adminVersionService.getVersionInfo();
  }

  @Query(() => AdminAiModelsDTO)
  async getAdminAiModels(): Promise<AdminAiModelsDTO> {
    const resolvedProviders =
      this.aiModelRegistryService.getResolvedProvidersForAdmin();

    const models = this.aiModelRegistryService
      .getAllModelsWithStatus()
      .map(
        ({
          modelConfig,
          isAvailable,
          isAdminEnabled,
          isRecommended,
          providerName,
          name,
        }) => ({
          modelId: modelConfig.modelId,
          label: modelConfig.label,
          modelFamily: modelConfig.modelFamily,
          modelFamilyLabel: modelConfig.modelFamily
            ? MODEL_FAMILY_LABELS[modelConfig.modelFamily]
            : undefined,
          sdkPackage: modelConfig.sdkPackage,
          isAvailable,
          isAdminEnabled,
          isDeprecated: modelConfig.isDeprecated ?? false,
          isRecommended,
          contextWindowTokens: modelConfig.contextWindowTokens,
          maxOutputTokens: modelConfig.maxOutputTokens,
          inputCostPerMillionTokens: modelConfig.inputCostPerMillionTokens,
          outputCostPerMillionTokens: modelConfig.outputCostPerMillionTokens,
          providerName,
          providerLabel: providerName
            ? (resolvedProviders[providerName]?.label ?? providerName)
            : undefined,
          name,
          dataResidency: modelConfig.dataResidency,
        }),
      );

    const prefs = this.aiModelPreferencesService.getPreferences();

    return {
      models,
      defaultSmartModelId: prefs.defaultSmartModels?.[0],
      defaultFastModelId: prefs.defaultFastModels?.[0],
    };
  }

  @Mutation(() => Boolean)
  async setAdminAiModelEnabled(
    @Args('modelId', { type: () => String }) modelId: string,
    @Args('enabled', { type: () => Boolean }) enabled: boolean,
  ): Promise<boolean> {
    await this.aiModelRegistryService.setModelAdminEnabled(modelId, enabled);

    return true;
  }

  @Mutation(() => Boolean)
  async setAdminAiModelsEnabled(
    @Args('modelIds', { type: () => [String] }) modelIds: string[],
    @Args('enabled', { type: () => Boolean }) enabled: boolean,
  ): Promise<boolean> {
    await this.aiModelRegistryService.setModelsAdminEnabled(modelIds, enabled);

    return true;
  }

  @Mutation(() => Boolean)
  async setAdminAiModelRecommended(
    @Args('modelId', { type: () => String }) modelId: string,
    @Args('recommended', { type: () => Boolean }) recommended: boolean,
  ): Promise<boolean> {
    await this.aiModelRegistryService.setModelRecommended(modelId, recommended);

    return true;
  }

  @Mutation(() => Boolean)
  async setAdminAiModelsRecommended(
    @Args('modelIds', { type: () => [String] }) modelIds: string[],
    @Args('recommended', { type: () => Boolean }) recommended: boolean,
  ): Promise<boolean> {
    await this.aiModelRegistryService.setModelsRecommended(
      modelIds,
      recommended,
    );

    return true;
  }

  @Mutation(() => Boolean)
  async setAdminDefaultAiModel(
    @Args('role', { type: () => AiModelRole }) role: AiModelRole,
    @Args('modelId', { type: () => String }) modelId: string,
  ): Promise<boolean> {
    await this.aiModelRegistryService.setDefaultModel(role, modelId);

    return true;
  }

  @Query(() => ConfigVariableDTO)
  async getDatabaseConfigVariable(
    @Args('key', { type: () => String }) key: keyof ConfigVariables,
  ): Promise<ConfigVariableDTO> {
    this.twentyConfigService.validateConfigVariableExists(key as string);

    return this.adminConfigService.getConfigVariable(key);
  }

  @Mutation(() => Boolean)
  async createDatabaseConfigVariable(
    @Args('key', { type: () => String }) key: keyof ConfigVariables,
    @Args('value', { type: () => GraphQLJSON })
    value: ConfigVariables[keyof ConfigVariables],
  ): Promise<boolean> {
    await this.twentyConfigService.set(key, value);

    return true;
  }

  @Mutation(() => Boolean)
  async updateDatabaseConfigVariable(
    @Args('key', { type: () => String }) key: keyof ConfigVariables,
    @Args('value', { type: () => GraphQLJSON })
    value: ConfigVariables[keyof ConfigVariables],
  ): Promise<boolean> {
    await this.twentyConfigService.update(key, value);

    return true;
  }

  @Mutation(() => Boolean)
  async deleteDatabaseConfigVariable(
    @Args('key', { type: () => String }) key: keyof ConfigVariables,
  ): Promise<boolean> {
    await this.twentyConfigService.delete(key);

    return true;
  }

  @Query(() => QueueJobsResponseDTO)
  async getQueueJobs(
    @Args('queueName', { type: () => String })
    queueName: string,
    @Args('state', { type: () => JobStateEnum })
    state: JobStateEnum,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
    @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 })
    offset?: number,
  ): Promise<QueueJobsResponseDTO> {
    return await this.adminPanelQueueService.getQueueJobs(
      queueName as MessageQueue,
      state,
      limit,
      offset,
    );
  }

  @Mutation(() => RetryJobsResponseDTO)
  async retryJobs(
    @Args('queueName', { type: () => String })
    queueName: string,
    @Args('jobIds', { type: () => [String] })
    jobIds: string[],
  ): Promise<RetryJobsResponseDTO> {
    return await this.adminPanelQueueService.retryJobs(
      queueName as MessageQueue,
      jobIds,
    );
  }

  @Mutation(() => DeleteJobsResponseDTO)
  async deleteJobs(
    @Args('queueName', { type: () => String })
    queueName: string,
    @Args('jobIds', { type: () => [String] })
    jobIds: string[],
  ): Promise<DeleteJobsResponseDTO> {
    return await this.adminPanelQueueService.deleteJobs(
      queueName as MessageQueue,
      jobIds,
    );
  }

  @Query(() => [ApplicationRegistrationEntity])
  async findAllApplicationRegistrations(): Promise<
    ApplicationRegistrationEntity[]
  > {
    return this.applicationRegistrationService.findAll();
  }

  @Mutation(() => Boolean)
  async syncMarketplaceCatalog(): Promise<boolean> {
    await this.cronQueueService.add(
      MarketplaceCatalogSyncCronJob.name,
      {},
      { id: 'marketplace-catalog-sync' }, // Avoids triggering multiple pending jobs
    );

    return true;
  }

  @Mutation(() => ApplicationRegistrationEntity)
  async updateAdminApplicationRegistration(
    @Args('input') input: UpdateApplicationRegistrationInput,
  ): Promise<ApplicationRegistrationEntity> {
    return this.applicationRegistrationService.updateGlobal(input);
  }

  @Mutation(() => Boolean)
  async backfillApplicationInstallation(
    @Args('applicationRegistrationId') applicationRegistrationId: string,
  ): Promise<boolean> {
    const registration =
      await this.applicationRegistrationService.findOneByIdGlobal(
        applicationRegistrationId,
      );

    if (!registration.isPreInstalled) {
      throw new UserInputError(
        'Only pre-installed apps can be backfilled. Enable pre-install first.',
      );
    }

    await this.workspaceQueueService.add<BackfillApplicationInstallationJobData>(
      BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
      { applicationRegistrationId },
      {
        id: `${BACKFILL_APPLICATION_INSTALLATION_JOB_NAME}-${applicationRegistrationId}`,
      }, // Avoids triggering multiple pending jobs for the same app
    );

    return true;
  }

  @Query(() => GraphQLJSON)
  async getAiProviders(): Promise<Record<string, unknown>> {
    const providers =
      this.aiModelRegistryService.getResolvedProvidersForAdmin();
    const catalog = this.defaultAiCatalogService.getDefaultAiCatalog();
    const catalogNames = this.aiModelRegistryService.getCatalogProviderNames();
    const masked: Record<string, Record<string, unknown>> = {};

    for (const [key, config] of Object.entries(providers)) {
      const isCatalog = catalogNames.has(key);
      const isOpenRouter = key === 'openrouter';
      const apiKeyConfigVariable = isCatalog
        ? extractConfigVariableName(catalog[key]?.apiKey)
        : undefined;

      masked[key] = {
        npm: config.npm,
        label: config.label ?? key,
        source: isCatalog ? 'catalog' : 'custom',
        ...(config.authType && { authType: config.authType }),
        ...(config.name && { name: config.name }),
        ...(config.baseUrl && { baseUrl: config.baseUrl }),
        ...(config.region && { region: config.region }),
        ...(config.dataResidency && { dataResidency: config.dataResidency }),
        ...(!isOpenRouter &&
          config.apiKey && {
            apiKey: `${config.apiKey.substring(0, 8)}...`,
          }),
        ...(!isOpenRouter && apiKeyConfigVariable && { apiKeyConfigVariable }),
        ...(isOpenRouter && { hasApiKey: !!config.apiKey }),
        hasAccessKey: !!(config.accessKeyId && config.secretAccessKey),
      };
    }

    return masked;
  }

  @Mutation(() => ManagedProviderCreditReceiptDTO)
  async grantManagedProviderCredit(
    @Args() input: GrantManagedProviderCreditInput,
    @AuthUser() actor: AuthContextUser,
  ): Promise<ManagedProviderCreditReceiptDTO> {
    return this.adminManagedProviderBillingService.grantCredit(input, actor.id);
  }
  @Mutation(() => Boolean)
  async recordManagedProviderOfflineCommitment(
    @Args() input: RecordManagedProviderOfflineCommitmentInput,
    @AuthUser() actor: AuthContextUser,
  ): Promise<boolean> {
    await this.adminManagedProviderBillingService.recordOfflineCommitment(
      input,
      actor.id,
    );

    return true;
  }
  @Mutation(() => Boolean)
  async correctManagedProviderFunding(
    @Args() input: CorrectManagedProviderFundingInput,
    @AuthUser() actor: AuthContextUser,
  ): Promise<boolean> {
    await this.adminManagedProviderBillingService.correctFunding(
      input,
      actor.id,
    );

    return true;
  }

  @Mutation(() => Boolean)
  async addAiProvider(
    @Args('providerName', { type: () => String }) providerName: string,
    @Args('providerConfig', { type: () => GraphQLJSON })
    providerConfig: AiProviderConfig,
  ): Promise<boolean> {
    if (!/^[a-zA-Z0-9_-]+$/.test(providerName)) {
      throw new UserInputError('Invalid provider name');
    }

    const customProviders = {
      ...this.twentyConfigService.get('AI_PROVIDERS'),
    };

    customProviders[providerName] = providerConfig;
    await this.twentyConfigService.set('AI_PROVIDERS', customProviders);

    return true;
  }

  @Mutation(() => Boolean)
  async removeAiProvider(
    @Args('providerName', { type: () => String })
    providerName: string,
  ): Promise<boolean> {
    const customProviders = {
      ...this.twentyConfigService.get('AI_PROVIDERS'),
    };

    delete customProviders[providerName];
    await this.twentyConfigService.set('AI_PROVIDERS', customProviders);

    return true;
  }

  @Query(() => [ModelsDevProviderSuggestionDTO])
  async getModelsDevProviders(): Promise<ModelsDevProviderSuggestionDTO[]> {
    return this.modelsDevCatalogService.getProviderSuggestions();
  }

  @Query(() => [ModelsDevModelSuggestionDTO])
  async getModelsDevSuggestions(
    @Args('providerType', { type: () => String }) providerType: string,
  ): Promise<ModelsDevModelSuggestionDTO[]> {
    return this.modelsDevCatalogService.getModelSuggestions(providerType);
  }

  @Mutation(() => Boolean)
  async addModelToProvider(
    @Args('providerName', { type: () => String }) providerName: string,
    @Args('modelConfig', { type: () => GraphQLJSON })
    modelConfig: AiProviderModelConfig,
  ): Promise<boolean> {
    const customProviders = {
      ...this.twentyConfigService.get('AI_PROVIDERS'),
    };

    const existing = customProviders[providerName];

    if (!existing) {
      throw new UserInputError(
        `Provider "${providerName}" not found in custom providers`,
      );
    }

    const existingModels = existing.models ?? [];
    const alreadyExists = existingModels.some(
      (model: AiProviderModelConfig) => model.name === modelConfig.name,
    );

    if (alreadyExists) {
      throw new UserInputError(
        `Model "${modelConfig.name}" already exists on provider "${providerName}"`,
      );
    }

    customProviders[providerName] = {
      ...existing,
      models: [...existingModels, { ...modelConfig, source: 'manual' }],
    };

    await this.twentyConfigService.set('AI_PROVIDERS', customProviders);

    return true;
  }

  @Mutation(() => Boolean)
  async removeModelFromProvider(
    @Args('providerName', { type: () => String }) providerName: string,
    @Args('modelName', { type: () => String }) modelName: string,
  ): Promise<boolean> {
    const customProviders = {
      ...this.twentyConfigService.get('AI_PROVIDERS'),
    };

    const existing = customProviders[providerName];

    if (!existing) {
      throw new UserInputError(
        `Provider "${providerName}" not found in custom providers`,
      );
    }

    const existingModels = existing.models ?? [];

    customProviders[providerName] = {
      ...existing,
      models: existingModels.filter(
        (model: AiProviderModelConfig) => model.name !== modelName,
      ),
    };

    await this.twentyConfigService.set('AI_PROVIDERS', customProviders);

    return true;
  }

  @Query(() => [UsageBreakdownItemDTO])
  async getAdminAiUsageByWorkspace(
    @Args('periodStart', { type: () => Date, nullable: true })
    periodStart?: Date,
    @Args('periodEnd', { type: () => Date, nullable: true })
    periodEnd?: Date,
  ): Promise<UsageBreakdownItemDTO[]> {
    const defaultEnd = new Date();
    const defaultStart = new Date();

    defaultStart.setDate(defaultStart.getDate() - 30);

    const useDollarMode = !this.twentyConfigService.get('IS_BILLING_ENABLED');

    const items = await this.usageAnalyticsService.getAdminAiUsageByWorkspace({
      periodStart: periodStart ?? defaultStart,
      periodEnd: periodEnd ?? defaultEnd,
      useDollarMode,
    });

    if (items.length === 0) {
      return items;
    }

    const workspaceIds = items.map((item) => item.key);
    const workspaces = await this.workspaceRepository.find({
      where: { id: In(workspaceIds) },
      select: { id: true, displayName: true },
    });

    const nameMap = new Map(
      workspaces
        .filter((workspace) => isDefined(workspace.displayName))
        .map((workspace) => [workspace.id, workspace.displayName!]),
    );

    return items.map((item) => ({
      ...item,
      label: nameMap.get(item.key),
    }));
  }

  @Query(() => MaintenanceModeDTO, { nullable: true })
  async getMaintenanceMode(): Promise<MaintenanceModeDTO | null> {
    const value = await this.maintenanceModeService.getMaintenanceMode();

    if (!isDefined(value)) {
      return null;
    }

    return {
      startAt: new Date(value.startAt),
      endAt: new Date(value.endAt),
      link: value.link,
    };
  }

  @Mutation(() => Boolean)
  async setMaintenanceMode(
    @Args() { startAt, endAt, link }: SetMaintenanceModeInput,
  ): Promise<boolean> {
    await this.maintenanceModeService.setMaintenanceMode({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      link,
    });

    return true;
  }

  @Mutation(() => Boolean)
  async clearMaintenanceMode(): Promise<boolean> {
    await this.maintenanceModeService.clearMaintenanceMode();

    return true;
  }

  @Query(() => UserLookup)
  async workspaceLookupAdminPanel(
    @Args('workspaceId', { type: () => UUIDScalarType }) workspaceId: string,
  ): Promise<UserLookup> {
    return this.adminUserLookupService.workspaceLookup(workspaceId);
  }

  @Query(() => AdminPanelWorkspaceBillingDTO, { nullable: true })
  async workspaceBillingAdminPanel(
    @Args('workspaceId', { type: () => UUIDScalarType }) workspaceId: string,
  ): Promise<AdminPanelWorkspaceBillingDTO | null> {
    return this.adminBillingService.getWorkspaceBilling(workspaceId);
  }

  @Query(() => [AdminWorkspaceChatThreadDTO])
  async getAdminWorkspaceChatThreads(
    @Args('workspaceId', { type: () => UUIDScalarType }) workspaceId: string,
  ): Promise<AdminWorkspaceChatThreadDTO[]> {
    return this.adminChatService.getWorkspaceChatThreads(workspaceId);
  }

  @Query(() => AdminChatThreadMessagesDTO)
  async getAdminChatThreadMessages(
    @Args('threadId', { type: () => UUIDScalarType }) threadId: string,
  ): Promise<AdminChatThreadMessagesDTO> {
    return this.adminChatService.getChatThreadMessages(threadId);
  }

  @Query(() => ApplicationRegistrationEntity)
  async findOneAdminApplicationRegistration(
    @Args('id') id: string,
  ): Promise<ApplicationRegistrationEntity> {
    return this.applicationRegistrationService.findOneByIdGlobal(id);
  }

  @Query(() => [ApplicationRegistrationVariableDTO])
  async findAdminApplicationRegistrationVariables(
    @Args('applicationRegistrationId') applicationRegistrationId: string,
  ): Promise<ApplicationRegistrationVariableDTO[]> {
    return this.applicationRegistrationVariableService.findVariablesWithObfuscatedValuesGlobal(
      applicationRegistrationId,
    );
  }

  @Query(() => ApplicationRegistrationStatsDTO)
  async findAdminApplicationRegistrationStats(
    @Args('id') id: string,
  ): Promise<ApplicationRegistrationStatsDTO> {
    return this.applicationRegistrationService.getStatsGlobal(id);
  }

  @Query(() => ApplicationRegistrationInstalledWorkspacesDTO)
  async findAdminApplicationRegistrationInstalledWorkspaces(
    @Args('input')
    {
      id,
      page,
      searchTerm,
    }: FindApplicationRegistrationInstalledWorkspacesInput,
  ): Promise<ApplicationRegistrationInstalledWorkspacesDTO> {
    return this.applicationRegistrationService.getInstalledWorkspacesGlobal(
      id,
      page ?? 1,
      INSTALLED_WORKSPACES_PAGE_SIZE,
      searchTerm,
    );
  }

  @Mutation(() => ApplicationRegistrationVariableDTO)
  async updateAdminApplicationRegistrationVariable(
    @Args('input') input: UpdateApplicationRegistrationVariableInput,
  ): Promise<ApplicationRegistrationVariableDTO> {
    return this.applicationRegistrationVariableService.updateVariableGlobal(
      input,
    );
  }

  @Query(() => InstanceAndAllWorkspacesUpgradeStatusDTO)
  async getInstanceAndAllWorkspacesUpgradeStatus(): Promise<InstanceAndAllWorkspacesUpgradeStatusDTO> {
    return this.upgradeStatusService.getInstanceAndAllWorkspacesStatus();
  }

  @Mutation(() => InstanceAndAllWorkspacesUpgradeStatusDTO)
  async refreshUpgradeStatus(): Promise<InstanceAndAllWorkspacesUpgradeStatusDTO> {
    return this.upgradeStatusService.refreshInstanceAndAllWorkspacesStatus();
  }

  @Query(() => [WorkspaceUpgradeStatusDTO])
  async getUpgradeStatus(
    @Args('workspaceIds', { type: () => [UUIDScalarType] })
    workspaceIds: string[],
  ): Promise<WorkspaceUpgradeStatusDTO[]> {
    if (workspaceIds.length === 0) {
      return [];
    }

    return this.upgradeStatusService.getWorkspaceStatuses(workspaceIds);
  }

  @Query(() => SigningKeysAdminPanelDTO)
  async getSigningKeys(): Promise<SigningKeysAdminPanelDTO> {
    return this.adminPanelSigningKeyService.getSigningKeys();
  }

  @Mutation(() => SigningKeyDTO)
  async revokeSigningKey(
    @Args() { id }: RevokeSigningKeyInput,
  ): Promise<SigningKeyDTO> {
    return this.adminPanelSigningKeyService.revokeSigningKey(id);
  }
}
