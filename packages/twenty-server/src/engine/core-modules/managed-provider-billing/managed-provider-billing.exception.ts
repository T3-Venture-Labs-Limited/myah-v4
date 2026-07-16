import { msg } from '@lingui/core/macro';

import { CustomException } from 'src/utils/custom-exception';

export enum ManagedProviderBillingExceptionCode {
  INSUFFICIENT_PREPAID_BALANCE = 'MANAGED_PROVIDER_INSUFFICIENT_PREPAID_BALANCE',
  OPERATION_REPLAY_CONFLICT = 'MANAGED_PROVIDER_OPERATION_REPLAY_CONFLICT',
}

export class ManagedProviderBillingException extends CustomException<ManagedProviderBillingExceptionCode> {
  constructor(code: ManagedProviderBillingExceptionCode) {
    super(
      'Insufficient prepaid balance for this managed-provider operation',
      code,
      {
        userFriendlyMessage: msg`Insufficient prepaid balance for this operation.`,
      },
    );
  }
}
