import { createHash, timingSafeEqual } from 'crypto';

import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  isMyahPlatformScope,
  type MyahPlatformScope,
} from 'src/modules/myah-platform-admin/auth/myah-platform-scope';

type ConfiguredOperatorKey = {
  id: string;
  tokenSha256: string;
  scopes: MyahPlatformScope[];
  expiresAt?: string;
};

export type MyahPlatformOperator = Pick<ConfiguredOperatorKey, 'id' | 'scopes'>;

const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/;

@Injectable()
export class MyahPlatformOperatorAuthService {
  private cachedConfiguration: {
    rawValue: string;
    keys: ConfiguredOperatorKey[];
  } | null = null;

  authenticate(
    token: string,
    requiredScopes: MyahPlatformScope[],
  ): MyahPlatformOperator {
    const tokenDigest = createHash('sha256').update(token).digest();
    const operatorKey = this.getConfiguredKeys().find((key) =>
      timingSafeEqual(tokenDigest, Buffer.from(key.tokenSha256, 'hex')),
    );

    if (
      operatorKey === undefined ||
      (operatorKey.expiresAt !== undefined &&
        Date.parse(operatorKey.expiresAt) <= Date.now())
    ) {
      throw new UnauthorizedException('Invalid platform operator credential');
    }
    if (requiredScopes.some((scope) => !operatorKey.scopes.includes(scope))) {
      throw new ForbiddenException('Platform operator scope is insufficient');
    }

    return { id: operatorKey.id, scopes: operatorKey.scopes };
  }

  private getConfiguredKeys(): ConfiguredOperatorKey[] {
    const rawValue = process.env.MYAH_PLATFORM_OPERATOR_KEYS;
    if (rawValue === undefined || rawValue.trim() === '') {
      throw new InternalServerErrorException(
        'Platform operator authentication is not configured',
      );
    }
    if (this.cachedConfiguration?.rawValue === rawValue)
      return this.cachedConfiguration.keys;

    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error('Expected a non-empty key list');
      const keys = parsed.map((value) => this.parseKey(value));
      if (
        new Set(keys.map(({ id }) => id)).size !== keys.length ||
        new Set(keys.map(({ tokenSha256 }) => tokenSha256)).size !== keys.length
      ) {
        throw new Error('Operator key ids and token digests must be unique');
      }
      this.cachedConfiguration = { rawValue, keys };
      return keys;
    } catch {
      throw new InternalServerErrorException(
        'Platform operator authentication configuration is invalid',
      );
    }
  }

  private parseKey(value: unknown): ConfiguredOperatorKey {
    if (typeof value !== 'object' || value === null)
      throw new Error('Operator key must be an object');
    const { id, tokenSha256, scopes, expiresAt } = value as Record<
      string,
      unknown
    >;
    if (
      typeof id !== 'string' ||
      id.trim() === '' ||
      typeof tokenSha256 !== 'string' ||
      !SHA_256_HEX_PATTERN.test(tokenSha256) ||
      !Array.isArray(scopes) ||
      scopes.length === 0 ||
      !scopes.every(isMyahPlatformScope) ||
      (expiresAt !== undefined &&
        (typeof expiresAt !== 'string' ||
          !Number.isFinite(Date.parse(expiresAt))))
    ) {
      throw new Error('Operator key has an invalid shape');
    }
    return {
      id,
      tokenSha256,
      scopes,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
  }
}
