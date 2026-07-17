import { Global, Module } from '@nestjs/common';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';

@Global()
@Module({
  imports: [TwentyConfigModule, ManagedProviderBillingModule],
  providers: [MyahTeamAuthorizationService],
  exports: [MyahTeamAuthorizationService, ManagedProviderBillingModule],
})
export class MyahModule {}
