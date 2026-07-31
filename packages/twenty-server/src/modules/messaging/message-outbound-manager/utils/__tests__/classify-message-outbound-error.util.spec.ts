import { classifyMessageOutboundError } from 'src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util';

describe('classifyMessageOutboundError', () => {
  it.each([{ responseCode: 450 }, { responseCode: 550 }])(
    'classifies an explicit SMTP rejection without exposing it',
    (error) => {
      expect(classifyMessageOutboundError(error)).toEqual({
        kind: 'rejected',
        code: 'provider_rejected',
      });
    },
  );

  it.each([
    undefined,
    null,
    'socket reset',
    new Error('timeout'),
    {},
    { response: {} },
    { response: { status: '500' } },
    { response: { status: 400 } },
    { response: { status: 599 } },
    { statusCode: 429 },
    { response: { status: 'timeout' }, statusCode: 503 },
    { statusCode: 399 },
    { responseCode: 600 },
  ])('classifies an ambiguous failure as unknown', (error) => {
    expect(classifyMessageOutboundError(error)).toEqual({
      kind: 'unknown',
      code: 'unknown',
    });
  });
});
