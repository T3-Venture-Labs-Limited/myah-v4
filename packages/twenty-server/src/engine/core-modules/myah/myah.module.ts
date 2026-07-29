import { Global, Module } from '@nestjs/common';

import { ManagedEmailModule } from 'src/engine/core-modules/managed-email/managed-email.module';
import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';

@Global()
@Module({
  imports: [
    TwentyConfigModule,
    ManagedProviderBillingModule,
    ManagedEmailModule,
  ],
  providers: [MyahTeamAuthorizationService],
  exports: [
    MyahTeamAuthorizationService,
    ManagedProviderBillingModule,
    ManagedEmailModule,
  ],
})
export class MyahModule {}
