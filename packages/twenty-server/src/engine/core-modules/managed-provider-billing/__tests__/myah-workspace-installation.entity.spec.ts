import { getMetadataArgsStorage } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';

describe('MyahWorkspaceInstallationEntity Stripe Customer identity', () => {
  it('stores Stripe Customer ID as nullable and uniquely indexed across workspaces', () => {
    const column = getMetadataArgsStorage().columns.find(
      ({ target, propertyName }) =>
        target === MyahWorkspaceInstallationEntity &&
        propertyName === 'stripeCustomerId',
    );
    const index = getMetadataArgsStorage().indices.find(
      ({ target, name }) =>
        target === MyahWorkspaceInstallationEntity &&
        name === 'IDX_MYAH_WORKSPACE_INSTALLATION_STRIPE_CUSTOMER_ID_UNIQUE',
    );

    expect(column?.options).toEqual(
      expect.objectContaining({ nullable: true }),
    );
    expect(index).toEqual(
      expect.objectContaining({
        columns: ['stripeCustomerId'],
        unique: true,
        where: '"stripeCustomerId" IS NOT NULL',
      }),
    );
  });
});
