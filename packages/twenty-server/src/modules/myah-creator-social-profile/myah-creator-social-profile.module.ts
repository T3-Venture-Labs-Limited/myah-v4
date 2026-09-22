import { Module } from '@nestjs/common';

import {
  SocialProfileCreateManyPreQueryHook,
  SocialProfileCreateOnePreQueryHook,
  SocialProfileDeleteManyPreQueryHook,
  SocialProfileDeleteOnePreQueryHook,
  SocialProfileDestroyManyPreQueryHook,
  SocialProfileDestroyOnePreQueryHook,
  SocialProfileRestoreManyPreQueryHook,
  SocialProfileRestoreOnePreQueryHook,
  SocialProfileUpdateManyPreQueryHook,
  SocialProfileUpdateOnePreQueryHook,
} from 'src/modules/myah-creator-social-profile/query-hooks/social-profile.pre-query-hooks';
import { CreatorImportResolver } from 'src/modules/myah-creator-social-profile/resolvers/creator-import.resolver';
import { CreatorDataOperationService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation.service';
import { CreatorDataOperationWriterService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation-writer.service';
import { CreatorImportService } from 'src/modules/myah-creator-social-profile/services/creator-import.service';
import { SocialProfileService } from 'src/modules/myah-creator-social-profile/services/social-profile.service';

@Module({
  providers: [
    CreatorDataOperationService,
    CreatorDataOperationWriterService,
    CreatorImportService,
    CreatorImportResolver,
    SocialProfileService,
    SocialProfileCreateOnePreQueryHook,
    SocialProfileCreateManyPreQueryHook,
    SocialProfileUpdateOnePreQueryHook,
    SocialProfileUpdateManyPreQueryHook,
    SocialProfileDeleteOnePreQueryHook,
    SocialProfileDeleteManyPreQueryHook,
    SocialProfileDestroyOnePreQueryHook,
    SocialProfileDestroyManyPreQueryHook,
    SocialProfileRestoreOnePreQueryHook,
    SocialProfileRestoreManyPreQueryHook,
  ],
  exports: [
    CreatorDataOperationService,
    CreatorDataOperationWriterService,
    SocialProfileService,
  ],
})
export class MyahCreatorSocialProfileModule {}
