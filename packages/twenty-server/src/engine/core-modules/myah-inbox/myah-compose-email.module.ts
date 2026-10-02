import { Module } from '@nestjs/common';

import { MyahInboxContactTriageModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-contact-triage.module';
import { MyahComposeEmailSendService } from 'src/engine/core-modules/myah-inbox/services/myah-compose-email-send.service';
import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';

export const MYAH_COMPOSE_REPLY_EVIDENCE_PORT = Symbol(
  'MYAH_COMPOSE_REPLY_EVIDENCE_PORT',
);

@Module({
  imports: [GlobalWorkspaceDataSourceModule, MyahInboxContactTriageModule],
  providers: [
    MyahComposeEmailSendService,
    {
      provide: MYAH_COMPOSE_REPLY_EVIDENCE_PORT,
      useExisting: MyahComposeEmailSendService,
    },
  ],
  exports: [MyahComposeEmailSendService, MYAH_COMPOSE_REPLY_EVIDENCE_PORT],
})
export class MyahComposeEmailModule {}
