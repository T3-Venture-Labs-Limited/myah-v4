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

    expect(queries).toHaveLength(29);
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
    expect(sql).not.toContain('campaignSequenceAuthorization');
    expect(sql).not.toContain('campaign_sequence_authorization_immutable_guard');
    expect(sql).not.toContain('TRG_CSA_IMMUTABLE');
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

  it('installs the test-preparation-proof immutable guard after its table exists', async () => {
    const queries = await run('up');
    const sql = queries.join('\n');

    expect(sql).toContain('TRIGGER "TRG_CTP_IMMUTABLE"');
    expect(sql).toContain('campaign_test_preparation_proof_immutable_guard');
    expect(sql).toContain(
      "to_jsonb(NEW) - ARRAY['testSubmissionCapabilityId', 'finalEvidenceDigest']",
    );
  });

  it('does not drop the main-owned sequence authorization schema', async () => {
    const queries = await run('down');

    expect(queries).toHaveLength(29);
    expect(queries.join('\n')).not.toContain('campaignSequenceAuthorization');
    expect(queries.join('\n')).not.toContain('campaign_sequence_authorization');
  });
});
