import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { SetMyahPlatformFeatureFlagDto } from 'src/modules/myah-platform-admin/dtos/set-myah-platform-feature-flag.dto';
import { type MyahPlatformAuthenticatedRequest } from 'src/modules/myah-platform-admin/auth/myah-platform-authenticated-request';
import { MyahPlatformOperatorGuard } from 'src/modules/myah-platform-admin/auth/myah-platform-operator.guard';
import { MyahPlatformScope } from 'src/modules/myah-platform-admin/auth/myah-platform-scope';
import { RequireMyahPlatformScopes } from 'src/modules/myah-platform-admin/auth/require-myah-platform-scopes.decorator';
import { MyahPlatformOperationStatus } from 'src/modules/myah-platform-admin/entities/myah-platform-operation.entity';
import { MyahPlatformApplicationService } from 'src/modules/myah-platform-admin/services/myah-platform-application.service';
import { MyahPlatformOperationService } from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';
import { MyahPlatformStatusService } from 'src/modules/myah-platform-admin/services/myah-platform-status.service';
import { MyahPlatformWorkspaceService } from 'src/modules/myah-platform-admin/services/myah-platform-workspace.service';

const parseNumber = (
  value: string | undefined,
  fallback: number,
  maximum: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? Math.min(parsed, maximum)
    : fallback;
};

@Controller('myah/platform/v1')
@UseGuards(PublicEndpointGuard, NoPermissionGuard, MyahPlatformOperatorGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class MyahPlatformAdminController {
  constructor(
    private readonly applicationService: MyahPlatformApplicationService,
    private readonly operationService: MyahPlatformOperationService,
    private readonly statusService: MyahPlatformStatusService,
    private readonly workspaceService: MyahPlatformWorkspaceService,
  ) {}

  @Get('status')
  @RequireMyahPlatformScopes(MyahPlatformScope.PLATFORM_READ)
  async getStatus() {
    return this.statusService.getStatus();
  }

  @Get('workspaces')
  @RequireMyahPlatformScopes(MyahPlatformScope.PLATFORM_READ)
  async listWorkspaces(
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('search') search: string | undefined,
  ) {
    return this.workspaceService.listWorkspaces({
      limit: parseNumber(limit, 25, 100),
      offset: parseNumber(offset, 0, Number.MAX_SAFE_INTEGER),
      ...(search === undefined ? {} : { search }),
    });
  }

  @Get('workspaces/:workspaceId/feature-flags')
  @RequireMyahPlatformScopes(MyahPlatformScope.WORKSPACE_FLAGS_READ)
  async getFeatureFlags(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.workspaceService.getFeatureFlags(workspaceId);
  }

  @Post('workspaces/:workspaceId/feature-flags')
  @HttpCode(HttpStatus.OK)
  @RequireMyahPlatformScopes(MyahPlatformScope.WORKSPACE_FLAGS_WRITE)
  async setFeatureFlag(
    @Body() body: SetMyahPlatformFeatureFlagDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Req() request: MyahPlatformAuthenticatedRequest,
  ) {
    return this.workspaceService.setFeatureFlag({
      ...body,
      idempotencyKey: idempotencyKey ?? '',
      operatorId: request.myahPlatformOperator.id,
      workspaceId,
    });
  }

  @Get('applications/:applicationUniversalIdentifier')
  @RequireMyahPlatformScopes(MyahPlatformScope.APPLICATIONS_READ)
  async getApplication(
    @Param('applicationUniversalIdentifier', new ParseUUIDPipe()) id: string,
  ) {
    return this.applicationService.getApplicationStatus(id);
  }

  @Post('applications/:applicationUniversalIdentifier/rollouts')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireMyahPlatformScopes(MyahPlatformScope.APPLICATION_ROLLOUTS_WRITE)
  async rollout(
    @Param('applicationUniversalIdentifier', new ParseUUIDPipe())
    applicationUniversalIdentifier: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: MyahPlatformAuthenticatedRequest,
  ) {
    return this.applicationService.rollout({
      applicationUniversalIdentifier,
      idempotencyKey: idempotencyKey ?? '',
      operatorId: request.myahPlatformOperator.id,
    });
  }

  @Get('operations')
  @RequireMyahPlatformScopes(MyahPlatformScope.OPERATIONS_READ)
  async listOperations(
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('status') status: MyahPlatformOperationStatus | undefined,
  ) {
    return this.operationService.listOperations({
      limit: parseNumber(limit, 25, 100),
      offset: parseNumber(offset, 0, Number.MAX_SAFE_INTEGER),
      ...(status === undefined ? {} : { status }),
    });
  }

  @Get('operations/:id')
  @RequireMyahPlatformScopes(MyahPlatformScope.OPERATIONS_READ)
  async getOperation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.operationService.getOperation(id);
  }
}
