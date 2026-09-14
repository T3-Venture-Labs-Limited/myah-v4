import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  CampaignEmailAccountCampaignInput,
  CampaignEmailAccountDTO,
  CampaignEmailAccountLinkInput,
  LinkCampaignEmailAccountInput,
  ReplaceCampaignEmailPoolInput,
  ResolveExactCampaignEmailSenderInput,
  CampaignSenderPoolSnapshotDTO,
  ExactCampaignEmailSenderResultDTO,
  toCampaignSenderPoolSnapshotDTO,
  toExactCampaignEmailSenderResultDTO,
} from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
export class CampaignAccountResolver {
  constructor(private readonly service: CampaignAccountService) {}

  @Query(() => [CampaignEmailAccountDTO])
  async campaignEmailAccounts(
    @Args('input') input: CampaignEmailAccountCampaignInput,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.service.list(input.campaignId, getWorkspaceAuthContext());
  }

  @Query(() => [CampaignEmailAccountDTO])
  async campaignEmailAccountCandidates(
    @Args('input') input: CampaignEmailAccountCampaignInput,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.service.candidates(input.campaignId, getWorkspaceAuthContext());
  }

  @Query(() => CampaignSenderPoolSnapshotDTO)
  async campaignEmailSenderPool(
    @Args('input') input: CampaignEmailAccountCampaignInput,
  ): Promise<CampaignSenderPoolSnapshotDTO> {
    return toCampaignSenderPoolSnapshotDTO(
      await this.service.getCampaignEmailSenderPool(
        input,
        getWorkspaceAuthContext(),
      ),
    );
  }

  @Query(() => ExactCampaignEmailSenderResultDTO)
  async exactCampaignEmailSender(
    @Args('input') input: ResolveExactCampaignEmailSenderInput,
  ): Promise<ExactCampaignEmailSenderResultDTO> {
    return toExactCampaignEmailSenderResultDTO(
      await this.service.resolveExactCampaignEmailSender(
        input,
        getWorkspaceAuthContext(),
      ),
    );
  }

  @Mutation(() => CampaignSenderPoolSnapshotDTO)
  async replaceCampaignEmailPool(
    @Args('input') input: ReplaceCampaignEmailPoolInput,
  ): Promise<CampaignSenderPoolSnapshotDTO> {
    return toCampaignSenderPoolSnapshotDTO(
      await this.service.replaceCampaignEmailPool(
        input,
        getWorkspaceAuthContext(),
      ),
    );
  }

  @Mutation(() => [CampaignEmailAccountDTO])
  async linkCampaignEmailAccount(
    @Args('input') input: LinkCampaignEmailAccountInput,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.service.link(input, getWorkspaceAuthContext());
  }

  @Mutation(() => [CampaignEmailAccountDTO])
  async setDefaultCampaignEmailAccount(
    @Args('input') input: CampaignEmailAccountLinkInput,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.service.setDefault(input, getWorkspaceAuthContext());
  }

  @Mutation(() => [CampaignEmailAccountDTO])
  async removeCampaignEmailAccount(
    @Args('input') input: CampaignEmailAccountLinkInput,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.service.remove(input, getWorkspaceAuthContext());
  }
}
