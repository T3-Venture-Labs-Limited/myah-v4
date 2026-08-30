import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  MANAGED_EMAIL_METRONOME_WORKSPACE_CONTRACT_UNIQUENESS_KEY_PREFIX,
  METRONOME_USD_CREDIT_TYPE_NAME,
  METRONOME_WORKSPACE_ALIAS_PREFIX,
  METRONOME_WORKSPACE_CONTRACT_UNIQUENESS_KEY_PREFIX,
} from '../constants/metronome-workspace-alias-prefix.constant';

import {
  type ExactStripeBillingContext,
  type MetronomeBillingConfiguration,
  type MetronomeEnvironment,
  MetronomeClientService,
} from './metronome-client.service';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';

type InstallationRepository = Pick<
  Repository<MyahWorkspaceInstallationEntity>,
  'findOneBy' | 'manager' | 'update'
>;

export type MetronomeManagedEmailContract = Readonly<{
  contractId: string;
  rateCardId: string;
}>;

@Injectable()
export class MetronomeWorkspaceCustomerService {
  constructor(
    // Installation mappings are control-plane records resolved before tenant request context exists.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(MyahWorkspaceInstallationEntity)
    private readonly installationRepository: InstallationRepository,
    private readonly metronomeClientService: MetronomeClientService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async ensureStripeBillingConfiguration(
    workspaceId: string,
    stripeCustomerId: string,
  ): Promise<MetronomeBillingConfiguration> {
    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }
    const expectedDeliveryMethodId = this.twentyConfigService.get(
      'METRONOME_STRIPE_DELIVERY_METHOD_ID',
    );

    return this.installationRepository.manager.transaction(async (manager) => {
      const installation = await manager.findOne(
        MyahWorkspaceInstallationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { workspaceId },
        },
      );

      if (!installation?.metronomeCustomerId) {
        throw new Error('Workspace Metronome customer is not configured');
      }

      const existing =
        await this.metronomeClientService.getBillingConfiguration(
          installation.metronomeCustomerId,
        );

      if (existing) {
        if (
          existing.billingProviderType !== 'stripe' ||
          existing.deliveryMethod !== 'direct_to_billing_provider' ||
          existing.deliveryMethodId !== expectedDeliveryMethodId ||
          existing.id.trim() === '' ||
          existing.stripeCustomerId !== stripeCustomerId ||
          existing.stripeCollectionMethod !== 'charge_automatically'
        ) {
          throw new Error('Metronome billing configuration mismatch');
        }

        return existing;
      }

      return this.metronomeClientService.createBillingConfiguration({
        customerId: installation.metronomeCustomerId,
        billingProviderType: 'stripe',
        deliveryMethodId: expectedDeliveryMethodId,
        stripeCustomerId,
        stripeCollectionMethod: 'charge_automatically',
      });
    });
  }

  async ensureWorkspaceStripeBillingContext({
    contractId,
    environment,
    workspaceId,
  }: {
    contractId: string;
    environment: MetronomeEnvironment;
    workspaceId: string;
  }): Promise<ExactStripeBillingContext> {
    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }
    if (
      !['PRODUCTION', 'SANDBOX'].includes(environment) ||
      this.twentyConfigService.get('METRONOME_BASE_URL_ENVIRONMENT') !==
        environment ||
      contractId.trim() === ''
    ) {
      throw new Error('Metronome billing context is invalid');
    }

    const installation = await this.installationRepository.findOneBy({
      workspaceId,
    });
    if (
      !installation?.metronomeCustomerId ||
      !installation.stripeCustomerId ||
      installation.stripeCustomerId.trim() === ''
    ) {
      throw new Error('Workspace Stripe billing context is not configured');
    }

    const deliveryMethodId = this.twentyConfigService.get(
      'METRONOME_STRIPE_DELIVERY_METHOD_ID',
    );
    const billingConfiguration =
      await this.metronomeClientService.getBillingConfiguration(
        installation.metronomeCustomerId,
      );
    if (
      billingConfiguration === null ||
      billingConfiguration.id.trim() === '' ||
      billingConfiguration.billingProviderType !== 'stripe' ||
      billingConfiguration.deliveryMethod !== 'direct_to_billing_provider' ||
      billingConfiguration.deliveryMethodId !== deliveryMethodId ||
      billingConfiguration.stripeCustomerId !== installation.stripeCustomerId ||
      billingConfiguration.stripeCollectionMethod !== 'charge_automatically'
    ) {
      throw new Error('Metronome billing configuration mismatch');
    }

    const contracts = (
      await this.metronomeClientService.findCurrentContracts(
        installation.metronomeCustomerId,
      )
    ).filter((contract) => contract.id === contractId);
    if (contracts.length !== 1) {
      throw new Error('Metronome billing contract could not be reconciled');
    }

    const contract = contracts[0];
    const schedule = contract.activeBillingProviderConfiguration;
    if (
      contract.rateCardId === null ||
      schedule === null ||
      schedule.id !== billingConfiguration.id ||
      schedule.billingProvider !== 'stripe' ||
      schedule.deliveryMethod !== 'direct_to_billing_provider' ||
      schedule.deliveryMethodId !== deliveryMethodId
    ) {
      throw new Error('Metronome billing contract schedule mismatch');
    }

    const rateCard = await this.metronomeClientService.getRateCard(
      contract.rateCardId,
    );
    if (
      rateCard.id !== contract.rateCardId ||
      rateCard.fiatCreditType === null ||
      rateCard.fiatCreditType.id.trim() === '' ||
      rateCard.fiatCreditType.name !== METRONOME_USD_CREDIT_TYPE_NAME
    ) {
      throw new Error('Metronome billing credit type mismatch');
    }

    return {
      billingConfigurationId: billingConfiguration.id,
      deliveryMethodId,
      environment,
      fiatCreditTypeId: rateCard.fiatCreditType.id,
      fiatCreditTypeName: METRONOME_USD_CREDIT_TYPE_NAME,
      metronomeContractId: contract.id,
      metronomeCustomerId: installation.metronomeCustomerId,
      stripeCustomerId: installation.stripeCustomerId,
    };
  }

  async ensureWorkspaceContractStripeBillingContext({
    billingConfigurationId,
    contractId,
    environment,
    workspaceId,
  }: {
    billingConfigurationId: string;
    contractId: string;
    environment: MetronomeEnvironment;
    workspaceId: string;
  }): Promise<ExactStripeBillingContext> {
    if (
      billingConfigurationId.trim() === '' ||
      contractId.trim() === '' ||
      workspaceId.trim() === ''
    ) {
      throw new Error('Metronome billing contract context is invalid');
    }

    const installation = await this.installationRepository.findOneBy({
      workspaceId,
    });

    if (!installation?.metronomeCustomerId) {
      throw new Error('Workspace Metronome customer is not configured');
    }

    const contracts = (
      await this.metronomeClientService.findCurrentContracts(
        installation.metronomeCustomerId,
      )
    ).filter((contract) => contract.id === contractId);

    if (contracts.length !== 1) {
      throw new Error('Metronome billing contract could not be reconciled');
    }

    const activeConfiguration =
      contracts[0].activeBillingProviderConfiguration;
    const expectedDeliveryMethodId = this.twentyConfigService.get(
      'METRONOME_STRIPE_DELIVERY_METHOD_ID',
    );

    if (activeConfiguration === null) {
      await this.metronomeClientService.addStripeBillingConfigurationToContract(
        {
          billingConfigurationId,
          contractId,
          customerId: installation.metronomeCustomerId,
          uniquenessKey: `myah:workspace-contract-billing:${workspaceId}:${contractId}`,
        },
      );
    } else if (
      activeConfiguration.id !== billingConfigurationId ||
      activeConfiguration.billingProvider !== 'stripe' ||
      activeConfiguration.deliveryMethod !== 'direct_to_billing_provider' ||
      activeConfiguration.deliveryMethodId !== expectedDeliveryMethodId
    ) {
      throw new Error('Metronome billing contract schedule mismatch');
    }

    return await this.ensureWorkspaceStripeBillingContext({
      contractId,
      environment,
      workspaceId,
    });
  }

  async ensureWorkspaceCustomer(workspaceId: string): Promise<string> {
    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    const installation = await this.installationRepository.findOneBy({
      workspaceId,
    });

    if (!installation) {
      throw new Error('Workspace installation was not found');
    }

    if (installation.metronomeCustomerId) {
      return installation.metronomeCustomerId;
    }

    const alias = `${METRONOME_WORKSPACE_ALIAS_PREFIX}${workspaceId}`;
    const matchingCustomers = await this.findActiveCustomers(alias);

    if (matchingCustomers.length > 1) {
      throw new Error('Metronome customer could not be recovered');
    }

    const customerId =
      matchingCustomers[0]?.id ??
      (await this.createOrRecoverWorkspaceCustomer(workspaceId, alias));
    const updateResult = await this.installationRepository.update(
      { metronomeCustomerId: IsNull(), workspaceId },
      { metronomeCustomerId: customerId },
    );

    if (updateResult.affected === 1) {
      return customerId;
    }

    const concurrentInstallation = await this.installationRepository.findOneBy({
      workspaceId,
    });

    if (concurrentInstallation?.metronomeCustomerId === customerId) {
      return customerId;
    }

    throw new Error('Metronome customer could not be stored');
  }

  async ensureWorkspaceContract(workspaceId: string): Promise<string> {
    const customerId = await this.ensureWorkspaceCustomer(workspaceId);
    const rateCardAlias = this.twentyConfigService.get(
      'METRONOME_RATE_CARD_ALIAS',
    );
    const uniquenessKey = `${METRONOME_WORKSPACE_CONTRACT_UNIQUENESS_KEY_PREFIX}${workspaceId}`;

    try {
      const contract = await this.metronomeClientService.createContract({
        customerId,
        rateCardAlias,
        uniquenessKey,
      });

      return contract.id;
    } catch (error) {
      if (!this.isContractConflict(error)) {
        throw error;
      }

      return this.recoverWorkspaceContract({
        customerId,
        error,
        rateCardAlias,
        uniquenessKey,
      });
    }
  }

  async ensureWorkspaceManagedEmailContract(
    workspaceId: string,
  ): Promise<MetronomeManagedEmailContract> {
    if (!this.twentyConfigService.get('MANAGED_EMAIL_ENABLED')) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    const customerId = await this.ensureWorkspaceCustomer(workspaceId);
    const rateCardAlias = this.twentyConfigService.get(
      'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS',
    );
    const uniquenessKey = `${MANAGED_EMAIL_METRONOME_WORKSPACE_CONTRACT_UNIQUENESS_KEY_PREFIX}${workspaceId}`;
    let createdContractId: string | undefined;
    let recoveryCause: unknown = new Error(
      'Metronome managed-email contract requires verification',
    );

    try {
      const contract = await this.metronomeClientService.createContract({
        billingProviderConfiguration: {
          billingProvider: 'stripe',
          deliveryMethod: 'direct_to_billing_provider',
        },
        customerId,
        rateCardAlias,
        uniquenessKey,
      });
      createdContractId = contract.id;
    } catch (error) {
      if (!this.isManagedEmailContractRecoverableCreateError(error)) {
        throw error;
      }
      recoveryCause = error;
    }

    return this.recoverManagedEmailContract({
      createdContractId,
      customerId,
      error: recoveryCause,
      rateCardAlias,
      uniquenessKey,
    });
  }

  private async recoverManagedEmailContract({
    createdContractId,
    customerId,
    error,
    rateCardAlias,
    uniquenessKey,
  }: {
    createdContractId: string | undefined;
    customerId: string;
    error: unknown;
    rateCardAlias: string;
    uniquenessKey: string;
  }): Promise<MetronomeManagedEmailContract> {
    const matchingContracts = (
      await this.metronomeClientService.findCurrentContracts(customerId)
    ).filter((contract) => contract.uniquenessKey === uniquenessKey);

    if (
      matchingContracts.length !== 1 ||
      (createdContractId !== undefined &&
        matchingContracts[0].id !== createdContractId)
    ) {
      throw this.createManagedEmailContractReconciliationError(error);
    }

    const contract = matchingContracts[0];
    const configuration = contract.activeBillingProviderConfiguration;
    const expectedDeliveryMethodId = this.twentyConfigService.get(
      'METRONOME_STRIPE_DELIVERY_METHOD_ID',
    );

    if (
      contract.rateCardId === null ||
      configuration === null ||
      configuration.id.trim() === '' ||
      configuration.billingProvider !== 'stripe' ||
      configuration.deliveryMethod !== 'direct_to_billing_provider' ||
      configuration.deliveryMethodId !== expectedDeliveryMethodId
    ) {
      throw this.createManagedEmailContractReconciliationError(error);
    }

    const rateCard = await this.metronomeClientService.getRateCard(
      contract.rateCardId,
    );

    if (
      rateCard.id !== contract.rateCardId ||
      rateCard.fiatCreditType === null ||
      rateCard.fiatCreditType.id.trim() === '' ||
      rateCard.fiatCreditType.name !== METRONOME_USD_CREDIT_TYPE_NAME ||
      rateCard.aliases.some(
        (alias) =>
          alias.name === rateCardAlias &&
          this.isAliasActiveAt(alias, contract.startingAt),
      ) === false
    ) {
      throw this.createManagedEmailContractReconciliationError(error);
    }

    return { contractId: contract.id, rateCardId: contract.rateCardId };
  }

  private createManagedEmailContractReconciliationError(cause: unknown): Error {
    return this.createReconciliationError(
      'Metronome managed-email contract recovery requires reconciliation',
      cause,
    );
  }

  private async recoverWorkspaceContract({
    customerId,
    error,
    rateCardAlias,
    uniquenessKey,
  }: {
    customerId: string;
    error: MetronomeClientException;
    rateCardAlias: string;
    uniquenessKey: string;
  }): Promise<string> {
    const matchingContracts = (
      await this.metronomeClientService.findCurrentContracts(customerId)
    ).filter((contract) => contract.uniquenessKey === uniquenessKey);

    if (matchingContracts.length !== 1) {
      throw this.createContractReconciliationError(error);
    }

    const contract = matchingContracts[0];

    if (!contract.rateCardId) {
      throw this.createContractReconciliationError(error);
    }

    const rateCard = await this.metronomeClientService.getRateCard(
      contract.rateCardId,
    );

    if (
      rateCard.id !== contract.rateCardId ||
      !rateCard.aliases.some(
        (alias) =>
          alias.name === rateCardAlias &&
          this.isAliasActiveAt(alias, contract.startingAt),
      )
    ) {
      throw this.createContractReconciliationError(error);
    }

    return contract.id;
  }

  private createContractReconciliationError(
    cause: MetronomeClientException,
  ): Error {
    return this.createReconciliationError(
      'Metronome contract recovery requires reconciliation',
      cause,
    );
  }

  private createReconciliationError(message: string, cause: unknown): Error {
    return Object.assign(new Error(message), { cause });
  }

  private isAliasActiveAt(
    alias: {
      endingBefore: string | null;
      startingAt: string | null;
    },
    effectiveAt: string,
  ): boolean {
    const effectiveAtMilliseconds = Date.parse(effectiveAt);
    const startsAtMilliseconds =
      alias.startingAt === null ? null : Date.parse(alias.startingAt);
    const endsAtMilliseconds =
      alias.endingBefore === null ? null : Date.parse(alias.endingBefore);

    return (
      Number.isFinite(effectiveAtMilliseconds) &&
      (startsAtMilliseconds === null ||
        (Number.isFinite(startsAtMilliseconds) &&
          startsAtMilliseconds <= effectiveAtMilliseconds)) &&
      (endsAtMilliseconds === null ||
        (Number.isFinite(endsAtMilliseconds) &&
          effectiveAtMilliseconds < endsAtMilliseconds))
    );
  }

  private isContractConflict(
    error: unknown,
  ): error is MetronomeClientException {
    return (
      error instanceof MetronomeClientException &&
      error.code === MetronomeClientExceptionCode.CONFLICT
    );
  }

  private isManagedEmailContractRecoverableCreateError(
    error: unknown,
  ): error is MetronomeClientException {
    return (
      error instanceof MetronomeClientException &&
      (error.code === MetronomeClientExceptionCode.CONFLICT ||
        error.code === MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN)
    );
  }
  private async createWorkspaceCustomer(
    workspaceId: string,
    alias: string,
  ): Promise<string> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });

    if (!workspace) {
      throw new Error('Workspace was not found');
    }

    const name = workspace.displayName?.trim() || workspaceId;
    const customer = await this.metronomeClientService.createCustomer({
      alias,
      name,
    });

    return customer.id;
  }

  private async createOrRecoverWorkspaceCustomer(
    workspaceId: string,
    alias: string,
  ): Promise<string> {
    try {
      return await this.createWorkspaceCustomer(workspaceId, alias);
    } catch (error) {
      if (!this.isRecoverableCreateError(error)) {
        throw error;
      }

      const recoveredCustomers = await this.findActiveCustomers(alias);

      if (recoveredCustomers.length === 1) {
        return recoveredCustomers[0].id;
      }

      throw this.createReconciliationError(
        'Metronome customer recovery requires reconciliation',
        error,
      );
    }
  }

  private async findActiveCustomers(alias: string) {
    return (
      await this.metronomeClientService.findCustomerByIngestAlias(alias)
    ).filter(
      (customer) =>
        customer.archivedAt === null && customer.ingestAliases.includes(alias),
    );
  }

  private isRecoverableCreateError(
    error: unknown,
  ): error is MetronomeClientException {
    return (
      error instanceof MetronomeClientException &&
      (error.code === MetronomeClientExceptionCode.CONFLICT ||
        error.code === MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN)
    );
  }
}
