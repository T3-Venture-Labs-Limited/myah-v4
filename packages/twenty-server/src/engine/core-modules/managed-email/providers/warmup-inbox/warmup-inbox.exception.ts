import { msg } from '@lingui/core/macro';

import { CustomException } from 'src/utils/custom-exception';

export enum WarmupInboxExceptionCode {
  CONFIGURATION_DISABLED = 'WARMUP_INBOX_CONFIGURATION_DISABLED',
  INVALID_INPUT = 'WARMUP_INBOX_INVALID_INPUT',
  MALFORMED_RESPONSE = 'WARMUP_INBOX_MALFORMED_RESPONSE',
  CONFLICT = 'WARMUP_INBOX_CONFLICT',
  RATE_LIMITED = 'WARMUP_INBOX_RATE_LIMITED',
  REQUEST_FAILED = 'WARMUP_INBOX_REQUEST_FAILED',
  WRITE_OUTCOME_UNCERTAIN = 'WARMUP_INBOX_WRITE_OUTCOME_UNCERTAIN',
  RECONCILIATION_REQUIRED = 'WARMUP_INBOX_RECONCILIATION_REQUIRED',
}

const WARMUP_INBOX_EXCEPTION_DETAILS = {
  [WarmupInboxExceptionCode.CONFIGURATION_DISABLED]: {
    message: 'Managed mailbox warmup is unavailable.',
    userFriendlyMessage: msg`Managed mailbox warmup is unavailable.`,
  },
  [WarmupInboxExceptionCode.INVALID_INPUT]: {
    message: 'The managed mailbox warmup request is invalid.',
    userFriendlyMessage: msg`The managed mailbox warmup request is invalid.`,
  },
  [WarmupInboxExceptionCode.MALFORMED_RESPONSE]: {
    message: 'Managed mailbox warmup returned an invalid response.',
    userFriendlyMessage: msg`Managed mailbox warmup is temporarily unavailable.`,
  },
  [WarmupInboxExceptionCode.CONFLICT]: {
    message: 'Managed mailbox warmup reported a conflicting resource.',
    userFriendlyMessage: msg`The managed mailbox warmup request conflicts with an existing resource.`,
  },
  [WarmupInboxExceptionCode.RATE_LIMITED]: {
    message: 'Managed mailbox warmup is rate limited.',
    userFriendlyMessage: msg`Managed mailbox warmup is temporarily busy.`,
  },
  [WarmupInboxExceptionCode.REQUEST_FAILED]: {
    message: 'Managed mailbox warmup request failed.',
    userFriendlyMessage: msg`Managed mailbox warmup is temporarily unavailable.`,
  },
  [WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN]: {
    message: 'Managed mailbox warmup write outcome is uncertain.',
    userFriendlyMessage: msg`Managed mailbox warmup requires reconciliation.`,
  },
  [WarmupInboxExceptionCode.RECONCILIATION_REQUIRED]: {
    message: 'Managed mailbox warmup requires manual reconciliation.',
    userFriendlyMessage: msg`Managed mailbox warmup requires reconciliation.`,
  },
} as const;

export class WarmupInboxException extends CustomException<WarmupInboxExceptionCode> {
  constructor(code: WarmupInboxExceptionCode) {
    const { message, userFriendlyMessage } =
      WARMUP_INBOX_EXCEPTION_DETAILS[code];

    super(message, code, { userFriendlyMessage });
  }
}
