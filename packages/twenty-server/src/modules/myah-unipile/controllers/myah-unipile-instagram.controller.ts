import {
  BadRequestException,
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
import { z } from 'zod';

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

const hostedAuthNotificationSchema = z.object({
  attemptId: z.uuid(),
  body: z
    .object({
      // Use the existing webhook identifier ceiling; preserve opaque identity exactly.
      account_id: z
        .string()
        .min(1)
        .max(512)
        .refine((value) => value.trim().length > 0),
      // createHostedAuthAttempt emits randomBytes(32).toString('hex').
      name: z
        .string()
        .length(64)
        .regex(/^[0-9a-f]+$/),
      status: z.enum(['CREATION_SUCCESS', 'RECONNECTED']),
    })
    .strict(),
});

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
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const notification = hostedAuthNotificationSchema.safeParse({
      attemptId,
      body,
    });

    if (!notification.success) {
      throw new BadRequestException('Invalid Hosted Auth notification');
    }

    await this.hostedAuthService.processNotification({
      accountId: notification.data.body.account_id,
      attemptId: notification.data.attemptId,
      name: notification.data.body.name,
      status: notification.data.body.status,
    });

    return { ok: true };
  }
}
