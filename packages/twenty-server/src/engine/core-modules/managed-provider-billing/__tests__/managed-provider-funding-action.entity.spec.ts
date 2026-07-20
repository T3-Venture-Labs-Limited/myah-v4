import { getMetadataArgsStorage } from 'typeorm';

import { ManagedProviderFundingActionEntity } from '../entities/managed-provider-funding-action.entity';

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
      'expiresAt',
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
});
