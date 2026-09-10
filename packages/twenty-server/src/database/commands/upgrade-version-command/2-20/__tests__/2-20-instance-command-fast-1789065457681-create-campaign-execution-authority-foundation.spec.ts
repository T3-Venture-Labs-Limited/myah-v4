import { CreateCampaignExecutionAuthorityFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789065457681-create-campaign-execution-authority-foundation';

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

    expect(queries).toHaveLength(35);
    expect(
      queries.filter((query) => query.startsWith('CREATE TABLE')),
    ).toHaveLength(9);
    for (const table of [
      'campaignExecution',
      'campaignActivation',
      'campaignEnrollment',
      'campaignOccurrence',
      'mailboxCapacityDay',
      'mailboxDispatchClock',
      'outboundEmailAttempt',
      'campaignSequenceAuthorization',
      'campaignTestPreparationProof',
    ]) {
      expect(sql).toContain(`"core"."${table}"`);
    }
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

  it('installs both reviewed immutable guards after their tables exist', async () => {
    const queries = await run('up');
    const sql = queries.join('\n');

    expect(sql).toContain('TRIGGER "TRG_CSA_IMMUTABLE"');
    expect(sql).toContain('campaign_sequence_authorization_immutable_guard');
    expect(sql).toContain('TRIGGER "TRG_CTP_IMMUTABLE"');
    expect(sql).toContain('campaign_test_preparation_proof_immutable_guard');
    expect(sql).toContain(
      "to_jsonb(NEW) - ARRAY['state', 'revokedAt', 'revocationReason', 'updatedAt']",
    );
    expect(sql).toContain(
      "to_jsonb(NEW) - ARRAY['testSubmissionCapabilityId', 'finalEvidenceDigest']",
    );
  });

  it('drops immutable guards before dropping their protected tables', async () => {
    const queries = await run('down');
    const csaTrigger = queries.findIndex((query) =>
      query.includes('DROP TRIGGER "TRG_CSA_IMMUTABLE"'),
    );
    const ctpTrigger = queries.findIndex((query) =>
      query.includes('DROP TRIGGER "TRG_CTP_IMMUTABLE"'),
    );
    const csaTable = queries.findIndex((query) =>
      query.includes('DROP TABLE "core"."campaignSequenceAuthorization"'),
    );
    const ctpTable = queries.findIndex((query) =>
      query.includes('DROP TABLE "core"."campaignTestPreparationProof"'),
    );

    expect(queries).toHaveLength(35);
    expect(csaTrigger).toBeGreaterThanOrEqual(0);
    expect(ctpTrigger).toBeGreaterThanOrEqual(0);
    expect(csaTrigger).toBeLessThan(csaTable);
    expect(ctpTrigger).toBeLessThan(ctpTable);
  });
});
