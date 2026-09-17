import { validate } from 'class-validator';
import {
  MyahInboxReplyContextOptionsInput,
  validateReplyContextOptionsInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-options.input';
import { ReplyChannel } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

const input = {
  expectedWorkspaceId: '20202020-0b5c-4178-bed7-d371f6411eaa',
  target: {
    channel: ReplyChannel.EMAIL,
    contactId: 'opaque-contact',
    threadId: '20202020-0b5c-4178-bed7-d371f6411eab',
  },
};

describe('MyahInboxReplyContextOptionsInput', () => {
  it('defaults to 25 and accepts at most 100 options', () => {
    expect(validateReplyContextOptionsInput(input).first).toBe(25);
    expect(
      validateReplyContextOptionsInput({ ...input, first: 100 }).first,
    ).toBe(100);
  });
  it.each([0, -1, 101, 1.5, NaN])('rejects invalid first %s', async (first) => {
    expect(() =>
      validateReplyContextOptionsInput({ ...input, first }),
    ).toThrow();
    expect(
      await validate(
        Object.assign(new MyahInboxReplyContextOptionsInput(), input, {
          first,
        }),
      ),
    ).not.toEqual([]);
  });
  it.each([undefined, null, 'not-uuid'])(
    'requires expected workspace %s',
    (expectedWorkspaceId) => {
      expect(() =>
        validateReplyContextOptionsInput({
          ...input,
          expectedWorkspaceId,
        } as never),
      ).toThrow();
    },
  );
  it.each(['', 'not a cursor', 'a'.repeat(2049)])(
    'rejects invalid cursor',
    (after) => {
      expect(() =>
        validateReplyContextOptionsInput({ ...input, after }),
      ).toThrow();
    },
  );
  it.each([
    { ...input.target, conversationId: input.target.threadId },
    {
      channel: ReplyChannel.INSTAGRAM,
      contactId: 'opaque',
      conversationId: input.target.threadId,
    },
    { ...input.target, threadId: 'invalid' },
  ])('rejects nonexact or non-Email targets', (target) => {
    expect(() =>
      validateReplyContextOptionsInput({ ...input, target }),
    ).toThrow();
  });
});
