import { getMetadataArgsStorage } from 'typeorm';

import {
  MANAGED_PROVIDER_FUNDING_ACTION_STATES,
  ManagedProviderFundingActionEntity,
} from '../entities/managed-provider-funding-action.entity';

describe('ManagedProviderFundingActionEntity', () => {
  it('persists immutable authorization facts and mutable remote lifecycle state', () => {
    const metadata = getMetadataArgsStorage();
    const table = metadata.tables.find(
      (candidate) => candidate.target === ManagedProviderFundingActionEntity,
    );
    const columns = metadata.columns.filter(
      (candidate) => candidate.target === ManagedProviderFundingActionEntity,
    );

    expect(table).toMatchObject({
      name: 'managedProviderFundingAction',
      schema: 'core',
    });
    for (const propertyName of [
      'workspaceId',
      'operatorIdentity',
      'permissionUsed',
      'actionType',
      'idempotencyKey',
      'externalReference',
      'metronomeUniquenessKey',
      'amountCents',
      'currency',
      'reason',
      'applicability',
      'applicableProductIds',
      'creditProductId',
      'paymentEvidence',
      'correctedOperationId',
    ]) {
      expect(
        columns.find((column) => column.propertyName === propertyName)?.options,
      ).toMatchObject({ update: false });
    }
    expect(
      columns.find((column) => column.propertyName === 'amountCents')?.options,
    ).toMatchObject({ type: 'bigint', update: false });
    expect(
      columns.find((column) => column.propertyName === 'state')?.options,
    ).toMatchObject({ default: 'PENDING', type: 'text' });

    expect(metadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'UQ_MANAGED_PROVIDER_FUNDING_ACTION_IDEMPOTENCY',
          columns: ['workspaceId', 'idempotencyKey'],
        }),
        expect.objectContaining({
          name: 'UQ_MANAGED_PROVIDER_FUNDING_ACTION_EXTERNAL_REFERENCE',
          columns: ['externalReference'],
        }),
        expect.objectContaining({
          name: 'UQ_MANAGED_PROVIDER_FUNDING_ACTION_METRONOME_KEY',
          columns: ['metronomeUniquenessKey'],
        }),
      ]),
    );
  });

  it('declares the exact paid funding lifecycle and durable customer-payment facts', () => {
    const metadata = getMetadataArgsStorage();
    const columns = metadata.columns.filter(
      (candidate) => candidate.target === ManagedProviderFundingActionEntity,
    );
    const column = (propertyName: string) =>
      columns.find((candidate) => candidate.propertyName === propertyName)
        ?.options;

    expect(MANAGED_PROVIDER_FUNDING_ACTION_STATES).toEqual([
      'PENDING',
      'METRONOME_EDIT_RECORDED',
      'PAYMENT_PENDING',
      'PAYMENT_ACTION_REQUIRED',
      'RECONCILIATION_REQUIRED',
      'SUCCEEDED',
      'FAILED_DEFINITIVE',
      'REFUND_INTENT_RECORDED',
      'REFUND_RECONCILIATION_REQUIRED',
      'REFUNDED',
    ]);
    for (const propertyName of [
      'metronomeCustomerId',
      'metronomeContractId',
      'metronomeInvoiceId',
      'stripeBillingConfigurationId',
      'stripeDeliveryMethodId',
      'stripeCustomerId',
      'stripeInvoiceId',
      'stripePaymentIntentId',
      'stripeCreditNoteId',
      'stripeRefundId',
    ]) {
      expect(column(propertyName)).toMatchObject({
        nullable: true,
        type: 'text',
      });
    }
    for (const propertyName of [
      'prepaidPrincipalCents',
      'taxCents',
      'collectedTotalCents',
    ]) {
      expect(column(propertyName)).toMatchObject({
        nullable: true,
        type: 'bigint',
      });
    }
    for (const propertyName of ['paymentReceipt', 'refundReceipt']) {
      expect(column(propertyName)).toMatchObject({
        nullable: true,
        type: 'jsonb',
      });
    }
    expect(column('expiresAt')).toMatchObject({
      nullable: true,
      type: 'timestamptz',
    });
    expect(column('nextReconciliationAt')).toMatchObject({
      nullable: true,
      type: 'timestamptz',
    });
    expect(column('reconciliationClaimedAt')).toMatchObject({
      nullable: true,
      type: 'timestamptz',
    });
    expect(column('reconciliationAttemptCount')).toMatchObject({
      default: 0,
      type: 'integer',
    });
    expect(metadata.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['state', 'nextReconciliationAt'],
          name: 'IDX_MANAGED_PROVIDER_FUNDING_ACTION_RECONCILIATION_DUE',
        }),
      ]),
    );
  });
});
