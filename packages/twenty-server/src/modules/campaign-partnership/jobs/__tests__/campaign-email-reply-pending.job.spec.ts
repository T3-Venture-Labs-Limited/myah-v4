import { CampaignEmailReplyPendingJob } from 'src/modules/campaign-partnership/jobs/campaign-email-reply-pending.job';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const workItemId = '22222222-2222-4222-8222-222222222222';

describe('inert Review pending job', () => {
  it('runs only a workspace-context status check, never generates or sends', async () => {
    const recovery = { isStillPending: jest.fn(async () => true) };
    const orm = {
      executeInWorkspaceContext: jest.fn(
        async (fn: () => unknown, auth: { workspace: { id: string } }) => {
          expect(auth.workspace.id).toBe(workspaceId);
          return fn();
        },
      ),
    };
    const job = new CampaignEmailReplyPendingJob(
      recovery as never,
      orm as never,
    );
    const data = { workspaceId, workItemId, expectedContextGeneration: 1 };
    await job.handle(data);
    expect(recovery.isStillPending).toHaveBeenCalledWith(data);
    await job.handle({ ...data, workspaceId: 'other' });
    expect(recovery.isStillPending).toHaveBeenCalledTimes(1);
  });
});
