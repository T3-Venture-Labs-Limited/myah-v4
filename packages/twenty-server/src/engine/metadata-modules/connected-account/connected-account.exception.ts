import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';

import { CustomException } from 'src/utils/custom-exception';

export enum ConnectedAccountExceptionCode {
  CONNECTED_ACCOUNT_NOT_FOUND = 'CONNECTED_ACCOUNT_NOT_FOUND',
  INVALID_CONNECTED_ACCOUNT_INPUT = 'INVALID_CONNECTED_ACCOUNT_INPUT',
  CONNECTED_ACCOUNT_OWNERSHIP_VIOLATION = 'CONNECTED_ACCOUNT_OWNERSHIP_VIOLATION',
  SENDING_POLICY_CONFLICT = 'SENDING_POLICY_CONFLICT',
  SENDING_POLICY_REVISION_CONFLICT = 'SENDING_POLICY_REVISION_CONFLICT',
}

const getConnectedAccountExceptionUserFriendlyMessage = (
  code: ConnectedAccountExceptionCode,
) => {
  switch (code) {
    case ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND:
      return msg`Connected account not found.`;
    case ConnectedAccountExceptionCode.INVALID_CONNECTED_ACCOUNT_INPUT:
      return msg`Invalid connected account input.`;
    case ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_OWNERSHIP_VIOLATION:
      return msg`You do not have access to this connected account.`;
    case ConnectedAccountExceptionCode.SENDING_POLICY_CONFLICT:
      return msg`Wait for active Campaign email work to settle before changing minimum spacing.`;
    case ConnectedAccountExceptionCode.SENDING_POLICY_REVISION_CONFLICT:
      return msg`Sending policy changed. Refresh and try again.`;
    default:
      assertUnreachable(code);
  }
};

export class ConnectedAccountException extends CustomException<ConnectedAccountExceptionCode> {
  constructor(
    message: string,
    code: ConnectedAccountExceptionCode,
    { userFriendlyMessage }: { userFriendlyMessage?: MessageDescriptor } = {},
  ) {
    super(message, code, {
      userFriendlyMessage:
        userFriendlyMessage ??
        getConnectedAccountExceptionUserFriendlyMessage(code),
    });
  }
}
