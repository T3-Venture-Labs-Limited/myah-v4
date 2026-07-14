import { type Request } from 'express';

import { type MyahPlatformOperator } from 'src/modules/myah-platform-admin/auth/myah-platform-operator-auth.service';

export type MyahPlatformAuthenticatedRequest = Request & {
  myahPlatformOperator: MyahPlatformOperator;
};
