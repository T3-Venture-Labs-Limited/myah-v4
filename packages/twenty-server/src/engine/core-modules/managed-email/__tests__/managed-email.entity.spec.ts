import { getMetadataArgsStorage } from 'typeorm';

import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailAcquisitionMode } from '../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupMode } from '../enums/managed-email-warmup-mode.enum';
import { ManagedEmailWarmupState } from '../enums/managed-email-warmup-state.enum';

const metadataFor = (target: Function) => {
  const metadata = getMetadataArgsStorage();

  return {
    checks: metadata.checks.filter((item) => item.target === target),
    columns: metadata.columns.filter((item) => item.target === target),
    indices: metadata.indices.filter((item) => item.target === target),
    joinColumns: metadata.joinColumns.filter((item) => item.target === target),
    relations: metadata.relations.filter((item) => item.target === target),
    table: metadata.tables.find((item) => item.target === target),
    uniques: metadata.uniques.filter((item) => item.target === target),
  };
};

const columnOptions = (target: Function, propertyName: string) =>
  metadataFor(target).columns.find(
    (column) => column.propertyName === propertyName,
  )?.options;

const expectNamedIndex = (
  target: Function,
  name: string,
  columns: string[],
  options: { unique?: boolean; where?: string } = {},
) => {
  expect(metadataFor(target).indices).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ columns, name, ...options }),
    ]),
  );
};

const expectNamedCheck = (
  target: Function,
  name: string,
  expression: string,
) => {
  expect(metadataFor(target).checks).toEqual(
    expect.arrayContaining([expect.objectContaining({ expression, name })]),
  );
};

