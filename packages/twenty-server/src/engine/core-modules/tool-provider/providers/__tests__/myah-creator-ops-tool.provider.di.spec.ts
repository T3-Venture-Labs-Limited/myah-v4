import { Test } from '@nestjs/testing';

import { MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-creator-ops-tool-service.token';
import { TOOL_PROVIDERS } from 'src/engine/core-modules/tool-provider/constants/tool-providers.token';
import { MyahCreatorOpsToolProvider } from 'src/engine/core-modules/tool-provider/providers/myah-creator-ops-tool.provider';
import { ToolExecutorService } from 'src/engine/core-modules/tool-provider/services/tool-executor.service';
import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { ToolOutputSpillService } from 'src/engine/core-modules/tool/services/tool-output-spill.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';
import { MyahCreatorOpsToolWorkspaceService } from 'src/modules/myah-campaign/tools/myah-creator-ops-tool.workspace-service';

jest.mock('twenty-client-sdk/generate', () => ({}), { virtual: true });
jest.mock('twenty-client-sdk/core', () => ({}), { virtual: true });
describe('MyahCreatorOpsToolProvider dependency graph', () => {
  it('compiles the real campaign service and registry provider graph without a provider cycle', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignInfluencerService,
        MyahCreatorOpsToolWorkspaceService,
        MyahCreatorOpsToolProvider,
        ToolRegistryService,
        {
          provide: MYAH_CREATOR_OPS_TOOL_SERVICE_TOKEN,
          useExisting: MyahCreatorOpsToolWorkspaceService,
        },
        {
          provide: TOOL_PROVIDERS,
          inject: [MyahCreatorOpsToolProvider],
          useFactory: (provider: MyahCreatorOpsToolProvider) => [provider],
        },
        ...[
          GlobalWorkspaceOrmManager,
          ToolExecutorService,
          ToolOutputSpillService,
          WorkspaceCacheService,
          WorkspaceManyOrAllFlatEntityMapsCacheService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();

    expect(moduleRef.get(ToolRegistryService)).toBeInstanceOf(
      ToolRegistryService,
    );
    expect(moduleRef.get(MyahCreatorOpsToolProvider)).toBeInstanceOf(
      MyahCreatorOpsToolProvider,
    );

    await moduleRef.close();
  });
});
