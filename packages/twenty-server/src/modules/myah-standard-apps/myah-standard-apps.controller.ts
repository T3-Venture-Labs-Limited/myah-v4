import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { MyahStandardAppsDeploymentGuard } from 'src/modules/myah-standard-apps/guards/myah-standard-apps-deployment.guard';
import {
  type PromoteMyahStandardAppResult,
  MyahStandardAppsService,
} from 'src/modules/myah-standard-apps/myah-standard-apps.service';

@Controller('rest/myah/platform/standard-apps')
export class MyahStandardAppsController {
  private readonly logger = new Logger(MyahStandardAppsController.name);

  constructor(
    private readonly myahStandardAppsService: MyahStandardAppsService,
  ) {}

  @UseGuards(
    MyahStandardAppsDeploymentGuard,
    NoPermissionGuard,
    PublicEndpointGuard,
  )
  @Post(':applicationUniversalIdentifier/promote')
  @HttpCode(HttpStatus.OK)
  async promote(
    @Param('applicationUniversalIdentifier')
    applicationUniversalIdentifier: string,
  ): Promise<PromoteMyahStandardAppResult> {
    try {
      const result = await this.myahStandardAppsService.promoteAndBackfill(
        applicationUniversalIdentifier,
      );

      this.logger.log({
        event: 'myah_standard_app_promotion',
        applicationUniversalIdentifier,
        applicationRegistrationId: result.applicationRegistrationId,
        backfillJobId: result.backfillJobId,
        result: 'queued',
      });

      return result;
    } catch (error) {
      this.logger.error({
        event: 'myah_standard_app_promotion',
        applicationUniversalIdentifier,
        error: error instanceof Error ? error.name : 'UnknownError',
        result: 'failed',
      });

      throw error;
    }
  }
}
