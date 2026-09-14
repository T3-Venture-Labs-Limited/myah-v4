import { getMetadataArgsStorage } from 'typeorm';

import { CampaignTestPreparationProofEntity } from 'src/engine/core-modules/campaign-test-authority/entities/campaign-test-preparation-proof.entity';

const expectedColumns = [
  'testPreparationProofId',
  'confirmationId',
  'attemptId',
  'workspaceId',
  'campaignId',
  'campaignCreatorId',
  'workflowVersionId',
  'messageId',
  'requesterUserId',
  'requesterUserWorkspaceId',
  'normalizedRecipient',
  'connectedAccountId',
  'messageChannelId',
  'provider',
  'normalizedSenderHandle',
  'senderPoolFingerprint',
  'campaignCapacityTimeZone',
  'selectionConstraintKind',
  'priorAcceptedEvidenceId',
  'threadScopeKind',
  'plannedPriorMessageId',
  'threadEnrollmentId',
  'threadOccurrenceId',
  'renderDigest',
  'previewDigest',
  'testTransportDigest',
  'confirmationIssuedAt',
  'reservationEligibleUntil',
  'createdAt',
  'testSubmissionCapabilityId',
  'finalEvidenceDigest',
];

const metadata = () => {
  const storage = getMetadataArgsStorage();

  return {
    checks: storage.checks.filter(
      ({ target }) => target === CampaignTestPreparationProofEntity,
    ),
    columns: storage.columns.filter(
      ({ target }) => target === CampaignTestPreparationProofEntity,
    ),
    indices: storage.indices.filter(
      ({ target }) => target === CampaignTestPreparationProofEntity,
    ),
    relations: storage.relations.filter(
      ({ target }) => target === CampaignTestPreparationProofEntity,
    ),
    table: storage.tables.find(
      ({ target }) => target === CampaignTestPreparationProofEntity,
    ),
    uniques: storage.uniques.filter(
      ({ target }) => target === CampaignTestPreparationProofEntity,
    ),
  };
};

