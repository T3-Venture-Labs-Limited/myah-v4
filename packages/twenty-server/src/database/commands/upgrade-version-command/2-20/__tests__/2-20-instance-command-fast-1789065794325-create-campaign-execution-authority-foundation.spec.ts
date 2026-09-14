import { CreateCampaignExecutionAuthorityFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789065794325-create-campaign-execution-authority-foundation';

const run = async (direction: 'up' | 'down') => {
  const query = jest.fn().mockResolvedValue(undefined);
  const command = new CreateCampaignExecutionAuthorityFoundationFastInstanceCommand();

  await command[direction]({ query } as never);

  return query.mock.calls.map(([sql]) => sql as string);
};

describe('CreateCampaignExecutionAuthorityFoundationFastInstanceCommand', () => {
  it('creates only the reviewed campaign foundation and allowed policy columns', async () => {
    const queries = await run('up');
    const sql = queries.join('\n');

    expect(queries).toHaveLength(31);
    expect(
      queries.filter((query) => query.startsWith('CREATE TABLE')),
    ).toHaveLength(8);
    for (const table of [
      'campaignExecution',
      'campaignActivation',
      'campaignEnrollment',
      'campaignOccurrence',
      'mailboxCapacityDay',
      'mailboxDispatchClock',
      'outboundEmailAttempt',
      'campaignTestPreparationProof',
    ]) {
      expect(sql).toContain(`"core"."${table}"`);
    }
    expect(sql).not.toMatch(
      /(?:CREATE|DROP) TABLE "core"\."campaignSequenceAuthorization"/,
    );
    expect(sql).not.toMatch(
      /(?:CREATE|DROP) TYPE "core"\."campaignSequenceAuthorization_(?:state|revocationReason)_enum"/,
    );
    expect(sql).toContain(
      'ALTER TABLE "core"."workspace" ADD "campaignCapacityTimeZone" text',
    );
    expect(sql).toContain(
      'ALTER TABLE "core"."connectedAccount" ADD "dailySendLimit"',
    );
    expect(sql).toContain(
      'ALTER TABLE "core"."connectedAccount" ADD "minimumSendIntervalMs"',
    );
    expect(sql).not.toMatch(
      /actionApprovalBinding|actionExecutionReceipt|managedProvider|instagramReply|managedEmailOffer/,
    );
  });

  it('installs both immutable guards without recreating sequence authorization schema', async () => {
    const queries = await run('up');
    const sql = queries.join('\n');

    expect(sql).toContain('TRIGGER "TRG_CSA_IMMUTABLE"');
    expect(sql).toContain('campaign_sequence_authorization_immutable_guard');
    expect(sql).toContain(
      "to_jsonb(NEW) - ARRAY['state', 'revokedAt', 'revocationReason', 'updatedAt']",
    );
    expect(sql).toContain('TRIGGER "TRG_CTP_IMMUTABLE"');
    expect(sql).toContain('campaign_test_preparation_proof_immutable_guard');
    expect(sql).toContain(
      "to_jsonb(NEW) - ARRAY['testSubmissionCapabilityId', 'finalEvidenceDigest']",
    );
  });

  it('drops the sequence guard but not the main-owned sequence authorization schema', async () => {
    const queries = await run('down');
    const sql = queries.join('\n');

    expect(queries).toHaveLength(31);
    expect(sql).toContain('DROP TRIGGER "TRG_CSA_IMMUTABLE"');
    expect(sql).toContain('DROP FUNCTION "core".campaign_sequence_authorization_immutable_guard()');
    expect(sql).not.toMatch(
      /DROP TABLE "core"\."campaignSequenceAuthorization"/,
    );
    expect(sql).not.toMatch(
      /DROP TYPE "core"\."campaignSequenceAuthorization_(?:state|revocationReason)_enum"/,
    );
  });
});
