import { msg } from '@lingui/core/macro';

import { CustomException } from 'src/utils/custom-exception';

export enum ManagedProviderBillingExceptionCode {
  INSUFFICIENT_PREPAID_BALANCE = 'MANAGED_PROVIDER_INSUFFICIENT_PREPAID_BALANCE',
  OPERATION_REPLAY_CONFLICT = 'MANAGED_PROVIDER_OPERATION_REPLAY_CONFLICT',
}

const MANAGED_PROVIDER_BILLING_EXCEPTION_DETAILS = {
  [ManagedProviderBillingExceptionCode.INSUFFICIENT_PREPAID_BALANCE]: {
    message: 'Insufficient prepaid balance for this managed-provider operation',
    userFriendlyMessage: msg`Insufficient prepaid balance for this operation.`,
  },
  [ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT]: {
    message:
      'Managed provider operation replay conflicts with the existing operation',
    userFriendlyMessage: msg`This operation conflicts with an existing request. Please use a new request.`,
  },
} as const;

export class ManagedProviderBillingException extends CustomException<ManagedProviderBillingExceptionCode> {
  constructor(code: ManagedProviderBillingExceptionCode) {
    const { message, userFriendlyMessage } =
      MANAGED_PROVIDER_BILLING_EXCEPTION_DETAILS[code];

    super(message, code, { userFriendlyMessage });
  }
}
