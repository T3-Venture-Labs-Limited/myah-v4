import { Global, Module } from '@nestjs/common';

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';

@Global()
@Module({
  imports: [TwentyConfigModule],
  providers: [MyahTeamAuthorizationService],
  exports: [MyahTeamAuthorizationService],
})
export class MyahModule {}
