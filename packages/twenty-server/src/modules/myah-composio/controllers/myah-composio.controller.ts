import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { PermissionFlagType } from 'twenty-shared/constants';
import {
  MyahComposioService,
  buildInstagramComposioUserId,
} from 'src/modules/myah-composio/services/myah-composio.service';

@Controller('rest/myah/instagram')
@UseGuards(
  JwtAuthGuard,
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
)
export class MyahComposioController {
  constructor(private readonly myahComposioService: MyahComposioService) {}

  @Get('accounts')
  async listInstagramAccounts(@AuthWorkspace() workspace: FlatWorkspace) {
    return {
      accounts: await this.myahComposioService.listInstagramAccounts({
        userId: buildInstagramComposioUserId(workspace.id),
        workspace,
      }),
    };
  }

  @Post('oauth-link')
  async startInstagramOAuth(
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() _userWorkspaceId: string,
  ) {
    const serverUrl = process.env.SERVER_URL?.trim();
    const callbackUrl = serverUrl
      ? `${serverUrl}/settings/accounts/instagram?connection=instagram`
      : undefined;

    return this.myahComposioService.startInstagramOAuth({
      userId: buildInstagramComposioUserId(workspace.id),
      callbackUrl,
    });
  }
}
