import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CampaignTestPreparationProofEntity } from 'src/engine/core-modules/campaign-test-authority/entities/campaign-test-preparation-proof.entity';
import { CampaignTestPreparationProofService } from 'src/engine/core-modules/campaign-test-authority/services/campaign-test-preparation-proof.service';

@Module({
  imports: [TypeOrmModule.forFeature([CampaignTestPreparationProofEntity])],
  providers: [CampaignTestPreparationProofService],
  exports: [TypeOrmModule, CampaignTestPreparationProofService],
})
export class CampaignTestAuthorityModule {}
