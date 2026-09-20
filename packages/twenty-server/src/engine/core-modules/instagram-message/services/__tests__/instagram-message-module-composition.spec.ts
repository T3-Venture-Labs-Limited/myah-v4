import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { InstagramMessageLocalAuthorityReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { InstagramMessageProposalReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-proposal-reader.service';
import { InstagramMessageModule } from '../../instagram-message.module';
import { InstagramMessageAuthorityReaderService } from '../instagram-message-authority-reader.service';
import { INSTAGRAM_MESSAGE_AUTHORITY_READER } from '../instagram-message-authority-reader.type';

@Module({})
class ExternalDependencyFixtureModule {}

describe('InstagramMessageModule v3 reader composition', () => {
  it('compiles the actual messaging and approval modules with distinct provider-aware and local reader registrations', async () => {
    const realProviders = new Set<unknown>([
      InstagramMessageAuthorityReaderService,
      InstagramMessageLocalAuthorityReaderService,
      InstagramMessageProposalReaderService,
      INSTAGRAM_MESSAGE_AUTHORITY_READER,
    ]);
    const builder = Test.createTestingModule({
      imports: [InstagramMessageModule],
    }).useMocker(() => ({}));
    // External transports/DB/cron modules are inert; both feature module graphs
    // and their actual reader providers are compiled by Nest, not hand-wired.
    for (const feature of [InstagramMessageModule, ActionApprovalModule]) {
      for (const dependency of Reflect.getMetadata('imports', feature)) {
        if (dependency !== ActionApprovalModule)
          builder
            .overrideModule(dependency)
            .useModule(ExternalDependencyFixtureModule);
      }
      for (const provider of Reflect.getMetadata('providers', feature)) {
        const token = provider.provide ?? provider;
        if (!realProviders.has(token))
          builder.overrideProvider(token).useValue({});
      }
    }
    const module = await builder.compile();
    expect(module.get(INSTAGRAM_MESSAGE_AUTHORITY_READER)).toBe(
      module.get(InstagramMessageAuthorityReaderService),
    );
    expect(module.get(InstagramMessageLocalAuthorityReaderService)).not.toBe(
      module.get(InstagramMessageAuthorityReaderService),
    );
    expect(module.get(InstagramMessageProposalReaderService)).toBeInstanceOf(
      InstagramMessageProposalReaderService,
    );
    expect(Reflect.getMetadata('imports', ActionApprovalModule)).not.toContain(
      InstagramMessageModule,
    );
    await module.close();
  });
});
