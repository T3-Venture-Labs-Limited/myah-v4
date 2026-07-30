import { getMetadataArgsStorage } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';

describe('ManagedProviderOperationEntity', () => {
  it('maps the operation journal with lossless amounts and explicit lifecycle fields', () => {
    const metadata = getMetadataArgsStorage();
    const table = metadata.tables.find(
      (candidate) => candidate.target === ManagedProviderOperationEntity,
    );
    const columns = metadata.columns.filter(
      (candidate) => candidate.target === ManagedProviderOperationEntity,
    );

    expect(
      columns.find((column) => column.propertyName === 'workspaceId')?.options,
    ).toMatchObject({ type: 'uuid' });
    expect(
      metadata.relations.some(
        (candidate) =>
          candidate.target === ManagedProviderOperationEntity &&
          candidate.propertyName === 'workspace',
      ),
    ).toBe(false);

    expect(table).toMatchObject({
      name: 'managedProviderOperation',
      schema: 'core',
    });
    const reservedAmountColumn = columns.find(
      (column) => column.propertyName === 'reservedAmountCents',
    );

    expect(reservedAmountColumn?.options.type).toBe('bigint');
    expect(reservedAmountColumn?.options.nullable ?? false).toBe(false);
    expect(
      columns.find(
        (column) => column.propertyName === 'quotedActualAmountCents',
      )?.options,
    ).toMatchObject({ nullable: true, type: 'bigint' });
    expect(
      columns.find((column) => column.propertyName === 'providerCostMicrousd')
        ?.options,
    ).toMatchObject({ nullable: true, type: 'bigint' });
    expect(
      columns.find((column) => column.propertyName === 'actualUsageProperties')
        ?.options,
    ).toMatchObject({ nullable: true, type: 'jsonb' });
    const expectedProductIdsColumn = columns.find(
      (column) => column.propertyName === 'expectedProductIds',
    );

    expect(expectedProductIdsColumn?.options.type).toBe('jsonb');
    expect(expectedProductIdsColumn?.options.nullable ?? false).toBe(false);
    expect(
      columns.find((column) => column.propertyName === 'state')?.options,
    ).toMatchObject({
      default: ManagedProviderOperationState.RESERVED,
      type: 'text',
    });
    expect(Object.values(ManagedProviderOperationState)).toEqual([
      'RESERVED',
      'USAGE_PENDING',
      'USAGE_ACCEPTED',
      'USAGE_SETTLED',
      'RELEASED',
      'RECONCILIATION_REQUIRED',
    ]);
    expect(
      columns.find((column) => column.propertyName === 'providerExecutionId')
        ?.options,
    ).toMatchObject({ nullable: true, type: 'text' });
    expect(
      columns.find((column) => column.propertyName === 'nextDeliveryAttemptAt')
        ?.options,
    ).toMatchObject({ nullable: true, type: 'timestamptz' });
    expect(
      columns.find((column) => column.propertyName === 'metronomeAcceptedAt')
        ?.options,
    ).toMatchObject({ nullable: true, type: 'timestamptz' });
    expect(
      columns.find((column) => column.propertyName === 'settledAt')?.options,
    ).toMatchObject({ nullable: true, type: 'timestamptz' });
    expect(
      columns.find((column) => column.propertyName === 'releasedAt')?.options,
    ).toMatchObject({ nullable: true, type: 'timestamptz' });
  });

  it('declares the recovery indexes against the planned lifecycle states', () => {
    const indexes = getMetadataArgsStorage().indices.filter(
      (candidate) => candidate.target === ManagedProviderOperationEntity,
    );

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['nextDeliveryAttemptAt'],
          name: 'IDX_MANAGED_PROVIDER_OPERATION_DELIVERY_DUE',
          where: '"state" = \'USAGE_PENDING\'',
        }),
        expect.objectContaining({
          columns: ['createdAt'],
          name: 'IDX_MANAGED_PROVIDER_OPERATION_STALE_RESERVATION',
          where: "\"state\" IN ('RESERVED', 'RECONCILIATION_REQUIRED')",
        }),
      ]),
    );
  });

  it('maps the nullable external customer ID on the workspace installation', () => {
    const metadata = getMetadataArgsStorage();
    const customerIdColumn = metadata.columns.find(
      (candidate) =>
        candidate.target === MyahWorkspaceInstallationEntity &&
        candidate.propertyName === 'metronomeCustomerId',
    );
    const customerIdIndex = metadata.indices.find(
      (candidate) =>
        candidate.target === MyahWorkspaceInstallationEntity &&
        candidate.name ===
          'IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE',
    );

    expect(customerIdColumn).toBeDefined();
    expect(customerIdIndex).toBeDefined();
    expect(customerIdColumn?.options).toMatchObject({
      nullable: true,
      type: 'uuid',
    });

    expect(customerIdIndex).toMatchObject({
      columns: ['metronomeCustomerId'],
      unique: true,
      where: '"metronomeCustomerId" IS NOT NULL',
    });
  });
});
