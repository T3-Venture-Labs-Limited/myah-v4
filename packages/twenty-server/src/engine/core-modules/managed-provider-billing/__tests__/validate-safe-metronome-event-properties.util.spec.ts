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
    };

    const result = validateSafeMetronomeEventProperties(input);

    expect(result).toEqual({
      operation: 'chat_completion',
      tokenCount: 42,
      succeeded: true,
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
    ['content-style property name', { messageContent: 'hello' }],
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
