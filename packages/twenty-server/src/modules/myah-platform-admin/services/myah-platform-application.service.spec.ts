import { MyahPlatformOperationStatus } from 'src/modules/myah-platform-admin/entities/myah-platform-operation.entity';
import { MyahPlatformApplicationService } from 'src/modules/myah-platform-admin/services/myah-platform-application.service';

const rolloutInput = {
  applicationUniversalIdentifier: '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991',
  idempotencyKey: 'release-2026-07-14-rollout',
  operatorId: 'staging-deployer',
};

describe('MyahPlatformApplicationService', () => {
  it('re-enqueues a replayed running rollout after an interrupted request', async () => {
    const operation = {
      id: 'operation-1',
      status: MyahPlatformOperationStatus.RUNNING,
    };
    const standardAppsService = {
      promoteAndBackfill: jest.fn().mockResolvedValue({
        applicationRegistrationId: 'registration-1',
        backfillJobId: 'job-1',
      }),
    };
    const operationService = {
      beginOperation: jest
        .fn()
        .mockResolvedValue({ operation, replayed: true }),
      markRunning: jest.fn().mockResolvedValue(operation),
      markQueued: jest.fn().mockResolvedValue({
        ...operation,
        status: MyahPlatformOperationStatus.QUEUED,
      }),
    };
    const service = new MyahPlatformApplicationService(
      {} as never,
      standardAppsService as never,
      operationService as never,
    );

    await service.rollout(rolloutInput);

    expect(standardAppsService.promoteAndBackfill).toHaveBeenCalledWith(
      rolloutInput.applicationUniversalIdentifier,
      operation.id,
    );
    expect(operationService.markQueued).toHaveBeenCalledWith(operation.id, {
      applicationRegistrationId: 'registration-1',
      backfillJobId: 'job-1',
      state: 'queued',
    });
  });

  it('does not restart a replayed terminal rollout', async () => {
    const operation = {
      id: 'operation-1',
      status: MyahPlatformOperationStatus.SUCCEEDED,
    };
    const standardAppsService = { promoteAndBackfill: jest.fn() };
    const operationService = {
      beginOperation: jest
        .fn()
        .mockResolvedValue({ operation, replayed: true }),
    };
    const service = new MyahPlatformApplicationService(
      {} as never,
      standardAppsService as never,
      operationService as never,
    );

    await expect(service.rollout(rolloutInput)).resolves.toBe(operation);
    expect(standardAppsService.promoteAndBackfill).not.toHaveBeenCalled();
  });
});
