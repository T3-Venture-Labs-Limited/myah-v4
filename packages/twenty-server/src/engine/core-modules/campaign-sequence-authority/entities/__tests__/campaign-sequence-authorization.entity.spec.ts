import { getMetadataArgsStorage } from 'typeorm';

import {
  CampaignSequenceAuthorizationEntity,
  CampaignSequenceAuthorizationRevocationReason,
  CampaignSequenceAuthorizationState,
} from 'src/engine/core-modules/campaign-sequence-authority/entities/campaign-sequence-authorization.entity';

describe('CampaignSequenceAuthorizationEntity', () => {
  it('maps the frozen core authority table and exact immutable/query columns', () => {
    const metadata = getMetadataArgsStorage();
    const table = metadata.tables.find(
      (candidate) => candidate.target === CampaignSequenceAuthorizationEntity,
    );
    const columns = metadata.columns.filter(
      (candidate) => candidate.target === CampaignSequenceAuthorizationEntity,
    );
    const column = (propertyName: string) =>
      columns.find((candidate) => candidate.propertyName === propertyName);

    expect(table).toMatchObject({
      name: 'campaignSequenceAuthorization',
      schema: 'core',
    });
    expect(column('authorizationId')).toMatchObject({
      mode: 'regular',
      options: expect.objectContaining({
        primary: true,
        primaryKeyConstraintName: 'PK_CAMPAIGN_SEQUENCE_AUTHORIZATION',
        type: 'uuid',
      }),
    });
    expect(column('campaignExecutionId')?.options).toMatchObject({
      type: 'uuid',
    });
    expect(column('generation')?.options).toMatchObject({ type: 'integer' });
    expect(column('startIdempotencyKey')?.options).toMatchObject({
      type: 'uuid',
    });
    expect(column('preparedFingerprint')?.options).toMatchObject({
      length: 64,
      type: 'varchar',
    });
    expect(column('binding')?.options).toMatchObject({ type: 'jsonb' });
    expect(column('state')?.options).toMatchObject({
      enum: CampaignSequenceAuthorizationState,
      enumName: 'campaignSequenceAuthorization_state_enum',
      type: 'enum',
    });
    expect(column('revocationReason')?.options).toMatchObject({
      enum: CampaignSequenceAuthorizationRevocationReason,
      enumName: 'campaignSequenceAuthorization_revocationReason_enum',
      nullable: true,
      type: 'enum',
    });
  });

  it('declares every frozen unique target, partial active index, and CHECK', () => {
    const metadata = getMetadataArgsStorage();
    const uniques = metadata.uniques.filter(
      (candidate) => candidate.target === CampaignSequenceAuthorizationEntity,
    );
    const indexes = metadata.indices.filter(
      (candidate) => candidate.target === CampaignSequenceAuthorizationEntity,
    );
    const checks = metadata.checks.filter(
      (candidate) => candidate.target === CampaignSequenceAuthorizationEntity,
    );

    expect(uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'UQ_CSA_SCOPE_AUTHORIZATION',
          columns: ['workspaceId', 'campaignId', 'authorizationId'],
        }),
        expect.objectContaining({
          name: 'UQ_CSA_SCOPE_AUTH_VERSION',
          columns: [
            'workspaceId',
            'campaignId',
            'authorizationId',
            'workflowVersionId',
          ],
        }),
        expect.objectContaining({
          name: 'UQ_CSA_SCOPE_START_KEY',
          columns: ['workspaceId', 'campaignId', 'startIdempotencyKey'],
        }),
        expect.objectContaining({
          name: 'UQ_CSA_SCOPE_GENERATION',
          columns: ['workspaceId', 'campaignId', 'generation'],
        }),
      ]),
    );
    expect(indexes).toContainEqual(
      expect.objectContaining({
        name: 'UQ_CSA_ONE_ACTIVE_SCOPE',
        columns: ['workspaceId', 'campaignId'],
        unique: true,
        where: `"state" = 'ACTIVE'`,
      }),
    );
    expect(checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'CHK_CSA_GENERATION_POSITIVE',
        'CHK_CSA_PREPARED_FINGERPRINT',
        'CHK_CSA_STATE',
        'CHK_CSA_REVOCATION_SHAPE',
      ]),
    );
    expect(metadata.relations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: CampaignSequenceAuthorizationEntity,
        }),
      ]),
    );
  });
});
