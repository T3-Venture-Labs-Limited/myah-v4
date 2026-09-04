import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import {
  MyahUnipileInstagramController,
  MyahUnipileInstagramPublicController,
} from 'src/modules/myah-unipile/controllers/myah-unipile-instagram.controller';
import { UnipileHostedAuthAttemptEntity } from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramAccountRecoveryCronCommand } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.cron-command';
import { UnipileInstagramAccountRecoveryJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.job';
import {
  UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER,
  UnipileHostedAuthService,
} from 'src/modules/myah-unipile/services/unipile-hosted-auth.service';
import { UnipileInstagramAccountFinalizationLockService } from 'src/modules/myah-unipile/services/unipile-instagram-account-finalization-lock.service';
import { UnipileInstagramAccountProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-account-projection.service';
import { UnipileInstagramAccountRecoveryService } from 'src/modules/myah-unipile/services/unipile-instagram-account-recovery.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import {
  UNIPILE_FETCH,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';

@Module({
  imports: [
    AuthModule,
    PermissionsModule,
    GlobalWorkspaceDataSourceModule,
    MessageQueueModule,
    WorkspaceCacheStorageModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      UnipileInstagramAccountBindingEntity,
      UnipileHostedAuthAttemptEntity,
    ]),
  ],
  controllers: [
    MyahUnipileInstagramController,
    MyahUnipileInstagramPublicController,
  ],
  providers: [
    UnipileInstagramAvailabilityService,
    UnipileV1ClientService,
    UnipileInstagramAccountProjectionService,
    UnipileInstagramAccountFinalizationLockService,
    UnipileInstagramAccountService,
    UnipileHostedAuthService,
    UnipileInstagramAccountRecoveryService,
    UnipileInstagramAccountRecoveryJob,
    UnipileInstagramAccountRecoveryCronCommand,
    { provide: UNIPILE_FETCH, useValue: globalThis.fetch },
    {
      provide: UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER,
      useExisting: UnipileInstagramAccountService,
    },
  ],
  exports: [
    UnipileV1ClientService,
    UnipileInstagramAccountService,
    UnipileInstagramAccountProjectionService,
    UnipileInstagramAvailabilityService,
    UnipileInstagramAccountRecoveryCronCommand,
  ],
})
export class MyahUnipileModule {}
