import { FindOperator, type Repository } from 'typeorm';

import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN } from '../../constants/managed-email-reconciliation-cron-pattern.constant';
import { ManagedEmailReconciliationCronCommand } from '../../crons/commands/managed-email-reconciliation.cron.command';
import {
  MANAGED_EMAIL_MAILBOX_ACTIVATION_CRON_PATTERN,
  ManagedEmailMailboxActivationCronJob,
} from '../../crons/managed-email-mailbox-activation.cron.job';
import {
  MANAGED_EMAIL_READINESS_CRON_PATTERN,
  ManagedEmailReadinessCronJob,
} from '../../crons/managed-email-readiness.cron.job';
import { ManagedEmailReconciliationCronJob } from '../../crons/managed-email-reconciliation.cron.job';
import { ManagedEmailAcquisitionOperationEntity } from '../../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../../entities/managed-email-mailbox.entity';
import { ManagedEmailAcquisitionMode } from '../../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailInfrastructureState } from '../../enums/managed-email-infrastructure-state.enum';
import { ReconcileManagedEmailAcquisitionJob } from '../../jobs/reconcile-managed-email-acquisition.job';
import { type IcemailClient } from '../../providers/icemail/icemail.client';
import { type ManagedEmailAcquisitionService } from '../managed-email-acquisition.service';
import { ManagedEmailReconciliationService } from '../managed-email-reconciliation.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const operationId = '123e4567-e89b-42d3-a456-426614174020';
const now = new Date('2026-08-05T12:00:00.000Z');

const createOperation = (): ManagedEmailAcquisitionOperationEntity =>
  ({
    acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
    id: operationId,
    nextReconciliationAt: now,
    providerOutcome: 'UNKNOWN',
    providerReceipt: null,
    reconciliationAttemptCount: 0,
    resourceSnapshot: {
      domains: [
        {
          domain: 'creator-partners.com',
          mailboxes: ['maya@creator-partners.com', 'sam@creator-partners.com'],
          providerQuote: {
            amountMinorUnits: 1_000,
            currency: 'USD',
            fingerprint: 'quote-fingerprint',
            observedAt: '2026-08-05T11:00:00.000Z',
            termCount: 1,
            termUnit: 'YEAR',
          },
        },
      ],
      personas: [],
      proposal: {
        createdAt: '2026-08-05T11:00:00.000Z',
        expiresAt: '2026-08-06T11:00:00.000Z',
        policyVersion: 'proposal-v1',
      },
    },
    safeFailureCode: 'ICEMAIL_WRITE_OUTCOME_UNCERTAIN',
    state: 'RECONCILIATION_REQUIRED',
    workspaceId,
  }) as unknown as ManagedEmailAcquisitionOperationEntity;

const domain = {
  active: true,
  blacklisted: false,
  domain: 'creator-partners.com',
  expiresAt: new Date('2027-08-05T00:00:00.000Z'),
  id: 'provider-domain-1',
  mailboxCount: 2,
  prewarmed: false,
  provider: 'GOOGLE' as const,
  purchased: true,
  status: 'active',
};
const mailboxes = [
  {
    active: true,
    address: 'maya@creator-partners.com',
    domain: 'creator-partners.com',
    domainId: domain.id,
    firstName: 'Maya',
    id: 'provider-mailbox-1',
    lastName: 'Chen',
    master: false,
    nextBillingAt: null,
    provider: 'GOOGLE' as const,
    status: 'active',
  },
  {
    active: true,
    address: 'sam@creator-partners.com',
    domain: 'creator-partners.com',
    domainId: domain.id,
    firstName: 'Sam',
    id: 'provider-mailbox-2',
    lastName: 'Lee',
    master: false,
    nextBillingAt: null,
    provider: 'GOOGLE' as const,
    status: 'active',
  },
];

