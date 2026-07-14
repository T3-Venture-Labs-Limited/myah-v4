import { createHash } from 'crypto';

import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { MyahPlatformOperatorAuthService } from 'src/modules/myah-platform-admin/auth/myah-platform-operator-auth.service';
import { MyahPlatformScope } from 'src/modules/myah-platform-admin/auth/myah-platform-scope';

describe('MyahPlatformOperatorAuthService', () => {
  const originalConfiguration = process.env.MYAH_PLATFORM_OPERATOR_KEYS;

  afterEach(() => {
    if (originalConfiguration === undefined)
      delete process.env.MYAH_PLATFORM_OPERATOR_KEYS;
    else process.env.MYAH_PLATFORM_OPERATOR_KEYS = originalConfiguration;
  });

  it('authenticates a valid token with an authorized scope', () => {
    const token = 'operator-secret';
    process.env.MYAH_PLATFORM_OPERATOR_KEYS = JSON.stringify([
      {
        id: 'deployment',
        tokenSha256: createHash('sha256').update(token).digest('hex'),
        scopes: [MyahPlatformScope.PLATFORM_READ],
      },
    ]);
    expect(
      new MyahPlatformOperatorAuthService().authenticate(token, [
        MyahPlatformScope.PLATFORM_READ,
      ]),
    ).toEqual({ id: 'deployment', scopes: [MyahPlatformScope.PLATFORM_READ] });
  });

  it('rejects missing configuration, invalid tokens, and unauthorized scopes', () => {
    delete process.env.MYAH_PLATFORM_OPERATOR_KEYS;
    expect(() =>
      new MyahPlatformOperatorAuthService().authenticate('token', []),
    ).toThrow(InternalServerErrorException);
    process.env.MYAH_PLATFORM_OPERATOR_KEYS = JSON.stringify([
      {
        id: 'deployment',
        tokenSha256: createHash('sha256')
          .update('operator-secret')
          .digest('hex'),
        scopes: [MyahPlatformScope.PLATFORM_READ],
      },
    ]);
    expect(() =>
      new MyahPlatformOperatorAuthService().authenticate('wrong-token', []),
    ).toThrow(UnauthorizedException);
    expect(() =>
      new MyahPlatformOperatorAuthService().authenticate('operator-secret', [
        MyahPlatformScope.APPLICATION_ROLLOUTS_WRITE,
      ]),
    ).toThrow(ForbiddenException);
  });
});
