import { Inject, Injectable } from '@nestjs/common';

import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { IcemailClient } from '../providers/icemail/icemail.client';
import {
  type IcemailDomainSummary,
  type IcemailMailboxSummary,
} from '../providers/icemail/icemail.types';
import { type ManagedEmailProviderReceipt } from '../types/managed-email-persistence.type';
import { assertManagedEmailProviderReceiptPartition } from '../utils/validate-managed-email-persistence-json.util';

import { MANAGED_EMAIL_ACQUISITION_CLOCK } from './managed-email-acquisition.service';

const RECONCILIATION_DELAY_MS = 60_000;

const normalize = (value: string): string => value.trim().toLowerCase();

type ExactProviderResources = {
  domains: IcemailDomainSummary[];
  mailboxes: IcemailMailboxSummary[];
};

@Injectable()
export class ManagedEmailReconciliationService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly operationRepository: WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailDomainEntity)
    private readonly domainRepository: WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    private readonly icemailClient: IcemailClient,
    @Inject(MANAGED_EMAIL_ACQUISITION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcile({
    operationId,
    workspaceId,
  }: {
    operationId: string;
    workspaceId: string;
  }): Promise<ManagedEmailAcquisitionOperationEntity> {
    const operation = await this.operationRepository.findOneBy(workspaceId, {
      id: operationId,
    });

    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }
    if (operation.state !== 'RECONCILIATION_REQUIRED') {
      return operation;
    }

    try {
      if (operation.providerReceipt !== null) {
        return await this.projectAndCompleteReceipt(
          operation,
          operation.providerReceipt,
        );
      }
      const [domains, mailboxes] = await Promise.all([
        this.icemailClient.listAllDomains(),
        this.icemailClient.listAllMailboxes(),
      ]);
      const classification = this.classifyExactResources(
        operation,
        domains,
        mailboxes,
      );
      if (classification.kind === 'EXACT') {
        const providerReceipt = this.toProviderReceipt(
          classification.resources,
        );
        assertManagedEmailProviderReceiptPartition(
          providerReceipt,
          operation.resourceSnapshot,
        );
        await this.persistRecoveredReceipt(operation, providerReceipt);
        return await this.projectAndCompleteReceipt(operation, providerReceipt);
      }

      return this.persistPending(
        operation,
        classification.kind === 'AMBIGUOUS'
          ? 'ICEMAIL_RECONCILIATION_AMBIGUOUS'
          : 'ICEMAIL_RECONCILIATION_NOT_FOUND',
      );
    } catch {
      return this.persistPending(
        operation,
        'ICEMAIL_RECONCILIATION_READ_FAILED',
      );
    }
  }

  private classifyExactResources(
    operation: ManagedEmailAcquisitionOperationEntity,
    providerDomains: IcemailDomainSummary[],
    providerMailboxes: IcemailMailboxSummary[],
  ):
    | { kind: 'AMBIGUOUS' | 'NOT_FOUND' }
    | { kind: 'EXACT'; resources: ExactProviderResources } {
    const domains: IcemailDomainSummary[] = [];
    const mailboxes: IcemailMailboxSummary[] = [];

    for (const expectedDomain of operation.resourceSnapshot.domains) {
      const domainMatches = providerDomains.filter(
        ({ domain }) => normalize(domain) === normalize(expectedDomain.domain),
      );

      if (domainMatches.length > 1) {
        return { kind: 'AMBIGUOUS' };
      }
      if (domainMatches.length === 0) {
        return { kind: 'NOT_FOUND' };
      }
      const providerDomain = domainMatches[0];

      domains.push(providerDomain);
      for (const expectedAddress of expectedDomain.mailboxes) {
        const mailboxMatches = providerMailboxes.filter(
          ({ address, domainId }) =>
            normalize(address) === normalize(expectedAddress) &&
            domainId === providerDomain.id,
        );

        if (mailboxMatches.length > 1) {
          return { kind: 'AMBIGUOUS' };
        }
        if (mailboxMatches.length === 0) {
          return { kind: 'NOT_FOUND' };
        }
        mailboxes.push(mailboxMatches[0]);
      }
    }

    return { kind: 'EXACT', resources: { domains, mailboxes } };
  }

  private toProviderReceipt(
    resources: ExactProviderResources,
  ): ManagedEmailProviderReceipt {
    return {
      domains: resources.domains.map((domain) => ({
        mailboxes: resources.mailboxes
          .filter(({ domainId }) => domainId === domain.id)
          .map((mailbox) => ({
            normalizedAddress: normalize(mailbox.address),
            providerMailboxId: mailbox.id,
          })),
        normalizedDomain: normalize(domain.domain),
        providerDomainId: domain.id,
        providerOrderId: null,
      })),
      failedInventoryIds: [],
      orderIds: [],
      schemaVersion: 1,
      totalCostCents: null,
    };
  }
  private async persistRecoveredReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    providerReceipt: ManagedEmailProviderReceipt,
  ): Promise<void> {
    const patch = {
      nextReconciliationAt: new Date(
        this.now().getTime() + RECONCILIATION_DELAY_MS,
      ),
      providerOutcome: 'RECONCILED',
      providerReceipt,
      safeFailureCode: null,
    };
    const update = await this.operationRepository.update(
      operation.workspaceId,
      { id: operation.id, state: 'RECONCILIATION_REQUIRED' },
      patch,
    );
    if (update.affected !== 1) {
      throw new Error('Managed email provider receipt could not be persisted');
    }
    Object.assign(operation, patch);
  }
  private async projectAndCompleteReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    providerReceipt: ManagedEmailProviderReceipt,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    assertManagedEmailProviderReceiptPartition(
      providerReceipt,
      operation.resourceSnapshot,
    );
    for (const domain of providerReceipt.domains) {
      const domainUpdate = await this.domainRepository.update(
        operation.workspaceId,
        { normalizedDomain: domain.normalizedDomain },
        {
          infrastructureState:
            ManagedEmailInfrastructureState.PROVISIONING_DOMAIN,
          providerDomainId: domain.providerDomainId,
          providerOrderId: domain.providerOrderId,
        },
      );
      if (domainUpdate.affected !== 1) {
        throw new Error(
          'Managed email provider receipt projection is incomplete',
        );
      }
      for (const mailbox of domain.mailboxes) {
        const mailboxUpdate = await this.mailboxRepository.update(
          operation.workspaceId,
          { normalizedAddress: mailbox.normalizedAddress },
          {
            infrastructureState:
              ManagedEmailInfrastructureState.PROVISIONING_MAILBOX,
            providerMailboxId: mailbox.providerMailboxId,
            providerOrderId: domain.providerOrderId,
          },
        );
        if (mailboxUpdate.affected !== 1) {
          throw new Error(
            'Managed email provider receipt projection is incomplete',
          );
        }
      }
    }
    for (const expectedDomain of operation.resourceSnapshot.domains) {
      if (
        expectedDomain.providerInventoryId === undefined ||
        !providerReceipt.failedInventoryIds.includes(
          expectedDomain.providerInventoryId,
        )
      ) {
        continue;
      }
      const domainUpdate = await this.domainRepository.update(
        operation.workspaceId,
        { normalizedDomain: expectedDomain.domain },
        {
          infrastructureState:
            ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
          safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
        },
      );
      if (domainUpdate.affected !== 1) {
        throw new Error(
          'Managed email provider receipt projection is incomplete',
        );
      }
      for (const address of expectedDomain.mailboxes) {
        const mailboxUpdate = await this.mailboxRepository.update(
          operation.workspaceId,
          { normalizedAddress: address },
          {
            campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
            infrastructureState:
              ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
            safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
          },
        );
        if (mailboxUpdate.affected !== 1) {
          throw new Error(
            'Managed email provider receipt projection is incomplete',
          );
        }
      }
    }
    const partial = providerReceipt.failedInventoryIds.length > 0;
    const patch = {
      nextReconciliationAt: null,
      safeFailureCode: partial ? 'ICEMAIL_PARTIAL_PURCHASE' : null,
      state: partial ? 'PROVIDER_PARTIAL' : 'PROVIDER_SUCCEEDED',
    };
    const update = await this.operationRepository.update(
      operation.workspaceId,
      { id: operation.id, state: 'RECONCILIATION_REQUIRED' },
      patch,
    );
    if (update.affected !== 1) {
      return this.getOperation(operation.id, operation.workspaceId);
    }
    Object.assign(operation, patch);
    return operation;
  }

  private async persistPending(
    operation: ManagedEmailAcquisitionOperationEntity,
    safeFailureCode: string,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const patch = {
      nextReconciliationAt: new Date(
        this.now().getTime() + RECONCILIATION_DELAY_MS,
      ),
      reconciliationAttemptCount: operation.reconciliationAttemptCount + 1,
      safeFailureCode,
      state: 'RECONCILIATION_REQUIRED',
    };

    const update = await this.operationRepository.update(
      operation.workspaceId,
      { id: operation.id, state: 'RECONCILIATION_REQUIRED' },
      patch,
    );
    if (update.affected !== 1) {
      return this.getOperation(operation.id, operation.workspaceId);
    }
    Object.assign(operation, patch);

    return operation;
  }
  private async getOperation(
    operationId: string,
    workspaceId: string,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const operation = await this.operationRepository.findOneBy(workspaceId, {
      id: operationId,
    });
    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }
    return operation;
  }
}
