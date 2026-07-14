import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MyahPlatformAdminController } from 'src/modules/myah-platform-admin/myah-platform-admin.controller';
import { MyahPlatformOperatorAuthService } from 'src/modules/myah-platform-admin/auth/myah-platform-operator-auth.service';
import { MyahPlatformOperatorGuard } from 'src/modules/myah-platform-admin/auth/myah-platform-operator.guard';
import { MyahPlatformOperationEntity } from 'src/modules/myah-platform-admin/entities/myah-platform-operation.entity';
import { MyahPlatformApplicationService } from 'src/modules/myah-platform-admin/services/myah-platform-application.service';
import { MyahPlatformOperationService } from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';
import { MyahPlatformStatusService } from 'src/modules/myah-platform-admin/services/myah-platform-status.service';
import { MyahPlatformWorkspaceService } from 'src/modules/myah-platform-admin/services/myah-platform-workspace.service';
import { MyahStandardAppsModule } from 'src/modules/myah-standard-apps/myah-standard-apps.module';

@Module({
  imports: [
    FeatureFlagModule,
    MyahStandardAppsModule,
    ThrottlerModule,
    TypeOrmModule.forFeature([
      ApplicationEntity,
      MyahPlatformOperationEntity,
      WorkspaceEntity,
    ]),
  ],
  controllers: [MyahPlatformAdminController],
  providers: [
    MyahPlatformApplicationService,
    MyahPlatformOperationService,
    MyahPlatformOperatorAuthService,
    MyahPlatformOperatorGuard,
    MyahPlatformStatusService,
    MyahPlatformWorkspaceService,
  ],
})
export class MyahPlatformAdminModule {}
