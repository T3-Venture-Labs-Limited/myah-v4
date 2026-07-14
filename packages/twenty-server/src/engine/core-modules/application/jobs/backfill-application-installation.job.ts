import { ModuleRef } from '@nestjs/core';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  BACKFILL_APPLICATION_INSTALLATION_JOB_NAME,
  type BackfillApplicationInstallationJobData,
} from 'src/engine/core-modules/application/jobs/backfill-application-installation.job-constants';
import { PreInstalledAppsService } from 'src/engine/core-modules/application/pre-installed-apps/pre-installed-apps.service';
import { MyahPlatformOperationService } from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';

@Processor(MessageQueue.workspaceQueue)
export class BackfillApplicationInstallationJob {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly preInstalledAppsService: PreInstalledAppsService,
  ) {}

  @Process(BACKFILL_APPLICATION_INSTALLATION_JOB_NAME)
  async handle(data: BackfillApplicationInstallationJobData): Promise<void> {
    try {
      const report =
        await this.preInstalledAppsService.backfillApplicationOnAllWorkspaces(
          data.applicationRegistrationId,
        );
      if (data.operationId === undefined) return;
      const operationService = this.moduleRef.get(
        MyahPlatformOperationService,
        {
          strict: false,
        },
      );
      if (report.fail.length === 0) {
        await operationService.markSucceeded(data.operationId, {
          installedWorkspaceCount: report.success.length,
        });
        return;
      }
      await operationService.markFailed(data.operationId, {
        code: 'APPLICATION_ROLLOUT_PARTIAL_FAILURE',
        message: `${report.fail.length} workspace installation(s) failed`,
      });
    } catch (error) {
      if (data.operationId !== undefined) {
        const operationService = this.moduleRef.get(
          MyahPlatformOperationService,
          {
            strict: false,
          },
        );
        await operationService.markFailed(data.operationId, {
          code: 'APPLICATION_ROLLOUT_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Application rollout failed',
        });
      }
      throw error;
    }
  }
}
