import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { MyahComposioController } from 'src/modules/myah-composio/controllers/myah-composio.controller';
import { MyahComposioService } from 'src/modules/myah-composio/services/myah-composio.service';

@Module({
  imports: [
    AuthModule,
    PermissionsModule,
    WorkspaceCacheStorageModule,
    GlobalWorkspaceDataSourceModule,
  ],
  controllers: [MyahComposioController],
  providers: [MyahComposioService],
  exports: [MyahComposioService],
})
export class MyahComposioModule {}
