import { BackfillApplicationInstallationJob } from 'src/engine/core-modules/application/jobs/backfill-application-installation.job';
import { MyahPlatformOperationService } from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';

describe('BackfillApplicationInstallationJob', () => {
  it('records successful Myah rollout completion after every workspace is installed', async () => {
    const operationService = {
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const moduleRef = { get: jest.fn().mockReturnValue(operationService) };
    const preInstalledAppsService = {
      backfillApplicationOnAllWorkspaces: jest.fn().mockResolvedValue({
        success: [{ workspaceId: 'workspace-1' }],
        fail: [],
      }),
    };
    const job = new BackfillApplicationInstallationJob(
      moduleRef as never,
      preInstalledAppsService as never,
    );

    await job.handle({
      applicationRegistrationId: 'registration-1',
      operationId: 'operation-1',
    });

    expect(moduleRef.get).toHaveBeenCalledWith(MyahPlatformOperationService, {
      strict: false,
    });
    expect(operationService.markSucceeded).toHaveBeenCalledWith('operation-1', {
      installedWorkspaceCount: 1,
    });
    expect(operationService.markFailed).not.toHaveBeenCalled();
  });

  it('records failed Myah rollout completion when a workspace installation fails', async () => {
    const operationService = {
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const moduleRef = { get: jest.fn().mockReturnValue(operationService) };
    const preInstalledAppsService = {
      backfillApplicationOnAllWorkspaces: jest.fn().mockResolvedValue({
        success: [],
        fail: [{ workspaceId: 'workspace-1' }],
      }),
    };
    const job = new BackfillApplicationInstallationJob(
      moduleRef as never,
      preInstalledAppsService as never,
    );

    await job.handle({
      applicationRegistrationId: 'registration-1',
      operationId: 'operation-1',
    });

    expect(operationService.markFailed).toHaveBeenCalledWith('operation-1', {
      code: 'APPLICATION_ROLLOUT_PARTIAL_FAILURE',
      message: '1 workspace installation(s) failed',
    });
  });
});
