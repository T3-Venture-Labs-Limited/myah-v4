import { Test } from '@nestjs/testing';

import { BillingUsageService } from 'src/engine/core-modules/billing/services/billing-usage.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxReplyBriefingService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service';
import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import { MYAH_INBOX_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token';
import { TOOL_PROVIDERS } from 'src/engine/core-modules/tool-provider/constants/tool-providers.token';
import { MyahInboxToolProvider } from 'src/engine/core-modules/tool-provider/providers/myah-inbox-tool.provider';
import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { ToolExecutorService } from 'src/engine/core-modules/tool-provider/services/tool-executor.service';
import { ToolOutputSpillService } from 'src/engine/core-modules/tool/services/tool-output-spill.service';
import { AgentActorContextService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';
import { AiBillingService } from 'src/engine/metadata-modules/ai/ai-billing/services/ai-billing.service';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

describe('MyahInboxToolProvider dependency graph', () => {
  it('compiles the real proposal/preflight/registry provider graph without a provider cycle', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MyahInboxReplyProposalService,
        MyahInboxToolWorkspaceService,
        BrandBrainPreflightService,
        MyahInboxToolProvider,
        ToolRegistryService,
        {
          provide: MYAH_INBOX_TOOL_SERVICE_TOKEN,
          useExisting: MyahInboxToolWorkspaceService,
        },
        {
          provide: TOOL_PROVIDERS,
          inject: [MyahInboxToolProvider],
          useFactory: (provider: MyahInboxToolProvider) => [provider],
        },
        ...[
          MyahInboxQueryService,
          MyahInboxReplyBriefingService,
          MyahInboxMutationService,
          MyahInboxReplySendService,
          AgentActorContextService,
          AiModelRegistryService,
          BillingUsageService,
          AiBillingService,
          ManagedOpenRouterModelService,
          ToolExecutorService,
          ToolOutputSpillService,
          WorkspaceCacheService,
          WorkspaceManyOrAllFlatEntityMapsCacheService,
          PermissionsService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();

    expect(moduleRef.get(ToolRegistryService)).toBeInstanceOf(
      ToolRegistryService,
    );
    expect(moduleRef.get(MyahInboxToolProvider)).toBeInstanceOf(
      MyahInboxToolProvider,
    );

    await moduleRef.close();
  });
});
