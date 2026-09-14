import { Module } from '@nestjs/common';

import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { MyahE2eFixtureRegistryService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture-registry.service';
import { MyahE2eFixtureResolver } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.resolver';
import { MyahE2eFixtureService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.service';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';

@Module({
  imports: [
    ActionApprovalModule,
    TwentyORMModule,
    ToolModule,
    WorkspaceDomainsModule,
  ],
  providers: [
    MyahE2eFixtureRegistryService,
    MyahE2eFixtureService,
    MyahE2eFixtureResolver,
  ],
})
export class MyahE2eFixtureModule {}