const createHarness = (operation = createOperation()) => {
  const events: string[] = [];
  const operationRepository = {
    findOneBy: jest.fn(async (candidateWorkspaceId: string) =>
      candidateWorkspaceId === workspaceId ? operation : null,
    ),
    update: jest.fn(
      async (_workspaceId: string, _criteria: object, patch: object) => {
        events.push('receipt');
        Object.assign(operation, patch);
        return { affected: 1 };
      },
    ),
  };
  const domainRepository = {
    update: jest.fn(async () => {
      events.push('domain');
      return { affected: 1 };
    }),
  };
  const mailboxRepository = {
    update: jest.fn(
      async (_workspaceId: string, _criteria: object, _patch: object) => {
        events.push('mailbox');
        return { affected: 1 };
      },
    ),
  };
  const icemailClient = {
    listAllDomains: jest.fn().mockResolvedValue([domain]),
    listAllMailboxes: jest.fn().mockResolvedValue(mailboxes),
  };
  const service = new ManagedEmailReconciliationService(
    operationRepository as unknown as WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    domainRepository as unknown as WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    mailboxRepository as unknown as WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    icemailClient as unknown as IcemailClient,
    () => now,
  );

  return {
    domainRepository,
    events,
    icemailClient,
    mailboxRepository,
    operation,
    service,
  };
};

describe('ManagedEmailReconciliationService', () => {
  it('persists one exact provider match before projecting identifiers', async () => {
    const harness = createHarness();

    const result = await harness.service.reconcile({
      operationId,
      workspaceId,
    });

    expect(result.state).toBe('PROVIDER_SUCCEEDED');
    expect(result.providerOutcome).toBe('RECONCILED');
    expect(result.providerReceipt).toEqual({
      domains: [
        {
          mailboxes: [
            {
              normalizedAddress: 'maya@creator-partners.com',
              providerMailboxId: 'provider-mailbox-1',
            },
            {
              normalizedAddress: 'sam@creator-partners.com',
              providerMailboxId: 'provider-mailbox-2',
            },
          ],
          normalizedDomain: 'creator-partners.com',
          providerDomainId: 'provider-domain-1',
          providerOrderId: null,
        },
      ],
      failedInventoryIds: [],
      orderIds: [],
      schemaVersion: 1,
      totalCostCents: null,
    });
    expect(harness.events[0]).toBe('receipt');
    expect(harness.domainRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { normalizedDomain: 'creator-partners.com' },
      expect.objectContaining({ providerDomainId: 'provider-domain-1' }),
    );
    expect(harness.mailboxRepository.update).toHaveBeenCalledTimes(2);
    for (const call of harness.mailboxRepository.update.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({
          infrastructureState:
            ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
          nextReconciliationAt: expect.any(Date),
        }),
      );
    }
  });

  it('projects only receipt-confirmed resources for a partial purchase', async () => {
    const operation = createOperation();
    operation.acquisitionMode = ManagedEmailAcquisitionMode.PREWARMED_INVENTORY;
    operation.providerOutcome = 'PARTIAL';
    operation.providerReceipt = {
      domains: [
        {
          mailboxes: [
            {
              normalizedAddress: 'maya@creator-partners.com',
              providerMailboxId: 'provider-mailbox-1',
            },
            {
              normalizedAddress: 'sam@creator-partners.com',
              providerMailboxId: 'provider-mailbox-2',
            },
          ],
          normalizedDomain: 'creator-partners.com',
          providerDomainId: 'provider-domain-1',
          providerOrderId: 'prewarm-order-1',
        },
      ],
      failedInventoryIds: ['inventory-2'],
      orderIds: ['prewarm-order-1'],
      schemaVersion: 1,
      totalCostCents: 1_500,
    };
    operation.resourceSnapshot = {
      ...operation.resourceSnapshot,
      domains: [
        ...operation.resourceSnapshot.domains,
        {
          domain: 'failed-partners.com',
          mailboxes: ['lee@failed-partners.com'],
          providerInventoryId: 'inventory-2',
          providerQuote: {
            amountMinorUnits: 1_250,
            currency: 'USD',
            fingerprint: 'failed-quote-fingerprint',
            observedAt: '2026-08-05T11:00:00.000Z',
            termCount: 1,
            termUnit: 'YEAR',
          },
        },
      ],
    };
    const harness = createHarness(operation);
    const result = await harness.service.reconcile({
      operationId,
      workspaceId,
    });
    expect(result.state).toBe('PROVIDER_PARTIAL');
    expect(result.safeFailureCode).toBe('ICEMAIL_PARTIAL_PURCHASE');
    expect(harness.icemailClient.listAllDomains).not.toHaveBeenCalled();
    expect(harness.domainRepository.update).toHaveBeenCalledTimes(2);
    expect(harness.domainRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { normalizedDomain: 'creator-partners.com' },
      expect.objectContaining({ providerDomainId: 'provider-domain-1' }),
    );
    expect(harness.domainRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { normalizedDomain: 'failed-partners.com' },
      expect.objectContaining({
        infrastructureState: 'REPLACEMENT_REQUIRED',
        safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
      }),
    );
    expect(harness.mailboxRepository.update).toHaveBeenCalledTimes(3);
    expect(harness.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { normalizedAddress: 'lee@failed-partners.com' },
      expect.objectContaining({
        campaignEligibility: 'BLOCKED',
        infrastructureState: 'REPLACEMENT_REQUIRED',
        safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
      }),
    );
  });

  it('keeps a conclusive zero match pending without replaying a write', async () => {
    const harness = createHarness();
    harness.icemailClient.listAllDomains.mockResolvedValueOnce([]);
    harness.icemailClient.listAllMailboxes.mockResolvedValueOnce([]);

    const result = await harness.service.reconcile({
      operationId,
      workspaceId,
    });

    expect(result.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.safeFailureCode).toBe('ICEMAIL_RECONCILIATION_NOT_FOUND');
    expect(result.reconciliationAttemptCount).toBe(1);
    expect(result.nextReconciliationAt).toEqual(
      new Date('2026-08-05T12:01:00.000Z'),
    );
    expect(harness.domainRepository.update).not.toHaveBeenCalled();
    expect(harness.mailboxRepository.update).not.toHaveBeenCalled();
  });

  it('keeps multiple exact provider matches pending as ambiguous', async () => {
    const harness = createHarness();
    harness.icemailClient.listAllDomains.mockResolvedValueOnce([
      domain,
      { ...domain, id: 'provider-domain-2' },
    ]);

    const result = await harness.service.reconcile({
      operationId,
      workspaceId,
    });

    expect(result.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.safeFailureCode).toBe('ICEMAIL_RECONCILIATION_AMBIGUOUS');
    expect(harness.domainRepository.update).not.toHaveBeenCalled();
    expect(harness.mailboxRepository.update).not.toHaveBeenCalled();
  });

  it('rejects cross-workspace recovery', async () => {
    const harness = createHarness();

    await expect(
      harness.service.reconcile({
        operationId,
        workspaceId: '123e4567-e89b-42d3-a456-426614174099',
      }),
    ).rejects.toThrow('Managed email acquisition operation was not found');
    expect(harness.icemailClient.listAllDomains).not.toHaveBeenCalled();
  });
});

