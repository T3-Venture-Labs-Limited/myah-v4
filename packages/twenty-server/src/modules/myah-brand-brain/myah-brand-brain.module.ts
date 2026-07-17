import { Global, Module } from '@nestjs/common';

import { BRAND_BRAIN_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/brand-brain-tool-service.token';
import { MyahBrandBrainStoreService } from 'src/modules/myah-brand-brain/services/myah-brand-brain-store.service';
import { MyahBrandBrainWorkspaceService } from 'src/modules/myah-brand-brain/services/myah-brand-brain.workspace-service';

@Global()
@Module({
  providers: [
    MyahBrandBrainStoreService,
    MyahBrandBrainWorkspaceService,
    {
      provide: BRAND_BRAIN_TOOL_SERVICE_TOKEN,
      useExisting: MyahBrandBrainWorkspaceService,
    },
  ],
  exports: [MyahBrandBrainWorkspaceService, BRAND_BRAIN_TOOL_SERVICE_TOKEN],
})
export class MyahBrandBrainModule {}
