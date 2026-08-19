import { msg } from '@lingui/core/macro';

import { CustomException } from 'src/utils/custom-exception';

export enum IcemailExceptionCode {
  CONFIGURATION_DISABLED = 'ICEMAIL_CONFIGURATION_DISABLED',
  INVALID_INPUT = 'ICEMAIL_INVALID_INPUT',
  MALFORMED_RESPONSE = 'ICEMAIL_MALFORMED_RESPONSE',
  INSUFFICIENT_CREDITS = 'ICEMAIL_INSUFFICIENT_CREDITS',
  CONFLICT = 'ICEMAIL_CONFLICT',
  RATE_LIMITED = 'ICEMAIL_RATE_LIMITED',
  REQUEST_FAILED = 'ICEMAIL_REQUEST_FAILED',
  WRITE_OUTCOME_UNCERTAIN = 'ICEMAIL_WRITE_OUTCOME_UNCERTAIN',
}

export class IcemailException extends CustomException<IcemailExceptionCode> {
  constructor(code: IcemailExceptionCode) {
    const configurationDisabled =
      code === IcemailExceptionCode.CONFIGURATION_DISABLED;
    const invalidInput = code === IcemailExceptionCode.INVALID_INPUT;

    super(
      configurationDisabled
        ? 'Managed Icemail is disabled'
        : invalidInput
          ? 'Managed Icemail input is invalid'
          : 'Managed Icemail request could not be completed',
      code,
      {
        userFriendlyMessage: configurationDisabled
          ? msg`Managed mailbox provisioning is unavailable.`
          : invalidInput
            ? msg`The managed mailbox request is invalid.`
            : msg`Managed mailbox provisioning could not be completed.`,
      },
    );
  }
}
