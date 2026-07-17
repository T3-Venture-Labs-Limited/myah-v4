import { type SafeMetronomeEventProperties } from '../types/safe-metronome-event-properties.type';

export {
  type SafeMetronomeEventProperties,
  type SafeMetronomeEventProperty,
} from '../types/safe-metronome-event-properties.type';

const MAX_PROPERTY_COUNT = 32;
const MAX_PROPERTY_KEY_LENGTH = 64;
const MAX_STRING_VALUE_LENGTH = 256;
const UNSAFE_NORMALIZED_PROPERTY_NAMES = new Set([
  'apikey',
  'authorization',
  'body',
  'content',
  'cookie',
  'credential',
  'email',
  'authorizationheader',
  'emailcontent',
  'message',
  'generatedtext',
  'messagecontent',
  'password',
  'phone',
  'mailboxcontent',
  'prompt',
  'prompttext',
  'raw',
  'rawresponse',
  'response',
  'secret',
  'text',
  'token',
  'userprompt',
  'apikeys',
  'headers',
  'header',
  'messages',
  'prompts',
  'tokens',
  'authorizations',
  'bodies',
  'contents',
  'cookies',
  'credentials',
  'emails',
  'passwords',
  'phones',
  'raws',
  'responses',
  'secrets',
  'texts',
]);

const UNSAFE_PROPERTY_SEGMENTS = new Set([
  'authorization',
  'body',
  'content',
  'cookie',
  'credential',
  'email',
  'header',
  'headers',
  'message',
  'messages',
  'password',
  'phone',
  'prompt',
  'prompts',
  'raw',
  'response',
  'secret',
  'text',
  'token',
  'tokens',
  'authorizations',
  'bodies',
  'contents',
  'cookies',
  'credentials',
  'emails',
  'passwords',
  'phones',
  'raws',
  'responses',
  'secrets',
  'texts',
]);

const UNSAFE_PROPERTY_TOKEN =
  /(?:^|[_-]|(?<=[a-z0-9])(?=[A-Z]))(?:api_?key|authorization|body|content|cookie|credential|email|message|password|phone|prompt|raw|response|secret|text|token(?!Count)|(?:access|auth|refresh|id)[_-]?token)(?=$|[_-]|[A-Z])/;

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
      key.length > MAX_PROPERTY_KEY_LENGTH ||
      isUnsafePropertyName(key) ||
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

const isUnsafePropertyName = (key: string): boolean => {
  const normalizedKey = key.replace(/[\s_-]/g, '').toLowerCase();
  const propertyNameSegments = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((segment) => segment.toLowerCase());

  return (
    normalizedKey.includes('apikey') ||
    UNSAFE_PROPERTY_TOKEN.test(key) ||
    UNSAFE_NORMALIZED_PROPERTY_NAMES.has(normalizedKey) ||
    (normalizedKey !== 'tokencount' &&
      propertyNameSegments.some((segment) =>
        UNSAFE_PROPERTY_SEGMENTS.has(segment),
      )) ||
    /^(?:access|auth|refresh|id)token$/.test(normalizedKey)
  );
};
