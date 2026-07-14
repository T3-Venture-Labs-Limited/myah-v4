import { createHash } from 'crypto';

import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { type MyahPlatformAuthenticatedRequest } from 'src/modules/myah-platform-admin/auth/myah-platform-authenticated-request';
import { MyahPlatformOperatorAuthService } from 'src/modules/myah-platform-admin/auth/myah-platform-operator-auth.service';
import { type MyahPlatformScope } from 'src/modules/myah-platform-admin/auth/myah-platform-scope';
import { MYAH_PLATFORM_SCOPES_METADATA } from 'src/modules/myah-platform-admin/auth/require-myah-platform-scopes.decorator';

const OPERATOR_IP_RATE_LIMIT_MAX = 60;
const OPERATOR_TOKEN_RATE_LIMIT_MAX = 30;
const OPERATOR_RATE_LIMIT_WINDOW_MS = 60_000;
const BEARER_TOKEN_PATTERN = /^Bearer (\S+)$/i;

@Injectable()
export class MyahPlatformOperatorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: MyahPlatformOperatorAuthService,
    private readonly throttlerService: ThrottlerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const requiredScopes = this.reflector.getAllAndOverride<
      MyahPlatformScope[]
    >(MYAH_PLATFORM_SCOPES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredScopes === undefined || requiredScopes.length === 0) {
      throw new InternalServerErrorException(
        'Platform API route has no authorization scope',
      );
    }

    await this.applyRateLimit(
      `myah-platform:operator:ip:${request.ip ?? 'unknown'}`,
      OPERATOR_IP_RATE_LIMIT_MAX,
    );
    const token =
      request.headers.authorization?.match(BEARER_TOKEN_PATTERN)?.[1];
    if (token === undefined) {
      throw new UnauthorizedException(
        'A platform operator bearer token is required',
      );
    }
    const fingerprint = createHash('sha256').update(token).digest('hex');
    await this.applyRateLimit(
      `myah-platform:operator:token:${fingerprint}`,
      OPERATOR_TOKEN_RATE_LIMIT_MAX,
    );

    (request as MyahPlatformAuthenticatedRequest).myahPlatformOperator =
      this.authService.authenticate(token, requiredScopes);
    return true;
  }

  private async applyRateLimit(key: string, maximum: number): Promise<void> {
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        key,
        1,
        maximum,
        OPERATOR_RATE_LIMIT_WINDOW_MS,
      );
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw new HttpException(
          'Platform operator rate limit reached',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new InternalServerErrorException(
        'Platform operator rate limiter is unavailable',
      );
    }
  }
}
