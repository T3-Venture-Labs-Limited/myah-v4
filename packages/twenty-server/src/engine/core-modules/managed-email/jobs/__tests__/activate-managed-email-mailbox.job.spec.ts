import { ActivateManagedEmailMailboxJob } from '../activate-managed-email-mailbox.job';
import { EvaluateManagedEmailReadinessJob } from '../evaluate-managed-email-readiness.job';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const mailboxId = '123e4567-e89b-42d3-a456-426614174001';

describe('ActivateManagedEmailMailboxJob', () => {
  it('enqueues the first readiness evaluation only after successful secure activation', async () => {
    const activationService = {
      activateMailbox: jest
        .fn()
        .mockResolvedValue({ campaignEligibility: 'BLOCKED', state: 'ACTIVE' }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const job = new ActivateManagedEmailMailboxJob(
      activationService as never,
      queue as never,
    );

    await job.handle({ mailboxId, workspaceId });

    expect(queue.add).toHaveBeenCalledWith(
      EvaluateManagedEmailReadinessJob.name,
      { mailboxId, workspaceId },
      expect.objectContaining({ id: `managed-email-readiness:${mailboxId}` }),
    );
    expect(JSON.stringify(queue.add.mock.calls)).not.toContain('credential');
  });

  it('does not enqueue readiness while credentials remain unavailable', async () => {
    const activationService = {
      activateMailbox: jest.fn().mockResolvedValue({
        retryScheduled: true,
        state: 'WAITING_FOR_CREDENTIALS',
      }),
    };
    const queue = { add: jest.fn() };

    await new ActivateManagedEmailMailboxJob(
      activationService as never,
      queue as never,
    ).handle({ mailboxId, workspaceId });

    expect(queue.add).not.toHaveBeenCalled();
  });
});