describe('CampaignTestPreparationProofEntity', () => {
  it('maps the exact core table and immutable proof columns without relations or updatedAt', () => {
    const entityMetadata = metadata();

    expect(entityMetadata.table).toMatchObject({
      name: 'campaignTestPreparationProof',
      schema: 'core',
    });
    expect(
      entityMetadata.columns.map(({ propertyName }) => propertyName),
    ).toEqual(expectedColumns);
    expect(entityMetadata.relations).toHaveLength(0);
    expect(
      entityMetadata.columns.some(({ propertyName }) => propertyName === 'id'),
    ).toBe(false);
    expect(
      entityMetadata.columns.some(
        ({ propertyName }) => propertyName === 'updatedAt',
      ),
    ).toBe(false);

    const primary = entityMetadata.columns.find(
      ({ propertyName }) => propertyName === 'testPreparationProofId',
    );

    expect(primary?.options).toMatchObject({ primary: true, type: 'uuid' });
    expect(primary?.options.primaryKeyConstraintName).toBe(
      'PK_CAMPAIGN_TEST_PREPARATION_PROOF',
    );
  });

  it('maps exact column types, nullability, and immutable update metadata', () => {
    const columns = metadata().columns;
    const optionsFor = (propertyName: string) =>
      columns.find((column) => column.propertyName === propertyName)?.options;

    for (const propertyName of expectedColumns) {
      if (
        propertyName === 'createdAt' ||
        propertyName === 'testSubmissionCapabilityId' ||
        propertyName === 'finalEvidenceDigest'
      ) {
        continue;
      }
      expect(optionsFor(propertyName)?.update).toBe(false);
    }
    expect(optionsFor('createdAt')).toMatchObject({
      type: 'timestamptz',
      update: false,
    });
    for (const propertyName of [
      'priorAcceptedEvidenceId',
      'plannedPriorMessageId',
      'threadEnrollmentId',
      'threadOccurrenceId',
      'testSubmissionCapabilityId',
      'finalEvidenceDigest',
    ]) {
      expect(optionsFor(propertyName)?.nullable).toBe(true);
    }
    expect(optionsFor('testSubmissionCapabilityId')?.update).toBe(true);
    expect(optionsFor('finalEvidenceDigest')?.update).toBe(true);
    expect(optionsFor('confirmationIssuedAt')?.type).toBe('timestamptz');
    expect(optionsFor('reservationEligibleUntil')?.type).toBe('timestamptz');
  });

  it('declares the exact uniques and partial submission-capability index', () => {
    const entityMetadata = metadata();

    expect(entityMetadata.uniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['confirmationId'],
          name: 'UQ_CTP_CONFIRMATION',
        }),
        expect.objectContaining({
          columns: ['attemptId'],
          name: 'UQ_CTP_ATTEMPT',
        }),
        expect.objectContaining({
          columns: ['workspaceId', 'attemptId', 'testPreparationProofId'],
          name: 'UQ_CTP_SCOPE_ATTEMPT_PROOF',
        }),
      ]),
    );
    expect(entityMetadata.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['testSubmissionCapabilityId'],
          name: 'UQ_CTP_SUBMISSION_CAPABILITY',
          unique: true,
          where: '"testSubmissionCapabilityId" IS NOT NULL',
        }),
      ]),
    );
  });

  it('declares exact selection and thread shape checks', () => {
    const checks = metadata().checks;
    const expression = (name: string) =>
      checks.find((check) => check.name === name)?.expression ?? '';

    expect(expression('CHK_CTP_SELECTION_SHAPE')).toContain(
      `"selectionConstraintKind" = 'ROTATE'`,
    );
    expect(expression('CHK_CTP_SELECTION_SHAPE')).toContain(
      `"selectionConstraintKind" = 'PINNED_REPLY'`,
    );
    expect(expression('CHK_CTP_SELECTION_SHAPE')).toContain(
      `"threadScopeKind" IN ('NEW_THREAD', 'PLANNED_PRIOR_STEP')`,
    );
    expect(expression('CHK_CTP_THREAD_SCOPE_SHAPE')).toContain(
      `"threadScopeKind" = 'NEW_THREAD'`,
    );
    expect(expression('CHK_CTP_THREAD_SCOPE_SHAPE')).toContain(
      `"threadScopeKind" = 'PLANNED_PRIOR_STEP'`,
    );
    expect(expression('CHK_CTP_THREAD_SCOPE_SHAPE')).toContain(
      `"threadScopeKind" = 'EXISTING_EVIDENCE'`,
    );
  });

  it('declares finalization, digest, expiry, and nonblank text checks', () => {
    const checks = metadata().checks;
    const expression = (name: string) =>
      checks.find((check) => check.name === name)?.expression ?? '';

    expect(checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'CHK_CTP_SELECTION_SHAPE',
        'CHK_CTP_THREAD_SCOPE_SHAPE',
        'CHK_CTP_FINALIZATION_PAIR',
        'CHK_CTP_RESERVATION_EXPIRY',
        'CHK_CTP_DIGEST_SHAPES',
        'CHK_CTP_TEXT_SHAPES',
      ]),
    );
    expect(expression('CHK_CTP_FINALIZATION_PAIR')).toContain(
      '"testSubmissionCapabilityId" IS NULL AND "finalEvidenceDigest" IS NULL',
    );
    expect(expression('CHK_CTP_FINALIZATION_PAIR')).toContain(
      '"testSubmissionCapabilityId" IS NOT NULL AND "finalEvidenceDigest" IS NOT NULL',
    );
    expect(expression('CHK_CTP_RESERVATION_EXPIRY')).toBe(
      '"reservationEligibleUntil" > "confirmationIssuedAt"',
    );
    expect(expression('CHK_CTP_DIGEST_SHAPES')).toContain("~ '^[0-9a-f]{64}$'");
    for (const propertyName of [
      'provider',
      'normalizedSenderHandle',
      'normalizedRecipient',
      'senderPoolFingerprint',
      'campaignCapacityTimeZone',
    ]) {
      expect(expression('CHK_CTP_TEXT_SHAPES')).toContain(
        `btrim("${propertyName}") <> ''`,
      );
    }
  });
});
