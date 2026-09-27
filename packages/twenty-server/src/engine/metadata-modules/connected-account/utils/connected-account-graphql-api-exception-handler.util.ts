import { assertUnreachable } from 'twenty-shared/utils';

import {
  ForbiddenError,
  NotFoundError,
  UserInputError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';

export const connectedAccountGraphqlApiExceptionHandler = (error: Error) => {
  if (error instanceof ConnectedAccountException) {
    switch (error.code) {
      case ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND:
        throw new NotFoundError(error);
      case ConnectedAccountExceptionCode.INVALID_CONNECTED_ACCOUNT_INPUT:
      case ConnectedAccountExceptionCode.SENDING_POLICY_CONFLICT:
      case ConnectedAccountExceptionCode.SENDING_POLICY_REVISION_CONFLICT:
        throw new UserInputError(error);
      case ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_OWNERSHIP_VIOLATION:
        throw new ForbiddenError(error);
      default: {
        return assertUnreachable(error.code);
      }
    }
  }

  throw error;
};
