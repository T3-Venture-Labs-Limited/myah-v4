import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';

const ids = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  campaignId: '00000000-0000-4000-8000-000000000002',
  attemptId: '00000000-0000-4000-8000-000000000003',
  executionId: '00000000-0000-4000-8000-000000000004',
  authorizationId: '00000000-0000-4000-8000-000000000005',
  activationId: '00000000-0000-4000-8000-000000000006',
  enrollmentId: '00000000-0000-4000-8000-000000000007',
  occurrenceId: '00000000-0000-4000-8000-000000000008',
  accountId: '00000000-0000-4000-8000-000000000009',
  channelId: '00000000-0000-4000-8000-000000000010',
  versionId: '00000000-0000-4000-8000-000000000011',
};

describe('CampaignEmailRuntimeService', () => {
  const setup = (
    projectionResult: 'PROJECTED' | 'EXACT_REPLAY' | 'DEFERRED' = 'PROJECTED',
  ) => {
    const query = jest.fn(async () => [
      {
        ...ids,
        campaignExecutionId: ids.executionId,
        authorizationGeneration: 1,
        authorizationId: ids.authorizationId,
        activationId: ids.activationId,
        workflowVersionId: ids.versionId,
        enrollmentId: ids.enrollmentId,
        occurrenceId: ids.occurrenceId,
        connectedAccountId: ids.accountId,
        messageChannelId: ids.channelId,
      },
    ]);
    const manager = { queryRunner: { isTransactionActive: true } };
    const dataSource = {
      query,
      transaction: jest.fn(async (work) => work(manager)),
    };
    const progression = {
      reconcileAcceptedInTransaction: jest.fn(),
      reconcileDefinitelyUnacceptedInTransaction: jest.fn(),
      reconcileUnknownInTransaction: jest.fn(),
    };
    const projection = { reconcile: jest.fn(async () => projectionResult) };
    return {
      service: new CampaignEmailRuntimeService(
        {
          getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
        } as never,
        progression as never,
        { dispatch: jest.fn() } as never,
        projection as never,
      ),
      progression,
      projection,
    };
  };

  it.each(['PROJECTED', 'EXACT_REPLAY'] as const)(
    'replays accepted unprogressed evidence through projection and progression (%s)',
    async (status) => {
      const { service, projection, progression } = setup(status);
      await (service as any).reconcileAcceptedAttempt(
        ids.workspaceId,
        ids.campaignId,
        ids.attemptId,
      );
      expect(projection.reconcile).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: ids.attemptId }),
      );
      expect(progression.reconcileAcceptedInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: ids.attemptId }),
        expect.anything(),
      );
    },
  );

  it('leaves deferred projection discoverable for a later tick', async () => {
    const { service, progression } = setup('DEFERRED');
    await (service as any).reconcileAcceptedAttempt(
      ids.workspaceId,
      ids.campaignId,
      ids.attemptId,
    );
    expect(progression.reconcileAcceptedInTransaction).not.toHaveBeenCalled();
  });
});
