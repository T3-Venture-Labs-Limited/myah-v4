import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  METRONOME_WORKSPACE_ALIAS_PREFIX,
  METRONOME_WORKSPACE_CONTRACT_UNIQUENESS_KEY_PREFIX,
} from '../constants/metronome-workspace-alias-prefix.constant';

import { MetronomeClientService } from './metronome-client.service';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';

type InstallationRepository = Pick<
  Repository<MyahWorkspaceInstallationEntity>,
  'findOneBy' | 'update'
>;

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