describe('ReconcileManagedEmailAcquisitionJob', () => {
  it('continues the durable state machine before provider reconciliation', async () => {
    const order: string[] = [];
    const acquisitionService = {
      continue: jest.fn(async () => {
        order.push('continue');
        return { state: 'RECONCILIATION_REQUIRED' };
      }),
    };
    const reconciliationService = {
      reconcile: jest.fn(async () => order.push('reconcile')),
    };
    const job = new ReconcileManagedEmailAcquisitionJob(
      acquisitionService as unknown as ManagedEmailAcquisitionService,
      reconciliationService as unknown as ManagedEmailReconciliationService,
    );
    await job.handle({ operationId, workspaceId });
    expect(acquisitionService.continue).toHaveBeenCalledWith({
      operationId,
      workspaceId,
    });
    expect(reconciliationService.reconcile).toHaveBeenCalledWith({
      operationId,
      workspaceId,
    });
    expect(order).toEqual(['continue', 'reconcile']);
  });
  it('does not read provider state while payment recovery remains pending', async () => {
    const acquisitionService = {
      continue: jest.fn().mockResolvedValue({ state: 'PAYMENT_PENDING' }),
    };
    const reconciliationService = { reconcile: jest.fn() };
    const job = new ReconcileManagedEmailAcquisitionJob(
      acquisitionService as unknown as ManagedEmailAcquisitionService,
      reconciliationService as unknown as ManagedEmailReconciliationService,
    );
    await job.handle({ operationId, workspaceId });
    expect(reconciliationService.reconcile).not.toHaveBeenCalled();
  });
});