describe('managed email persistence entities', () => {
  it('uses only the approved lifecycle enum values', () => {
    expect(Object.values(ManagedEmailAcquisitionMode)).toEqual([
      'PREWARMED_INVENTORY',
      'NEW_MANAGED',
    ]);
    expect(Object.values(ManagedEmailInfrastructureState)).toEqual([
      'AWAITING_PAYMENT',
      'ORDERING',
      'PROVISIONING_DOMAIN',
      'PROVISIONING_MAILBOX',
      'WAITING_FOR_CREDENTIALS',
      'CONNECTING_TWENTY',
      'ACTIVE',
      'PAYMENT_REQUIRED',
      'DEACTIVATING',
      'INACTIVE',
      'REPLACEMENT_REQUIRED',
      'RECONCILIATION_REQUIRED',
    ]);
    expect(Object.values(ManagedEmailWarmupState)).toEqual([
      'NOT_APPLICABLE',
      'CONNECTING',
      'WARMING',
      'MAINTENANCE',
      'CANCEL_AT_PERIOD_END',
      'PAUSED',
      'ACTION_REQUIRED',
      'DELETING',
      'DELETED',
      'RECONCILIATION_REQUIRED',
    ]);
    expect(Object.values(ManagedEmailCampaignEligibility)).toEqual([
      'BLOCKED',
      'NEW_THREADS_BLOCKED',
      'ELIGIBLE',
    ]);
    expect(Object.values(ManagedEmailWarmupMode)).toEqual([
      'PROVIDER_PREWARMED',
      'MYAH_MANAGED',
    ]);
  });

  it('maps immutable domain identity, lifecycle facts, constraints, and recovery indexes', () => {
    const metadata = metadataFor(ManagedEmailDomainEntity);

    expect(metadata.table).toMatchObject({
      name: 'managedEmailDomain',
      schema: 'core',
    });
    expect(
      columnOptions(ManagedEmailDomainEntity, 'workspaceId'),
    ).toMatchObject({
      type: 'uuid',
      update: false,
    });
    for (const propertyName of [
      'domain',
      'normalizedDomain',
      'acquisitionMode',
      'providerType',
      'providerConfigurationKey',
    ]) {
      expect(
        columnOptions(ManagedEmailDomainEntity, propertyName),
      ).toMatchObject({
        type: 'text',
        update: false,
      });
    }
    for (const propertyName of ['providerOrderId', 'providerDomainId']) {
      expect(
        columnOptions(ManagedEmailDomainEntity, propertyName),
      ).toMatchObject({
        nullable: true,
        type: 'text',
      });
      expect(
        columnOptions(ManagedEmailDomainEntity, propertyName)?.update,
      ).not.toBe(false);
    }
    expect(
      columnOptions(ManagedEmailDomainEntity, 'dnsReadinessFacts'),
    ).toMatchObject({
      transformer: expect.objectContaining({
        from: expect.any(Function),
        to: expect.any(Function),
      }),
      type: 'jsonb',
    });
    expect(
      columnOptions(ManagedEmailDomainEntity, 'infrastructureState'),
    ).toMatchObject({
      type: 'text',
    });
    expect(
      columnOptions(ManagedEmailDomainEntity, 'metronomeSubscriptionId'),
    ).toMatchObject({
      nullable: true,
      type: 'uuid',
    });
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['workspaceId', 'normalizedDomain'],
          name: 'UQ_MANAGED_EMAIL_DOMAIN_WORKSPACE_NORMALIZED',
        }),
        expect.objectContaining({
          columns: ['workspaceId', 'id'],
          name: 'UQ_MANAGED_EMAIL_DOMAIN_WORKSPACE_ID',
        }),
      ]),
    );
    expectNamedIndex(
      ManagedEmailDomainEntity,
      'IDX_MANAGED_EMAIL_DOMAIN_PROVIDER_ID_UNIQUE',
      ['providerConfigurationKey', 'providerDomainId'],
      { unique: true, where: '"providerDomainId" IS NOT NULL' },
    );
    expectNamedIndex(
      ManagedEmailDomainEntity,
      'IDX_MANAGED_EMAIL_DOMAIN_RECONCILIATION_DUE',
      ['nextReconciliationAt'],
      { where: '"nextReconciliationAt" IS NOT NULL' },
    );
    expectNamedIndex(
      ManagedEmailDomainEntity,
      'IDX_MANAGED_EMAIL_DOMAIN_PAID_THROUGH',
      ['paidThrough'],
    );
    expectNamedIndex(
      ManagedEmailDomainEntity,
      'IDX_MANAGED_EMAIL_DOMAIN_EXPIRY',
      ['expiresAt'],
    );
    expectNamedCheck(
      ManagedEmailDomainEntity,
      'CHK_MANAGED_EMAIL_DOMAIN_IDENTITIES_NONEMPTY',
      `btrim("domain") <> '' AND btrim("normalizedDomain") <> '' AND btrim("providerType") <> '' AND btrim("providerConfigurationKey") <> ''`,
    );
  });

  it('maps mailbox ownership, nullable activation links, persona, warmup, and capacity policy', () => {
    const metadata = metadataFor(ManagedEmailMailboxEntity);
    const relationByName = (propertyName: string) =>
      metadata.relations.find(
        (relation) => relation.propertyName === propertyName,
      );

    expect(metadata.table).toMatchObject({
      name: 'managedEmailMailbox',
      schema: 'core',
    });
    for (const propertyName of [
      'workspaceId',
      'managedEmailDomainId',
      'address',
      'normalizedAddress',
      'personaCreatedByWorkspaceMemberId',
      'providerType',
      'providerConfigurationKey',
      'warmupMode',
      'readinessPolicyVersion',
    ]) {
      expect(
        columnOptions(ManagedEmailMailboxEntity, propertyName)?.update,
      ).toBe(false);
    }
    expect(
      columnOptions(ManagedEmailMailboxEntity, 'personaVersion'),
    ).toMatchObject({
      default: 1,
      type: 'integer',
    });
    expect(
      columnOptions(ManagedEmailMailboxEntity, 'personaAuditEventId'),
    ).toMatchObject({
      nullable: true,
      type: 'uuid',
    });
    for (const propertyName of ['connectedAccountId', 'messageChannelId']) {
      expect(
        columnOptions(ManagedEmailMailboxEntity, propertyName),
      ).toMatchObject({
        nullable: true,
        type: 'uuid',
      });
      expect(
        relationByName(propertyName.replace(/Id$/, ''))?.options,
      ).toMatchObject({
        nullable: true,
        onDelete: 'SET NULL',
      });
    }
    expect(metadata.joinColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'workspaceId',
          propertyName: 'domain',
          referencedColumnName: 'workspaceId',
        }),
        expect.objectContaining({
          name: 'managedEmailDomainId',
          propertyName: 'domain',
          referencedColumnName: 'id',
        }),
      ]),
    );
    for (const propertyName of ['providerOrderId', 'providerMailboxId']) {
      expect(
        columnOptions(ManagedEmailMailboxEntity, propertyName),
      ).toMatchObject({
        nullable: true,
        type: 'text',
      });
    }
    for (const propertyName of [
      'metronomeMailboxSubscriptionId',
      'metronomeWarmupSubscriptionId',
    ]) {
      expect(
        columnOptions(ManagedEmailMailboxEntity, propertyName),
      ).toMatchObject({
        nullable: true,
        type: 'uuid',
      });
    }
    expect(relationByName('domain')?.options).toMatchObject({
      onDelete: 'CASCADE',
    });
    expect(
      columnOptions(ManagedEmailMailboxEntity, 'healthFacts'),
    ).toMatchObject({
      transformer: expect.objectContaining({
        from: expect.any(Function),
        to: expect.any(Function),
      }),
      type: 'jsonb',
    });
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['workspaceId', 'normalizedAddress'],
          name: 'UQ_MANAGED_EMAIL_MAILBOX_WORKSPACE_NORMALIZED',
        }),
      ]),
    );
    expectNamedIndex(
      ManagedEmailMailboxEntity,
      'IDX_MANAGED_EMAIL_MAILBOX_PROVIDER_ID_UNIQUE',
      ['providerConfigurationKey', 'providerMailboxId'],
      { unique: true, where: '"providerMailboxId" IS NOT NULL' },
    );
    expectNamedIndex(
      ManagedEmailMailboxEntity,
      'IDX_MANAGED_EMAIL_MAILBOX_DOMAIN',
      ['managedEmailDomainId'],
    );
    expectNamedIndex(
      ManagedEmailMailboxEntity,
      'IDX_MANAGED_EMAIL_MAILBOX_RECONCILIATION_DUE',
      ['nextReconciliationAt'],
      { where: '"nextReconciliationAt" IS NOT NULL' },
    );
    expectNamedIndex(
      ManagedEmailMailboxEntity,
      'IDX_MANAGED_EMAIL_MAILBOX_INFRASTRUCTURE_PAID_THROUGH',
      ['infrastructurePaidThrough'],
    );
    expectNamedIndex(
      ManagedEmailMailboxEntity,
      'IDX_MANAGED_EMAIL_MAILBOX_WARMUP_PAID_THROUGH',
      ['warmupPaidThrough'],
    );
    expectNamedIndex(
      ManagedEmailMailboxEntity,
      'IDX_MANAGED_EMAIL_MAILBOX_LAST_HEALTH_EVALUATED',
      ['lastHealthEvaluatedAt'],
    );
    expectNamedCheck(
      ManagedEmailMailboxEntity,
      'CHK_MANAGED_EMAIL_MAILBOX_PERSONA_VERSION',
      '"personaVersion" >= 1',
    );
    expectNamedCheck(
      ManagedEmailMailboxEntity,
      'CHK_MANAGED_EMAIL_MAILBOX_CAPACITIES',
      '"policySafeDailyCapacity" >= 0 AND ("adminDailyCap" IS NULL OR ("adminDailyCap" >= 0 AND "adminDailyCap" <= "policySafeDailyCapacity"))',
    );
    expectNamedCheck(
      ManagedEmailMailboxEntity,
      'CHK_MANAGED_EMAIL_MAILBOX_IDENTITIES_NONEMPTY',
      `btrim("address") <> '' AND btrim("normalizedAddress") <> '' AND btrim("providerType") <> '' AND btrim("providerConfigurationKey") <> '' AND btrim("readinessPolicyVersion") <> ''`,
    );
  });

  it('maps acquisition as bounded payment/provider correlation without AI billing fields', () => {
    const metadata = metadataFor(ManagedEmailAcquisitionOperationEntity);
    const propertyNames = metadata.columns.map((column) => column.propertyName);

    expect(metadata.table).toMatchObject({
      name: 'managedEmailAcquisitionOperation',
      schema: 'core',
    });
    for (const propertyName of [
      'workspaceId',
      'idempotencyKey',
      'acquisitionMode',
      'authorizedActorWorkspaceMemberId',
      'proposalHash',
      'quoteHash',
      'resourceSnapshot',
      'catalogVersion',
      'metronomeRateCardId',
      'metronomeRateCardAlias',
      'expectedLineItems',
      'expectedAmountCents',
      'currency',
      'servicePeriodStart',
      'servicePeriodEnd',
    ]) {
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName)
          ?.update,
      ).toBe(false);
    }
    expect(
      columnOptions(
        ManagedEmailAcquisitionOperationEntity,
        'expectedAmountCents',
      ),
    ).toMatchObject({ type: 'bigint', update: false });
    expect(
      columnOptions(
        ManagedEmailAcquisitionOperationEntity,
        'metronomeRateCardId',
      ),
    ).toMatchObject({ type: 'uuid', update: false });
    for (const propertyName of [
      'metronomeCustomerId',
      'metronomeContractId',
      'metronomeInvoiceId',
    ]) {
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName),
      ).toMatchObject({ nullable: true, type: 'uuid' });
    }
    for (const propertyName of [
      'metronomeEditIds',
      'metronomeSubscriptionIds',
    ]) {
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName),
      ).toMatchObject({ array: true, nullable: true, type: 'uuid' });
    }
    for (const propertyName of ['externalInvoiceId', 'externalPaymentId']) {
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName),
      ).toMatchObject({ nullable: true, type: 'text' });
    }
    for (const propertyName of [
      'metronomeCustomerId',
      'metronomeContractId',
      'metronomeEditIds',
      'metronomeSubscriptionIds',
      'metronomeInvoiceId',
      'externalInvoiceId',
      'externalPaymentId',
      'paymentStatus',
      'correlatedSubscriptionLines',
      'providerIntentHash',
      'providerReceipt',
      'providerOutcome',
    ]) {
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName)
          ?.nullable,
      ).toBe(true);
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName)
          ?.update,
      ).not.toBe(false);
    }
    for (const propertyName of [
      'resourceSnapshot',
      'expectedLineItems',
      'correlatedSubscriptionLines',
      'providerReceipt',
    ]) {
      expect(
        columnOptions(ManagedEmailAcquisitionOperationEntity, propertyName)
          ?.transformer,
      ).toMatchObject({
        from: expect.any(Function),
        to: expect.any(Function),
      });
    }
    expect(
      columnOptions(ManagedEmailAcquisitionOperationEntity, 'state'),
    ).toMatchObject({
      type: 'text',
    });
    expect(
      columnOptions(
        ManagedEmailAcquisitionOperationEntity,
        'reconciliationAttemptCount',
      ),
    ).toMatchObject({
      default: 0,
      type: 'integer',
    });
    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['workspaceId', 'idempotencyKey'],
          name: 'UQ_MANAGED_EMAIL_ACQUISITION_WORKSPACE_IDEMPOTENCY',
        }),
      ]),
    );
    expectNamedIndex(
      ManagedEmailAcquisitionOperationEntity,
      'IDX_MANAGED_EMAIL_ACQUISITION_RECONCILIATION_DUE',
      ['nextReconciliationAt'],
      { where: '"nextReconciliationAt" IS NOT NULL' },
    );
    expectNamedCheck(
      ManagedEmailAcquisitionOperationEntity,
      'CHK_MANAGED_EMAIL_ACQUISITION_REQUIRED_TEXT',
      `btrim("idempotencyKey") <> '' AND btrim("proposalHash") <> '' AND btrim("quoteHash") <> '' AND btrim("catalogVersion") <> '' AND btrim("metronomeRateCardAlias") <> '' AND btrim("currency") <> '' AND btrim("state") <> ''`,
    );
    expectNamedCheck(
      ManagedEmailAcquisitionOperationEntity,
      'CHK_MANAGED_EMAIL_ACQUISITION_AMOUNT_ATTEMPTS',
      '"expectedAmountCents" > 0 AND "reconciliationAttemptCount" >= 0',
    );
    expectNamedCheck(
      ManagedEmailAcquisitionOperationEntity,
      'CHK_MANAGED_EMAIL_ACQUISITION_SERVICE_PERIOD',
      '"servicePeriodEnd" > "servicePeriodStart"',
    );
    expect(propertyNames.join(' ')).not.toMatch(
      /reservation|credit|usage|completion|delivery/i,
    );
    expect(propertyNames.join(' ')).not.toMatch(
      /password|credential|secret|token|hostname|rawProvider|providerError/i,
    );
  });

  it('contains no credential or provider-payload columns in any managed email entity', () => {
    const allColumns = [
      ManagedEmailDomainEntity,
      ManagedEmailMailboxEntity,
      ManagedEmailAcquisitionOperationEntity,
    ].flatMap((target) =>
      metadataFor(target).columns.map((column) => column.propertyName),
    );

    expect(allColumns.join(' ')).not.toMatch(
      /password|credential|secret|token|hostname|rawProvider|providerError/i,
    );
  });
});
