import { type Type } from '@nestjs/common';
import { MODULE_METADATA, PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { AiChatModule } from 'src/engine/metadata-modules/ai/ai-chat/ai-chat.module';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';
import { ChatExecutionService } from 'src/engine/metadata-modules/ai/ai-chat/services/chat-execution.service';

describe('execution services without Brand Brain preflight', () => {
  it('resolves the actual module-registered services without a preflight provider', async () => {
    const services = [ChatExecutionService, MyahInboxReplyProposalService];

    for (const [module, service] of [
      [AiChatModule, ChatExecutionService],
      [MyahInboxModule, MyahInboxReplyProposalService],
    ] as const) {
      const providers = Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        module,
      ) as unknown[];

      expect(providers).toContain(service);
      expect(providers).not.toContain(BrandBrainPreflightService);
    }

    const dependencies = [
      ...new Set(
        services.flatMap(
          (service) =>
            Reflect.getMetadata(PARAMTYPES_METADATA, service) as Type[],
        ),
      ),
    ];

    expect(dependencies).not.toContain(BrandBrainPreflightService);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...services,
        ...dependencies.map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();

    try {
      for (const service of services) {
        expect(moduleRef.get(service)).toBeInstanceOf(service);
      }
    } finally {
      await moduleRef.close();
    }
  });
});