describe('ManagedEmailReconciliationCronJob', () => {
  it('enqueues a bounded batch of due operations independent of feature admission', async () => {
    const operations = [
      createOperation(),
      {
        ...createOperation(),
        id: '123e4567-e89b-42d3-a456-426614174021',
        workspaceId: '123e4567-e89b-42d3-a456-426614174002',
      },
    ];
    const operationRepository = {
      find: jest.fn().mockResolvedValue(operations),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const messageQueueService = { add: jest.fn() };
    const cron = new ManagedEmailReconciliationCronJob(
      operationRepository as unknown as Repository<ManagedEmailAcquisitionOperationEntity>,
      messageQueueService as unknown as MessageQueueService,
      () => now,
    );

    await cron.handle();

    expect(operationRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { nextReconciliationAt: 'ASC', id: 'ASC' },
        take: 100,
        where: expect.any(Array),
      }),
    );
    const where = operationRepository.find.mock.calls[0][0].where;
    expect((where[0].state as FindOperator<string>).value).toEqual([
      'CREATING_SUBSCRIPTIONS',
      'PAYMENT_PENDING',
      'PAYMENT_PAID',
      'PROVIDER_INTENT_RECORDED',
      'RECONCILIATION_REQUIRED',
    ]);
    expect((where[1].state as FindOperator<string>).value).toEqual(
      (where[0].state as FindOperator<string>).value,
    );
    expect(where[0].nextReconciliationAt).toBeInstanceOf(FindOperator);
    expect(where[1].nextReconciliationAt).toBeInstanceOf(FindOperator);
    expect(operationRepository.update).toHaveBeenCalledTimes(2);
    expect(messageQueueService.add).toHaveBeenCalledTimes(2);
    expect(messageQueueService.add).toHaveBeenNthCalledWith(
      1,
      ReconcileManagedEmailAcquisitionJob.name,
      { operationId, workspaceId },
      expect.objectContaining({
        id: `managed-email-reconciliation:${operationId}`,
      }),
    );
  });
});

describe('ManagedEmailReconciliationCronCommand', () => {
  it('seeds immediate scans and recurring schedules for every recovery loop', async () => {
    const messageQueueService = {
      add: jest.fn(),
      addCron: jest.fn(),
    };
    const command = new ManagedEmailReconciliationCronCommand(
      messageQueueService as unknown as MessageQueueService,
    );

    await command.run();

    expect(messageQueueService.add).toHaveBeenCalledWith(
      ManagedEmailReconciliationCronJob.name,
      {},
    );
    expect(messageQueueService.add).toHaveBeenCalledWith(
      ManagedEmailMailboxActivationCronJob.name,
      {},
    );
    expect(messageQueueService.add).toHaveBeenCalledWith(
      ManagedEmailReadinessCronJob.name,
      {},
    );
    expect(messageQueueService.add).toHaveBeenCalledTimes(3);
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      data: undefined,
      jobName: ManagedEmailReconciliationCronJob.name,
      options: {
        repeat: { pattern: MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN },
      },
    });
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      data: undefined,
      jobName: ManagedEmailMailboxActivationCronJob.name,
      options: {
        repeat: { pattern: MANAGED_EMAIL_MAILBOX_ACTIVATION_CRON_PATTERN },
      },
    });
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      data: undefined,
      jobName: ManagedEmailReadinessCronJob.name,
      options: {
        repeat: { pattern: MANAGED_EMAIL_READINESS_CRON_PATTERN },
      },
    });
    expect(messageQueueService.addCron).toHaveBeenCalledTimes(3);
  });
});
