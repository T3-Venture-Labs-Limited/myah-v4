import { type SafeMetronomeEventProperties } from '../types/safe-metronome-event-properties.type';

export {
  type SafeMetronomeEventProperties,
  type SafeMetronomeEventProperty,
} from '../types/safe-metronome-event-properties.type';

const MAX_PROPERTY_COUNT = 32;
const MAX_STRING_VALUE_LENGTH = 256;
const UNSAFE_PROPERTY_NAME = /^(?:api_?key|authorization|body|content|cookie|credential|email|message(?:_?content)?|password|phone|prompt|secret|text|token)$/i;

export const validateSafeMetronomeEventProperties = (
  properties: Record<string, unknown>,
): SafeMetronomeEventProperties => {
  const entries = Object.entries(properties);

  if (entries.length > MAX_PROPERTY_COUNT) {
    throw new Error('Unsafe Metronome event properties');
  }

  const normalizedProperties: SafeMetronomeEventProperties = {};

  for (const [key, value] of entries) {
    if (
      UNSAFE_PROPERTY_NAME.test(key) ||
      (typeof value === 'string' && value.length > MAX_STRING_VALUE_LENGTH) ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      (typeof value !== 'boolean' &&
        typeof value !== 'number' &&
        typeof value !== 'string')
    ) {
      throw new Error('Unsafe Metronome event properties');
    }

    normalizedProperties[key] = value;
  }

  return normalizedProperties;
};
