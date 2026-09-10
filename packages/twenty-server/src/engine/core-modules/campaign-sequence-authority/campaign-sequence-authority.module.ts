import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CampaignSequenceAuthorizationEntity } from 'src/engine/core-modules/campaign-sequence-authority/entities/campaign-sequence-authorization.entity';
import { CampaignSequenceAuthorizationService } from 'src/engine/core-modules/campaign-sequence-authority/services/campaign-sequence-authorization.service';

@Module({
  imports: [TypeOrmModule.forFeature([CampaignSequenceAuthorizationEntity])],
  providers: [
    {
      provide: CampaignSequenceAuthorizationService,
      useFactory: () =>
        new CampaignSequenceAuthorizationService({
          generateAuthorizationId: randomUUID,
          now: () => new Date(),
        }),
    },
  ],
  exports: [CampaignSequenceAuthorizationService],
})
export class CampaignSequenceAuthorityModule {}
