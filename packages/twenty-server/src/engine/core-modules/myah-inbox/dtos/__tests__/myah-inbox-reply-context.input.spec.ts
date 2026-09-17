import {
  ReplyChannel,
  ReplyContextKind,
  validateReplyContextInput,
  validateReplyTargetInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

describe('Myah Inbox reply context input', () => {
  const opaqueContactId = 'opaque-contact-id';
  const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
  const conversationId = '20202020-0b5c-4178-bed7-d371f6411ea9';
  const campaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';

  it('rejects a mixed Email target before decoding repositories', () => {
    expect(() =>
      validateReplyTargetInput({
        channel: ReplyChannel.EMAIL,
        contactId: opaqueContactId,
        threadId,
        conversationId,
      }),
    ).toThrow('Email reply target must not include a conversation ID');
  });

  it.each([
    [
      { channel: ReplyChannel.EMAIL, contactId: opaqueContactId },
      'Email reply target requires a thread ID',
    ],
    [
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId,
        threadId,
      },
      'Instagram reply target must not include a thread ID',
    ],
  ])('rejects invalid target discriminators', (target, message) => {
    expect(() => validateReplyTargetInput(target)).toThrow(message);
  });

  it.each([
    [
      { kind: ReplyContextKind.CAMPAIGN },
      'Campaign reply context requires a Campaign ID',
    ],
    [
      { kind: ReplyContextKind.GENERAL, campaignId },
      'General reply context must not include a Campaign ID',
    ],
  ])('rejects invalid context discriminators', (context, message) => {
    expect(() => validateReplyContextInput(context)).toThrow(message);
  });

  it.each([
    [
      'Email with an omitted non-applicable discriminator',
      { channel: ReplyChannel.EMAIL, contactId: opaqueContactId, threadId },
      { channel: ReplyChannel.EMAIL, contactId: opaqueContactId, threadId },
    ],
    [
      'Email with a null non-applicable discriminator',
      {
        channel: ReplyChannel.EMAIL,
        contactId: opaqueContactId,
        threadId,
        conversationId: null,
      },
      { channel: ReplyChannel.EMAIL, contactId: opaqueContactId, threadId },
    ],
    [
      'Instagram with an omitted non-applicable discriminator',
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId,
      },
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId,
      },
    ],
    [
      'Instagram with a null non-applicable discriminator',
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId,
        threadId: null,
      },
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId,
      },
    ],
  ])('accepts valid target branches', (_label, input, expected) => {
    expect(validateReplyTargetInput(input)).toEqual(expected);
  });

  it.each([
    [
      'Email',
      {
        channel: ReplyChannel.EMAIL,
        contactId: opaqueContactId,
        threadId: null,
      },
    ],
    [
      'Instagram',
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId: null,
      },
    ],
  ])('rejects a null required %s target discriminator', (_label, input) => {
    expect(() => validateReplyTargetInput(input)).toThrow(/requires/);
  });

  it.each([
    ['GENERAL with omitted Campaign ID', { kind: ReplyContextKind.GENERAL }],
    [
      'GENERAL with null Campaign ID',
      { kind: ReplyContextKind.GENERAL, campaignId: null },
    ],
    [
      'CAMPAIGN with Campaign ID',
      { kind: ReplyContextKind.CAMPAIGN, campaignId },
    ],
  ])('accepts valid context branches: %s', (_label, input) => {
    expect(validateReplyContextInput(input)).toEqual(
      input.kind === ReplyContextKind.GENERAL
        ? { kind: ReplyContextKind.GENERAL }
        : { kind: ReplyContextKind.CAMPAIGN, campaignId },
    );
  });

  it('rejects a null required Campaign discriminator', () => {
    expect(() =>
      validateReplyContextInput({
        kind: ReplyContextKind.CAMPAIGN,
        campaignId: null,
      }),
    ).toThrow('Campaign reply context requires a Campaign ID');
  });

  it.each([
    [
      { channel: ReplyChannel.EMAIL, contactId: 'x'.repeat(513), threadId },
      'Invalid reply target contact ID',
    ],
    [
      {
        channel: ReplyChannel.EMAIL,
        contactId: opaqueContactId,
        threadId: 'not-a-uuid',
      },
      'Invalid reply target thread ID',
    ],
    [
      {
        channel: ReplyChannel.INSTAGRAM,
        contactId: opaqueContactId,
        conversationId: 'not-a-uuid',
      },
      'Invalid reply target conversation ID',
    ],
    [
      { channel: 'UNKNOWN', contactId: opaqueContactId, threadId },
      'Invalid reply target channel',
    ],
  ])('rejects malformed target values', (input, message) => {
    expect(() => validateReplyTargetInput(input as never)).toThrow(message);
  });

  it.each([
    [
      { kind: ReplyContextKind.CAMPAIGN, campaignId: 'not-a-uuid' },
      'Invalid reply context Campaign ID',
    ],
    [{ kind: 'UNKNOWN' }, 'Invalid reply context kind'],
  ])('rejects malformed context values', (input, message) => {
    expect(() => validateReplyContextInput(input as never)).toThrow(message);
  });
});
