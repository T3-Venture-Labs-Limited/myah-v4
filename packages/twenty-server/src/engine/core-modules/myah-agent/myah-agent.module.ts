import { Module } from '@nestjs/common';

import { MyahAgentResolver } from 'src/engine/core-modules/myah-agent/resolvers/myah-agent.resolver';
import { MyahAgentService } from 'src/engine/core-modules/myah-agent/services/myah-agent.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';

@Module({
  imports: [PermissionsModule, GlobalWorkspaceDataSourceModule],
  providers: [MyahAgentService, MyahAgentResolver],
  exports: [MyahAgentService],
})
export class MyahAgentModule {}
