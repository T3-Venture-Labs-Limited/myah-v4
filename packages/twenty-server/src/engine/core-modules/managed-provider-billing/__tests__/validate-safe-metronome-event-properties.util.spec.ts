import {
  validateSafeMetronomeEventProperties,
  type SafeMetronomeEventProperties,
} from '../utils/validate-safe-metronome-event-properties.util';

describe('validateSafeMetronomeEventProperties', () => {
  it('returns a fresh normalized map of bounded primitive dimensions', () => {
    const input = {
      operation: 'chat_completion',
      tokenCount: 42,
      succeeded: true,
      apiCallCount: 4,
      contextWindow: 128_000,
      drawCount: 2,
    };

    const result = validateSafeMetronomeEventProperties(input);

    expect(result).toEqual({
      operation: 'chat_completion',
      tokenCount: 42,
      succeeded: true,
      apiCallCount: 4,
      contextWindow: 128_000,
      drawCount: 2,
    } satisfies SafeMetronomeEventProperties);
    expect(result).not.toBe(input);

    input.operation = 'mutated';
    expect(result.operation).toBe('chat_completion');
  });

  it.each([
    ['nested object', { operation: { name: 'chat_completion' } }],
    ['array', { operation: ['chat_completion'] }],
    ['non-finite number', { amount: Number.POSITIVE_INFINITY }],
    ['sensitive property name', { apiKey: 'secret' }],
    ['bare token property name', { token: 'secret' }],
    ['compound prompt property name', { promptText: 'secret' }],
    ['oversized property key', { ['x'.repeat(65)]: 'value' }],
    ['lowercase prompt property name', { userprompt: 'secret' }],
    ['lowercase response property name', { rawresponse: 'secret' }],
    ['content-style property name', { messageContent: 'hello' }],
    ['generated camel content property name', { generatedText: 'secret' }],
    ['mailbox camel content property name', { mailboxContent: 'secret' }],
    ['authorization camel credential property name', { authorizationHeader: 'secret' }],
    ['credential token property name', { accessToken: 'secret' }],
    ['uppercase snake content property name', { CONTENT_VALUE: 'secret' }],
    ['uppercase snake authorization property name', { AUTHORIZATION_HEADER: 'secret' }],
    ['oversized string value', { operation: 'x'.repeat(257) }],
    [
      'too many keys',
      Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [`dimension${index}`, index]),
      ),
    ],
  ])('rejects %s', (_, properties) => {
    expect(() => validateSafeMetronomeEventProperties(properties)).toThrow(
      'Unsafe Metronome event properties',
    );
  });
});
