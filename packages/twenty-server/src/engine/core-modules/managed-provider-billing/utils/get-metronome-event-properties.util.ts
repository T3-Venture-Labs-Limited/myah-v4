import { createHash } from 'node:crypto';

import { type SafeMetronomeEventProperties } from '../types/safe-metronome-event-properties.type';
import { validateSafeMetronomeEventProperties } from './validate-safe-metronome-event-properties.util';

const METRONOME_OPERATION_ID_PREFIX = 'managed-operation:';

export const getMetronomeOperationId = (sourceId: string): string => {
  if (sourceId.trim() === '') {
    throw new Error(
      'Managed provider Metronome operation identity is incomplete',
    );
  }

  return `${METRONOME_OPERATION_ID_PREFIX}${createHash('sha256')
    .update(sourceId)
    .digest('hex')}`;
};

export const getMetronomeEventProperties = (
  auditProperties: Record<string, unknown>,
  operationId: string,
): SafeMetronomeEventProperties => {
  const chargeCentUnit = auditProperties.charge_cent_unit;
  const modelId = auditProperties.model_id;
  const tariffVersion = auditProperties.tariff_version;

  if (
    typeof chargeCentUnit !== 'string' ||
    typeof modelId !== 'string' ||
    typeof tariffVersion !== 'string'
  ) {
    throw new Error('Managed provider Metronome properties are incomplete');
  }

  return validateSafeMetronomeEventProperties({
    charge_cent_unit: chargeCentUnit,
    model_id: modelId,
    tariff_version: tariffVersion,
    operation_id: getMetronomeOperationId(operationId),
  });
};
