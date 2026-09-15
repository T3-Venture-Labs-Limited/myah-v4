import { UseGuards } from '@nestjs/common';
import { Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { IsNull } from 'typeorm';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { InstagramActionUsageDto } from 'src/engine/core-modules/instagram-action-budget/dtos/instagram-action-usage.dto';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  CustomPermissionGuard,
  SettingsPermissionGuard(PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL),
)
@CoreResolver()
export class InstagramActionBudgetResolver {
  constructor(
    private readonly instagramActionBudgetService: InstagramActionBudgetService,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    private readonly accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
  ) {}

  @Query(() => InstagramActionUsageDto)
  async instagramActionUsage(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<InstagramActionUsageDto> {
    const bindings = await this.accountBindingRepository.find(workspace.id, {
      take: 2,
      where: { deactivatedAt: IsNull() },
    });
    if (bindings.length !== 1) {
      throw new Error('A single active Instagram account binding is required');
    }

    const usage = await this.instagramActionBudgetService.inspectUsage({
      instagramAccountRecordId: bindings[0].workspaceInstagramAccountRecordId,
      workspaceId: workspace.id,
    });

    return {
      dailyLimit: usage.dailyLimit,
      dailyRemaining: usage.dailyRemaining,
      dailyUsed: usage.dailyUsed,
      hourlyLimit: usage.hourlyLimit,
      hourlyRemaining: usage.hourlyRemaining,
      hourlyUsed: usage.hourlyUsed,
      nextEligibleAt: usage.nextEligibleAt,
    };
  }
}
