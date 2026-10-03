import { UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import {
  MyahAgentDTO,
  MyahCampaignAgentSettingDTO,
  MyahCampaignAgentSettingInput,
  UpdateMyahAgentInput,
  UpdateMyahCampaignAgentSettingInput,
} from 'src/engine/core-modules/myah-agent/dtos/myah-agent.dto';
import { MyahAgentService } from 'src/engine/core-modules/myah-agent/services/myah-agent.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(WorkspaceAuthGuard)
export class MyahAgentResolver {
  constructor(private readonly service: MyahAgentService) {}

  @Query(() => MyahAgentDTO)
  @UseGuards(CustomPermissionGuard)
  async myahAgent(): Promise<MyahAgentDTO> {
    return this.service.getAgent(getWorkspaceAuthContext().workspace.id);
  }

  @Mutation(() => MyahAgentDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.WORKSPACE))
  async updateMyahAgent(
    @Args('input') input: UpdateMyahAgentInput,
  ): Promise<MyahAgentDTO> {
    const authContext = getWorkspaceAuthContext();
    return this.service.updateAgent(
      authContext.workspace.id,
      'userWorkspaceId' in authContext
        ? authContext.userWorkspaceId
        : undefined,
      input,
    );
  }

  @Query(() => MyahCampaignAgentSettingDTO)
  @UseGuards(CustomPermissionGuard)
  async myahCampaignAgentSetting(
    @Args('input') input: MyahCampaignAgentSettingInput,
  ): Promise<MyahCampaignAgentSettingDTO> {
    return this.service.getCampaignSetting(
      input.campaignId,
      getWorkspaceAuthContext(),
    );
  }

  @Mutation(() => MyahCampaignAgentSettingDTO)
  @UseGuards(CustomPermissionGuard)
  async updateMyahCampaignAgentSetting(
    @Args('input') input: UpdateMyahCampaignAgentSettingInput,
  ): Promise<MyahCampaignAgentSettingDTO> {
    return this.service.updateCampaignSetting(input, getWorkspaceAuthContext());
  }
}
