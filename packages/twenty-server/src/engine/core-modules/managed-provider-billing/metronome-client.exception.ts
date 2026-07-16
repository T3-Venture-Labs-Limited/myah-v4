import { msg } from '@lingui/core/macro';

import { CustomException } from 'src/utils/custom-exception';

export enum MetronomeClientExceptionCode {
  CONFIGURATION_DISABLED = 'METRONOME_CONFIGURATION_DISABLED',
  CONFLICT = 'METRONOME_CONFLICT',
  CREATE_OUTCOME_UNCERTAIN = 'METRONOME_CREATE_OUTCOME_UNCERTAIN',
  REQUEST_FAILED = 'METRONOME_REQUEST_FAILED',
  RATE_LIMITED = 'METRONOME_RATE_LIMITED',
  UNSAFE_EVENT_PROPERTIES = 'METRONOME_UNSAFE_EVENT_PROPERTIES',
}

export class MetronomeClientException extends CustomException<MetronomeClientExceptionCode> {
  constructor(code: MetronomeClientExceptionCode) {
    const isConfigurationDisabled =
      code === MetronomeClientExceptionCode.CONFIGURATION_DISABLED;

    super(
      isConfigurationDisabled
        ? 'Metronome managed-provider billing is disabled'
        : 'Metronome managed-provider request failed',
      code,
      {
        userFriendlyMessage: isConfigurationDisabled
          ? msg`Managed-provider billing is unavailable.`
          : msg`Managed-provider billing could not be completed.`,
      },
    );
  }
}
