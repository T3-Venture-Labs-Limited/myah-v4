import { createHash, timingSafeEqual } from 'crypto';

import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';

import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';

const DEPLOYMENT_TOKEN_HEADER = 'x-myah-apps-deployment-token';
const DEPLOYMENT_RATE_LIMIT_MAX = 10;
const DEPLOYMENT_RATE_LIMIT_WINDOW_MS = 60_000;

@Injectable()
export class MyahStandardAppsDeploymentGuard implements CanActivate {
  private readonly logger = new Logger(MyahStandardAppsDeploymentGuard.name);

  constructor(private readonly throttlerService: ThrottlerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const deploymentToken = process.env.MYAH_STANDARD_APPS_DEPLOYMENT_TOKEN;

    if (!deploymentToken) {
      throw new InternalServerErrorException(
        'MYAH_STANDARD_APPS_DEPLOYMENT_TOKEN is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const applicationUniversalIdentifier =
      request.params?.applicationUniversalIdentifier;
    const providedToken = request.headers[DEPLOYMENT_TOKEN_HEADER];

    if (typeof providedToken !== 'string' || providedToken.length === 0) {
      this.logResult(applicationUniversalIdentifier, 'rejected');
      throw new UnauthorizedException();
    }

    try {
      await this.applyRateLimit(providedToken, request.ip);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        this.logResult(applicationUniversalIdentifier, 'rate_limited');
        throw new HttpException(
          'Standard app deployment rate limit reached',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      this.logResult(applicationUniversalIdentifier, 'failed');
      throw new InternalServerErrorException(
        'Standard app deployment rate limiter is unavailable',
      );
    }

    const providedTokenBuffer = Buffer.from(providedToken);
    const deploymentTokenBuffer = Buffer.from(deploymentToken);

    if (
      providedTokenBuffer.length !== deploymentTokenBuffer.length ||
      !timingSafeEqual(providedTokenBuffer, deploymentTokenBuffer)
    ) {
      this.logResult(applicationUniversalIdentifier, 'rejected');
      throw new UnauthorizedException();
    }

    this.logResult(applicationUniversalIdentifier, 'accepted');

    return true;
  }

  private async applyRateLimit(token: string, ip: string | undefined) {
    const tokenFingerprint = createHash('sha256').update(token).digest('hex');
    const clientIp = ip ?? 'unknown';

    await this.throttlerService.tokenBucketThrottleOrThrow(
      `myah-standard-apps:promotion:ip:${clientIp}`,
      1,
      DEPLOYMENT_RATE_LIMIT_MAX,
      DEPLOYMENT_RATE_LIMIT_WINDOW_MS,
    );
    await this.throttlerService.tokenBucketThrottleOrThrow(
      `myah-standard-apps:promotion:token:${tokenFingerprint}`,
      1,
      DEPLOYMENT_RATE_LIMIT_MAX,
      DEPLOYMENT_RATE_LIMIT_WINDOW_MS,
    );
  }

  private logResult(
    applicationUniversalIdentifier: string | undefined,
    result: 'accepted' | 'failed' | 'rate_limited' | 'rejected',
  ) {
    this.logger.log({
      event: 'myah_standard_app_promotion_authorization',
      applicationUniversalIdentifier,
      result,
    });
  }
}
