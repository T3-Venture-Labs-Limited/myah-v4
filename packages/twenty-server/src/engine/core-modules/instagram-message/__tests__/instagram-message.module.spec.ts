import { MODULE_METADATA } from '@nestjs/common/constants';

import { CoreEngineModule } from 'src/engine/core-modules/core-engine.module';
import { InstagramMessageModule } from 'src/engine/core-modules/instagram-message/instagram-message.module';
import { InstagramMessageReconciliationCronCommand } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.cron.command';
import { InstagramMessageReconciliationJob } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.job';
import { InstagramMessageResolver } from 'src/engine/core-modules/instagram-message/resolvers/instagram-message.resolver';
import { InstagramSendOutcomeResolutionResolver } from 'src/engine/core-modules/instagram-message/resolvers/instagram-send-outcome-resolution.resolver';
import { InstagramMessageAuthorityReaderService } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.service';
import { INSTAGRAM_MESSAGE_AUTHORITY_READER } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.type';
import { InstagramMessageDraftService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft.service';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';
import { InstagramMessageReceiptProjectionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-receipt-projection.service';
import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { InstagramSendOutcomeResolutionService } from 'src/engine/core-modules/instagram-message/services/instagram-send-outcome-resolution.service';

describe('InstagramMessageModule', () => {
  it('registers the resolver, authority, draft, permission, projection, and send providers', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      InstagramMessageModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        InstagramMessageResolver,
        InstagramSendOutcomeResolutionResolver,
        InstagramMessageAuthorityReaderService,
        InstagramMessageDraftService,
        InstagramMessagePermissionService,
        InstagramMessageReceiptProjectionService,
        InstagramMessageReconciliationService,
        InstagramMessageSendService,
        InstagramSendOutcomeResolutionService,
        InstagramMessageReconciliationJob,
        InstagramMessageReconciliationCronCommand,
        expect.objectContaining({
          provide: INSTAGRAM_MESSAGE_AUTHORITY_READER,
          useExisting: InstagramMessageAuthorityReaderService,
        }),
      ]),
    );
  });

  it('exports reusable services and is registered in CoreEngineModule', () => {
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      InstagramMessageModule,
    ) as unknown[];
    const coreImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CoreEngineModule,
    ) as unknown[];

    expect(exports).toEqual(
      expect.arrayContaining([
        InstagramMessageAuthorityReaderService,
        InstagramMessageDraftService,
        InstagramMessagePermissionService,
        InstagramMessageReceiptProjectionService,
        InstagramMessageReconciliationService,
        InstagramMessageSendService,
        InstagramSendOutcomeResolutionService,
        InstagramMessageReconciliationCronCommand,
      ]),
    );
    expect(coreImports).toContain(InstagramMessageModule);
  });
});
