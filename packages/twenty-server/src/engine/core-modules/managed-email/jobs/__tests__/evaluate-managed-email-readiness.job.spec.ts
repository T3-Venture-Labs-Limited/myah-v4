import { EvaluateManagedEmailReadinessJob } from '../evaluate-managed-email-readiness.job';

describe('EvaluateManagedEmailReadinessJob', () => {
  it('delegates once with opaque workspace and mailbox IDs and returns no provider data', async () => {
    const evaluateMailbox = jest.fn().mockResolvedValue({
      campaignEligibility: 'BLOCKED',
      healthFacts: {
        facts: [{ name: 'providerStatus', value: 'running' }],
        schemaVersion: 1,
      },
      nextReconciliationAt: new Date('2026-08-06T13:00:00.000Z'),
    });
    const job = new EvaluateManagedEmailReadinessJob({
      evaluateMailbox,
    } as never);

    await expect(
      job.handle({ mailboxId: 'mailbox-1', workspaceId: 'workspace-1' }),
    ).resolves.toBeUndefined();
    expect(evaluateMailbox).toHaveBeenCalledTimes(1);
    expect(evaluateMailbox).toHaveBeenCalledWith({
      mailboxId: 'mailbox-1',
      workspaceId: 'workspace-1',
    });
  });
});
