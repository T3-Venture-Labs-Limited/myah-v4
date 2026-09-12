import { getMetadataArgsStorage } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { CampaignActivationEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-activation.entity';
import { CampaignEnrollmentEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-enrollment.entity';
import { CampaignExecutionEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-execution.entity';
import { CampaignOccurrenceEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-occurrence.entity';
import { CampaignOutboundRenderEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-outbound-render.entity';
import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';

const entities = [
  CampaignExecutionEntity,
  CampaignActivationEntity,
  CampaignEnrollmentEntity,
  CampaignOccurrenceEntity,
] as const;

describe('campaign execution core entity metadata', () => {
  it('discovers each canonical table exactly once with its frozen primary key', () => {
    const metadata = getMetadataArgsStorage();
    const expected = [
      [
        CampaignExecutionEntity,
        'campaignExecution',
        'PK_CAMPAIGN_EXECUTION',
        [
          'id',
          'workspaceId',
          'campaignId',
          'timeZone',
          'startLocalTime',
          'endLocalTime',
          'campaignCapacityTimeZone',
          'createdAt',
          'updatedAt',
        ],
      ],
      [
        CampaignActivationEntity,
        'campaignActivation',
        'PK_CAMPAIGN_ACTIVATION',
        [
          'id',
          'workspaceId',
          'campaignId',
          'campaignExecutionId',
          'authorizationId',
          'authorizationGeneration',
          'workflowVersionId',
          'activatedAt',
          'createdEnrollmentCount',
          'createdOccurrenceCount',
        ],
      ],
      [
        CampaignEnrollmentEntity,
        'campaignEnrollment',
        'PK_CAMPAIGN_ENROLLMENT',
        [
          'id',
          'workspaceId',
          'campaignId',
          'campaignExecutionId',
          'authorizationId',
          'authorizationGeneration',
          'campaignCreatorId',
          'creatorId',
          'authoredMessageCount',
          'nextAuthoredMessageIndex',
          'state',
          'holdReason',
          'terminalReason',
          'terminalAt',
          'enrolledAt',
          'createdAt',
          'updatedAt',
        ],
      ],
      [
        CampaignOccurrenceEntity,
        'campaignOccurrence',
        'PK_CAMPAIGN_OCCURRENCE',
        [
          'id',
          'workspaceId',
          'campaignId',
          'enrollmentId',
          'workflowVersionId',
          'messageId',
          'authoredMessageIndex',
          'state',
          'dueAt',
          'holdReason',
          'terminalReason',
          'terminalAt',
          'createdAt',
          'updatedAt',
        ],
      ],
    ] as const;

    for (const [entity, tableName, primaryName, columnNames] of expected) {
      expect(
        metadata.tables.filter((candidate) => candidate.target === entity),
      ).toEqual([expect.objectContaining({ name: tableName, schema: 'core' })]);
      const columns = metadata.columns.filter(
        (candidate) => candidate.target === entity,
      );

      expect(columns.map(({ propertyName }) => propertyName).sort()).toEqual(
        [...columnNames].sort(),
      );
      expect(
        columns.find(({ propertyName }) => propertyName === 'id')?.options,
      ).toEqual(
        expect.objectContaining({
          primary: true,
          primaryKeyConstraintName: primaryName,
          type: 'uuid',
        }),
      );
    }
  });

  it('declares the exact unique/check and typed reason contract', () => {
    const metadata = getMetadataArgsStorage();
    const uniqueNames = metadata.uniques
      .filter((candidate) => entities.includes(candidate.target as never))
      .map(({ name }) => name);
    const checks = metadata.checks.filter((candidate) =>
      entities.includes(candidate.target as never),
    );

    expect(uniqueNames.sort()).toEqual(
      [
        'UQ_CE_WORKSPACE_CAMPAIGN',
        'UQ_CE_SCOPE_ID',
        'UQ_CA_SCOPE_AUTHORIZATION',
        'UQ_CA_SCOPE_AUTH_VERSION',
        'UQ_CEN_SCOPE_AUTH_CREATOR',
        'UQ_CEN_SCOPE_AUTH_ID',
        'UQ_CEN_SCOPE_ID',
        'UQ_CO_ENROLLMENT_VERSION_MESSAGE',
        'UQ_CO_ENROLLMENT_AUTHORED_INDEX',
        'UQ_CO_ATTEMPT_BINDING',
      ].sort(),
    );
    expect(checks.map(({ name }) => name).sort()).toEqual(
      [
        'CHK_CE_WINDOW_ORDER',
        'CHK_CE_TIME_ZONE_NONEMPTY',
        'CHK_CE_CAPACITY_TIME_ZONE_NONEMPTY',
        'CHK_CA_AUTHORIZATION_GENERATION_POSITIVE',
        'CHK_CA_COUNTS_NONNEGATIVE',
        'CHK_CEN_AUTHORIZATION_GENERATION_POSITIVE',
        'CHK_CEN_AUTHORED_MESSAGE_COUNT_POSITIVE',
        'CHK_CEN_AUTHORED_CURSOR_RANGE',
        'CHK_CEN_STATE',
        'CHK_CEN_TERMINAL_SHAPE',
        'CHK_CO_AUTHORED_INDEX_NONNEGATIVE',
        'CHK_CO_STATE',
        'CHK_CO_TERMINAL_SHAPE',
      ].sort(),
    );
    const reasonContract = checks
      .map(({ expression }) => expression)
      .join('\n');
    expect(reasonContract).toContain('NO_USABLE_AUTHORED_MESSAGE');
    expect(reasonContract).toContain('WORKSPACE_NOT_ACTIVE');
    expect(reasonContract).toContain('PROVIDER_ACCEPTED');
  });

  it('uses immediate non-cascading composite foreign keys including proof-first test evidence', () => {
    const metadata = getMetadataArgsStorage();
    const foreignKeys = metadata.foreignKeys.filter((candidate) =>
      [
        ...entities,
        OutboundEmailAttemptEntity,
        CampaignOutboundRenderEntity,
      ].includes(candidate.target as never),
    );
    const byName = (name: string) =>
      foreignKeys.find((candidate) => candidate.name === name);

    const expectedForeignKeys = {
      FK_CA_EXECUTION_SCOPE: [
        ['workspaceId', 'campaignId', 'campaignExecutionId'],
        ['workspaceId', 'campaignId', 'id'],
      ],
      FK_CA_AUTHORIZATION_SCOPE: [
        ['workspaceId', 'campaignId', 'authorizationId', 'workflowVersionId'],
        ['workspaceId', 'campaignId', 'authorizationId', 'workflowVersionId'],
      ],
      FK_CEN_EXECUTION_SCOPE: [
        ['workspaceId', 'campaignId', 'campaignExecutionId'],
        ['workspaceId', 'campaignId', 'id'],
      ],
      FK_CEN_AUTHORIZATION_SCOPE: [
        ['workspaceId', 'campaignId', 'authorizationId'],
        ['workspaceId', 'campaignId', 'authorizationId'],
      ],
      FK_CO_ENROLLMENT_SCOPE: [
        ['workspaceId', 'campaignId', 'enrollmentId'],
        ['workspaceId', 'campaignId', 'id'],
      ],
      FK_OEA_OCCURRENCE_BINDING: [
        [
          'workspaceId',
          'campaignId',
          'enrollmentId',
          'occurrenceId',
          'workflowVersionId',
          'messageId',
        ],
        [
          'workspaceId',
          'campaignId',
          'enrollmentId',
          'id',
          'workflowVersionId',
          'messageId',
        ],
      ],
      FK_OEA_ACTIVATION_BINDING: [
        ['workspaceId', 'campaignId', 'authorizationId', 'workflowVersionId'],
        ['workspaceId', 'campaignId', 'authorizationId', 'workflowVersionId'],
      ],
      FK_OEA_ENROLLMENT_AUTHORIZATION_SCOPE: [
        ['workspaceId', 'campaignId', 'authorizationId', 'enrollmentId'],
        ['workspaceId', 'campaignId', 'authorizationId', 'id'],
      ],
      FK_COR_EXACT_ATTEMPT: [
        [
          'workspaceId',
          'campaignId',
          'enrollmentId',
          'occurrenceId',
          'authorizationId',
          'workflowVersionId',
          'messageId',
          'attemptId',
          'renderDigest',
        ],
        [
          'workspaceId',
          'campaignId',
          'enrollmentId',
          'occurrenceId',
          'authorizationId',
          'workflowVersionId',
          'messageId',
          'attemptId',
          'renderDigest',
        ],
      ],
      FK_OEA_TEST_PREPARATION_PROOF: [
        ['workspaceId', 'attemptId', 'testPreparationProofId'],
        ['workspaceId', 'attemptId', 'testPreparationProofId'],
      ],
    } as const;

    expect(foreignKeys.map(({ name }) => name).sort()).toEqual(
      Object.keys(expectedForeignKeys).sort(),
    );
    for (const [name, [columnNames, referencedColumnNames]] of Object.entries(
      expectedForeignKeys,
    )) {
      expect(byName(name)).toMatchObject({
        columnNames,
        referencedColumnNames,
        name,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      });
    }
    expect(
      foreignKeys.every(
        ({ onDelete, onUpdate }) =>
          onDelete === 'NO ACTION' && onUpdate === 'NO ACTION',
      ),
    ).toBe(true);
  });

  it('keeps typed reason storage nullable text and Workspace timezone DB-only', () => {
    const metadata = getMetadataArgsStorage();
    for (const entity of [CampaignEnrollmentEntity, CampaignOccurrenceEntity]) {
      for (const propertyName of ['holdReason', 'terminalReason']) {
        expect(
          metadata.columns.find(
            (candidate) =>
              candidate.target === entity &&
              candidate.propertyName === propertyName,
          )?.options,
        ).toMatchObject({ nullable: true, type: 'text' });
      }
    }

    expect(
      metadata.columns.find(
        (candidate) =>
          candidate.target === WorkspaceEntity &&
          candidate.propertyName === 'campaignCapacityTimeZone',
      )?.options,
    ).toMatchObject({ nullable: true, type: 'text' });
  });
});
