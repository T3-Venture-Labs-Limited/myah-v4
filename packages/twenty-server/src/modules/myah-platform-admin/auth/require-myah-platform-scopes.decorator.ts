import { SetMetadata } from '@nestjs/common';

import { type MyahPlatformScope } from 'src/modules/myah-platform-admin/auth/myah-platform-scope';

export const MYAH_PLATFORM_SCOPES_METADATA = 'myah-platform-scopes';

export const RequireMyahPlatformScopes = (
  ...scopes: MyahPlatformScope[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(MYAH_PLATFORM_SCOPES_METADATA, scopes);
