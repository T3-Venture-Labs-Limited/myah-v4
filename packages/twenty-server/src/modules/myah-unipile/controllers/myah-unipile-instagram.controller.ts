import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionFlagType } from 'twenty-shared/constants';

import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UnipileHostedAuthService } from 'src/modules/myah-unipile/services/unipile-hosted-auth.service';
import {
  UnipileInstagramAccountService,
  type WorkspaceInstagramAccountStatus,
} from 'src/modules/myah-unipile/services/unipile-instagram-account.service';

type HostedAuthNotificationBody = {
  account_id: string;
  name: string;
  status: 'CREATION_SUCCESS' | 'RECONNECTED';
};

@Controller('rest/myah/unipile/instagram')
@UseGuards(
  JwtAuthGuard,
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
)
export class MyahUnipileInstagramController {
  constructor(
    private readonly hostedAuthService: UnipileHostedAuthService,
    private readonly accountService: UnipileInstagramAccountService,
  ) {}

  @Get('account')
  async getAccount(
    @AuthWorkspace() workspace: FlatWorkspace,
  ): Promise<WorkspaceInstagramAccountStatus | null> {
    return this.accountService.getWorkspaceAccountStatus(workspace.id);
  }

  @Get('hosted-auth/:attemptId/status')
  async getHostedAuthAttemptStatus(
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('attemptId') attemptId: string,
  ): Promise<{
    attemptId: string;
    status: string;
    failureCode: string | null;
    failureReason: string | null;
  }> {
    return this.hostedAuthService.getAttemptStatus({
      attemptId,
      workspaceId: workspace.id,
      userWorkspaceId,
    });
  }

  @Post('hosted-auth/connect')
  async connect(
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<{ attemptId: string; redirectUrl: string }> {
    const attempt = await this.hostedAuthService.createConnectionAttempt({
      userWorkspaceId,
      workspaceId: workspace.id,
    });

    return { attemptId: attempt.attemptId, redirectUrl: attempt.url };
  }

  @Post('hosted-auth/reconnect')
  async reconnect(
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<{ attemptId: string; redirectUrl: string }> {
    const attempt = await this.hostedAuthService.createReconnectAttempt({
      userWorkspaceId,
      workspaceId: workspace.id,
    });

    return { attemptId: attempt.attemptId, redirectUrl: attempt.url };
  }

  @Post('disconnect')
  async disconnect(
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<{ status: 'DISCONNECTED' | 'PENDING_RECOVERY' }> {
    return this.accountService.disconnectAccount({
      userWorkspaceId,
      workspaceId: workspace.id,
    });
  }
}

@Controller('rest/myah/unipile/instagram')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class MyahUnipileInstagramPublicController {
  constructor(private readonly hostedAuthService: UnipileHostedAuthService) {}

  @Post('hosted-auth/:attemptId/notify')
  @HttpCode(HttpStatus.OK)
  async notifyHostedAuth(
    @Param('attemptId') attemptId: string,
    @Body() body: HostedAuthNotificationBody,
  ): Promise<{ ok: true }> {
    await this.hostedAuthService.processNotification({
      accountId: body.account_id,
      attemptId,
      name: body.name,
      status: body.status,
    });

    return { ok: true };
  }
}
