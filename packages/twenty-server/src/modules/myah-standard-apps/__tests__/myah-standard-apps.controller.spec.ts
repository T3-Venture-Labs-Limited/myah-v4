import {
  type ExecutionContext,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import {
  ThrottlerException,
  ThrottlerExceptionCode,
} from 'src/engine/core-modules/throttler/throttler.exception';
import { type ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

import { BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-standard-apps/myah-standard-apps.constants';
import { MyahStandardAppsController } from 'src/modules/myah-standard-apps/myah-standard-apps.controller';
import { MyahStandardAppsDeploymentGuard } from 'src/modules/myah-standard-apps/guards/myah-standard-apps-deployment.guard';
import { type MyahStandardAppsService } from 'src/modules/myah-standard-apps/myah-standard-apps.service';

describe('Myah standard app deployment trigger', () => {
  const originalEnvironment = process.env;
  const deploymentToken = 'deployment-token';
  const throttlerService = {
    tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<ThrottlerService>;

  const buildContext = (
    token: string | undefined,
    ip = '127.0.0.1',
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-myah-apps-deployment-token': token,
          },
          ip,
        }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      MYAH_STANDARD_APPS_DEPLOYMENT_TOKEN: deploymentToken,
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it('rejects a missing deployment token', async () => {
    const guard = new MyahStandardAppsDeploymentGuard(throttlerService);

    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an incorrect deployment token', async () => {
    const guard = new MyahStandardAppsDeploymentGuard(throttlerService);

    await expect(
      guard.canActivate(buildContext('wrong-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns a rate-limit response without treating the valid token as unauthorized', async () => {
    throttlerService.tokenBucketThrottleOrThrow.mockRejectedValueOnce(
      new ThrottlerException(
        'Limit reached',
        ThrottlerExceptionCode.LIMIT_REACHED,
      ),
    );
    const guard = new MyahStandardAppsDeploymentGuard(throttlerService);

    await expect(
      guard.canActivate(buildContext(deploymentToken)),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('hides unexpected rate-limit infrastructure errors', async () => {
    throttlerService.tokenBucketThrottleOrThrow.mockRejectedValueOnce(
      new Error('cache connection details'),
    );
    const guard = new MyahStandardAppsDeploymentGuard(throttlerService);

    await expect(
      guard.canActivate(buildContext(deploymentToken)),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('accepts the configured deployment token and rate limits its IP and fingerprint', async () => {
    const guard = new MyahStandardAppsDeploymentGuard(throttlerService);

    await expect(
      guard.canActivate(buildContext(deploymentToken, '10.0.0.1')),
    ).resolves.toBe(true);

    expect(throttlerService.tokenBucketThrottleOrThrow).toHaveBeenCalledTimes(
      2,
    );
    expect(throttlerService.tokenBucketThrottleOrThrow).toHaveBeenCalledWith(
      'myah-standard-apps:promotion:ip:10.0.0.1',
      1,
      10,
      60_000,
    );
    const rateLimitKeys =
      throttlerService.tokenBucketThrottleOrThrow.mock.calls.map(
        ([key]) => key,
      );

    expect(rateLimitKeys).toContainEqual(
      expect.stringMatching(
        /^myah-standard-apps:promotion:token:[a-f0-9]{64}$/,
      ),
    );
    expect(rateLimitKeys.join(' ')).not.toContain(deploymentToken);
  });

  it('delegates only the allowlisted application identifier and returns the service result', async () => {
    const result = {
      applicationRegistrationId: 'registration-id',
      backfillJobId: 'backfill-application-installation-registration-id',
    };
    const service = {
      promoteAndBackfill: jest.fn().mockResolvedValue(result),
    } as unknown as MyahStandardAppsService;
    const controller = new MyahStandardAppsController(service);

    await expect(
      controller.promote(BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER),
    ).resolves.toEqual(result);
    expect(service.promoteAndBackfill).toHaveBeenCalledWith(
      BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
    );
  });

  it('applies the deployment guard only to the standard-app promotion endpoint', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MyahStandardAppsController.prototype.promote,
      ),
    ).toEqual([
      PublicEndpointGuard,
      NoPermissionGuard,
      MyahStandardAppsDeploymentGuard,
    ]);
  });
});
