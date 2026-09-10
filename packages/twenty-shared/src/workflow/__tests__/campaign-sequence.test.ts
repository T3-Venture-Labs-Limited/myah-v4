import {
  campaignSequenceSchema,
  insertCampaignSequenceMessage,
  moveCampaignSequenceMessage,
  removeCampaignSequenceMessage,
  validateCampaignSequence,
  type CampaignSequence,
  type CampaignSequenceMessage,
} from '../campaign-sequence';

const textBody =
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello Creator"}]}]}';

const a = {
  id: 'a0000000-0000-4000-8000-000000000001',
  channel: 'EMAIL' as const,
  subject: 'Hello',
  body: textBody,
  files: [],
  replyToThread: false,
};
const b = { ...a, id: 'b0000000-0000-4000-8000-000000000002' };
const c = { ...a, id: 'c0000000-0000-4000-8000-000000000003' };
const sequence: CampaignSequence = {
  schemaVersion: 1,
  messages: [a, b, c],
  delaysSeconds: [86400, 259200],
};

const expectIssue = (
  issues: ReturnType<typeof validateCampaignSequence>,
  code: string,
  path: string,
) => {
  expect(issues).toContainEqual(expect.objectContaining({ code, path }));
};

const getMessageIds = (messages: CampaignSequenceMessage[]) =>
  messages.map((message: CampaignSequenceMessage) => message.id);

describe('campaignSequenceSchema', () => {
  test.each([
    { schemaVersion: 1, messages: [], delaysSeconds: [] },
    { schemaVersion: 1, messages: [a], delaysSeconds: [] },
  ])('accepts structurally valid empty and single-message drafts', (draft) => {
    expect(campaignSequenceSchema.safeParse(draft).success).toBe(true);
  });

  test('canonicalizes UUID spelling and compares IDs canonically', () => {
    const parsed = campaignSequenceSchema.parse({
      schemaVersion: 1,
      messages: [{ ...a, id: 'A0000000-0000-4000-8000-000000000001' }],
      delaysSeconds: [],
    });

    expect(parsed.messages[0].id).toBe(a.id);
    expect(
      campaignSequenceSchema.safeParse({
        schemaVersion: 1,
        messages: [a, { ...b, id: 'A0000000-0000-4000-8000-000000000001' }],
        delaysSeconds: [1],
      }).success,
    ).toBe(false);
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity])(
    'rejects invalid duration %p',
    (duration) => {
      expect(
        campaignSequenceSchema.safeParse({
          schemaVersion: 1,
          messages: [a, b],
          delaysSeconds: [duration],
        }).success,
      ).toBe(false);
    },
  );

  test.each([
    { messages: [], delaysSeconds: [1] },
    { messages: [a], delaysSeconds: [1] },
    { messages: [a, b], delaysSeconds: [] },
    { messages: [a, b], delaysSeconds: [1, 2] },
  ])('rejects a wrong gap count', ({ messages, delaysSeconds }) => {
    expect(
      campaignSequenceSchema.safeParse({
        schemaVersion: 1,
        messages,
        delaysSeconds,
      }).success,
    ).toBe(false);
  });

  test.each([
    {
      name: 'sequence',
      draft: {
        schemaVersion: 1,
        messages: [a],
        delaysSeconds: [],
        recipientId: a.id,
      },
    },
    {
      name: 'email message',
      draft: {
        schemaVersion: 1,
        messages: [{ ...a, accountId: a.id }],
        delaysSeconds: [],
      },
    },
    {
      name: 'Instagram message',
      draft: {
        schemaVersion: 1,
        messages: [
          {
            id: a.id,
            channel: 'INSTAGRAM',
            text: 'Hello',
            threadId: b.id,
          },
        ],
        delaysSeconds: [],
      },
    },
    {
      name: 'workflow file',
      draft: {
        schemaVersion: 1,
        messages: [
          {
            ...a,
            files: [
              {
                id: b.id,
                name: 'brief.pdf',
                size: 42,
                type: 'application/pdf',
                createdAt: '2026-06-01T00:00:00.000Z',
                downloadUrl: 'https://example.com/brief.pdf',
              },
            ],
          },
        ],
        delaysSeconds: [],
      },
    },
  ])('rejects prohibited keys at the $name level', ({ draft }) => {
    expect(campaignSequenceSchema.safeParse(draft).success).toBe(false);
  });
});

describe('campaign sequence positional editing', () => {
  test('moving a message leaves delay positions unchanged', () => {
    const next = moveCampaignSequenceMessage(sequence, 2, 0);

    expect(getMessageIds(next.messages)).toEqual([c.id, a.id, b.id]);
    expect(next.delaysSeconds).toEqual([86400, 259200]);
    expect(getMessageIds(sequence.messages)).toEqual([a.id, b.id, c.id]);
    expect(sequence.delaysSeconds).toEqual([86400, 259200]);
  });

  test('removing a middle message preserves elapsed wait', () => {
    const next = removeCampaignSequenceMessage(sequence, 1);

    expect(getMessageIds(next.messages)).toEqual([a.id, c.id]);
    expect(next.delaysSeconds).toEqual([345600]);
  });

  test('inserting in a gap preserves the prior wait and requires the new wait', () => {
    const next = insertCampaignSequenceMessage(
      {
        schemaVersion: 1,
        messages: [a, c],
        delaysSeconds: [86400],
      },
      1,
      b,
    );

    expect(getMessageIds(next.messages)).toEqual([a.id, b.id, c.id]);
    expect(next.delaysSeconds).toEqual([86400, null]);
  });

  test.each([
    {
      name: 'empty sequence',
      input: { schemaVersion: 1 as const, messages: [], delaysSeconds: [] },
      index: 0,
      message: a,
      expectedIds: [a.id],
      expectedDelays: [],
    },
    {
      name: 'prepend',
      input: {
        schemaVersion: 1 as const,
        messages: [b, c],
        delaysSeconds: [259200],
      },
      index: 0,
      message: a,
      expectedIds: [a.id, b.id, c.id],
      expectedDelays: [null, 259200],
    },
    {
      name: 'append',
      input: {
        schemaVersion: 1 as const,
        messages: [a, b],
        delaysSeconds: [86400],
      },
      index: 2,
      message: c,
      expectedIds: [a.id, b.id, c.id],
      expectedDelays: [86400, null],
    },
  ])(
    'inserts into an $name without modifying input arrays',
    ({ input, index, message, expectedIds, expectedDelays }) => {
      const originalMessages = input.messages;
      const originalDelays = input.delaysSeconds;
      const next = insertCampaignSequenceMessage(input, index, message);

      expect(getMessageIds(next.messages)).toEqual(expectedIds);
      expect(next.delaysSeconds).toEqual(expectedDelays);
      expect(input.messages).toBe(originalMessages);
      expect(input.delaysSeconds).toBe(originalDelays);
      expect(next.messages).not.toBe(originalMessages);
      expect(next.delaysSeconds).not.toBe(originalDelays);
    },
  );

  test.each([
    {
      name: 'first',
      index: 0,
      expectedIds: [b.id, c.id],
      expectedDelays: [259200],
    },
    {
      name: 'last',
      index: 2,
      expectedIds: [a.id, b.id],
      expectedDelays: [86400],
    },
  ])('removes the $name message and its adjacent gap', (testCase) => {
    const next = removeCampaignSequenceMessage(sequence, testCase.index);

    expect(getMessageIds(next.messages)).toEqual(testCase.expectedIds);
    expect(next.delaysSeconds).toEqual(testCase.expectedDelays);
  });

  test('removes the only message', () => {
    const next = removeCampaignSequenceMessage(
      { schemaVersion: 1, messages: [a], delaysSeconds: [] },
      0,
    );

    expect(next).toEqual({ schemaVersion: 1, messages: [], delaysSeconds: [] });
  });

  test.each([
    [null, 10],
    [10, null],
    [null, null],
  ])('keeps an unset combined gap unset', (before, after) => {
    const next = removeCampaignSequenceMessage(
      {
        schemaVersion: 1,
        messages: [a, b, c],
        delaysSeconds: [before, after],
      },
      1,
    );

    expect(next.delaysSeconds).toEqual([null]);
  });

  test('rejects an overflowing combined gap without modifying input', () => {
    const input: CampaignSequence = {
      schemaVersion: 1,
      messages: [a, b, c],
      delaysSeconds: [Number.MAX_SAFE_INTEGER, 1],
    };

    expect(() => removeCampaignSequenceMessage(input, 1)).toThrow(RangeError);
    expect(getMessageIds(input.messages)).toEqual([a.id, b.id, c.id]);
    expect(input.delaysSeconds).toEqual([Number.MAX_SAFE_INTEGER, 1]);
  });

  test.each([-1, 1, 1.5, Number.NaN])(
    'rejects invalid insert index %p for an empty sequence',
    (index) => {
      expect(() =>
        insertCampaignSequenceMessage(
          { schemaVersion: 1, messages: [], delaysSeconds: [] },
          index,
          a,
        ),
      ).toThrow();
    },
  );

  test.each([-1, 3, 1.5, Number.NaN])(
    'rejects invalid move source index %p',
    (index) => {
      expect(() => moveCampaignSequenceMessage(sequence, index, 0)).toThrow();
    },
  );

  test.each([-1, 3, 1.5, Number.NaN])(
    'rejects invalid move destination index %p',
    (index) => {
      expect(() => moveCampaignSequenceMessage(sequence, 0, index)).toThrow();
    },
  );

  test.each([-1, 3, 1.5, Number.NaN])(
    'rejects invalid remove index %p',
    (index) => {
      expect(() => removeCampaignSequenceMessage(sequence, index)).toThrow();
    },
  );
});

describe('validateCampaignSequence', () => {
  test('a structurally safe incomplete draft is not launchable', () => {
    const draft: CampaignSequence = {
      schemaVersion: 1,
      messages: [a, b],
      delaysSeconds: [null],
    };

    expect(campaignSequenceSchema.safeParse(draft).success).toBe(true);
    expectIssue(
      validateCampaignSequence(draft),
      'DELAY_REQUIRED',
      'delaysSeconds.0',
    );
  });

  test('requires at least one message', () => {
    expectIssue(
      validateCampaignSequence({
        schemaVersion: 1,
        messages: [],
        delaysSeconds: [],
      }),
      'EMPTY_SEQUENCE',
      'messages',
    );
  });

  test('requires nonblank email subject and authored body content', () => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [{ ...a, subject: '  ', body: '' }],
      delaysSeconds: [],
    });

    expectIssue(issues, 'CONTENT_REQUIRED', 'messages.0.subject');
    expectIssue(issues, 'CONTENT_REQUIRED', 'messages.0.body');
  });

  test.each([
    '{"type":"doc","content":[]}',
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"   "}]}]}',
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"hardBreak"}]}]}',
  ])('treats an empty supported document as missing content', (body) => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [{ ...a, body }],
      delaysSeconds: [],
    });

    expectIssue(issues, 'CONTENT_REQUIRED', 'messages.0.body');
    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: 'INVALID_EMAIL_BODY' }),
    );
  });

  test.each([
    {
      name: 'variable tag',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variableTag","attrs":{"variable":"{{creator.name}}"}}]}]}',
    },
    {
      name: 'formatting and link attributes',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Bold link","marks":[{"type":"bold"},{"type":"italic"},{"type":"strike"},{"type":"underline"},{"type":"link","attrs":{"href":"https://example.com","target":"_blank","rel":"noopener noreferrer nofollow","class":null}}]}]}]}',
    },
    {
      name: 'marked variable tag',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variableTag","attrs":{"variable":"{{creator.name}}"},"marks":[{"type":"bold"}]}]}]}',
    },
    {
      name: 'marked hard break',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"},{"type":"hardBreak","marks":[{"type":"italic"}]}]}]}',
    },
    {
      name: 'headings and lists',
      body: '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Heading"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Bullet"}]}]}]},{"type":"orderedList","attrs":{"start":3,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Third"}]}]}]}]}',
    },
  ])('accepts a supported $name document', ({ body }) => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [{ ...a, body }],
      delaysSeconds: [],
    });

    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: 'INVALID_EMAIL_BODY' }),
    );
    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: 'CONTENT_REQUIRED' }),
    );
  });

  test.each([
    { name: 'malformed JSON', body: '{"type":"doc"' },
    { name: 'scalar root', body: '42' },
    { name: 'array root', body: '[]' },
    {
      name: 'unsupported node',
      body: '{"type":"doc","content":[{"type":"blockquote","content":[]}]}',
    },
    {
      name: 'unsupported node attribute',
      body: '{"type":"doc","content":[{"type":"paragraph","attrs":{"align":"center"},"content":[]}]}',
    },
    {
      name: 'unsupported mark',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Code","marks":[{"type":"code"}]}]}]}',
    },
    {
      name: 'unsupported link attribute',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://example.com","download":"file"}}]}]}]}',
    },
    {
      name: 'unsupported ordered-list attribute',
      body: '{"type":"doc","content":[{"type":"orderedList","attrs":{"start":1,"reversed":true},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[]}]}]}]}',
    },
    {
      name: 'unsupported variable attribute',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variableTag","attrs":{"variable":"{{creator.name}}","fallback":"Creator"}}]}]}',
    },
    {
      name: 'unsupported mark on a variable tag',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variableTag","attrs":{"variable":"{{creator.name}}"},"marks":[{"type":"code"}]}]}]}',
    },
    {
      name: 'unsupported key on a marked hard break',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"hardBreak","marks":[{"type":"bold"}],"keepOnSplit":true}]}]}',
    },
    {
      name: 'image without authorized content handling',
      body: '{"type":"doc","content":[{"type":"image","attrs":{"src":"https://example.com/image.png","alt":null,"title":null,"width":320,"height":200,"align":"left"}}]}',
    },
  ])('returns an actionable issue for $name', ({ body }) => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [{ ...a, body }],
      delaysSeconds: [],
    });

    expectIssue(issues, 'INVALID_EMAIL_BODY', 'messages.0.body');
  });

  test.each([
    {
      name: 'array',
      body: `${'['.repeat(10000)}0${']'.repeat(10000)}`,
    },
    {
      name: 'object',
      body: `${'{"nested":'.repeat(10000)}0${'}'.repeat(10000)}`,
    },
  ])(
    'returns an issue instead of overflowing on a deeply nested unsupported $name',
    ({ body }) => {
      const issues = validateCampaignSequence({
        schemaVersion: 1,
        messages: [{ ...a, body }],
        delaysSeconds: [],
      });

      expectIssue(issues, 'INVALID_EMAIL_BODY', 'messages.0.body');
    },
  );

  test('validates deeply nested supported list content without overflowing', () => {
    const depth = 10000;
    const body = `{"type":"doc","content":[${'{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Nested"}]},'.repeat(
      depth,
    )}{"type":"paragraph","content":[{"type":"text","text":"Deepest"}]}${']}]}'.repeat(
      depth,
    )}]}`;

    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [{ ...a, body }],
      delaysSeconds: [],
    });

    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: 'INVALID_EMAIL_BODY' }),
    );
    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: 'CONTENT_REQUIRED' }),
    );
  });

  test('rejects a reply without a prior email', () => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [{ ...a, replyToThread: true }],
      delaysSeconds: [],
    });

    expectIssue(
      issues,
      'REPLY_WITHOUT_PRIOR_EMAIL',
      'messages.0.replyToThread',
    );
  });

  test('accepts reply intent when an earlier email exists', () => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [a, { ...b, replyToThread: true }],
      delaysSeconds: [10],
    });

    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: 'REPLY_WITHOUT_PRIOR_EMAIL' }),
    );
  });

  test('reordering can invalidate reply intent', () => {
    const reply = { ...b, replyToThread: true };
    const reordered = moveCampaignSequenceMessage(
      {
        schemaVersion: 1,
        messages: [a, reply],
        delaysSeconds: [10],
      },
      1,
      0,
    );

    expectIssue(
      validateCampaignSequence(reordered),
      'REPLY_WITHOUT_PRIOR_EMAIL',
      'messages.0.replyToThread',
    );
  });

  test('reports blank Instagram content and disabled delivery', () => {
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages: [
        {
          id: a.id,
          channel: 'INSTAGRAM',
          text: '  ',
        },
      ],
      delaysSeconds: [],
    });

    expectIssue(issues, 'CONTENT_REQUIRED', 'messages.0.text');
    expectIssue(issues, 'INSTAGRAM_UNAVAILABLE', 'messages.0.channel');
  });

  test('preserves ordinary and combined emoji without Unicode issues', () => {
    const text = 'Hello 👋🏽 family 👨‍👩‍👧‍👦 café e\u0301';
    const parsed = campaignSequenceSchema.parse({
      schemaVersion: 1,
      messages: [
        {
          id: a.id,
          channel: 'INSTAGRAM',
          text,
        },
      ],
      delaysSeconds: [],
    });

    expect(parsed.messages[0]).toEqual(
      expect.objectContaining({ channel: 'INSTAGRAM', text }),
    );
    expect(validateCampaignSequence(parsed)).not.toContainEqual(
      expect.objectContaining({ code: 'INVALID_UNICODE' }),
    );
  });

  test.each([
    {
      name: 'email subject',
      message: {
        ...a,
        subject: `Hello ${String.fromCharCode(0xd800)}`,
      },
      path: 'messages.0.subject',
    },
    {
      name: 'email body text',
      message: {
        ...a,
        body: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: String.fromCharCode(0xd800) }],
            },
          ],
        }),
      },
      path: 'messages.0.body',
    },
    {
      name: 'Instagram text',
      message: {
        id: a.id,
        channel: 'INSTAGRAM' as const,
        text: String.fromCharCode(0xdc00),
      },
      path: 'messages.0.text',
    },
  ])('rejects a lone UTF-16 surrogate in $name', ({ message, path }) => {
    expectIssue(
      validateCampaignSequence({
        schemaVersion: 1,
        messages: [message],
        delaysSeconds: [],
      }),
      'INVALID_UNICODE',
      path,
    );
  });

  test.each([
    {
      name: 'seconds-to-milliseconds overflow',
      delaysSeconds: [9007199254741],
      expectedPath: 'delaysSeconds.0',
    },
    {
      name: 'cumulative safe-integer overflow',
      delaysSeconds: [Number.MAX_SAFE_INTEGER, 1],
      expectedPath: 'delaysSeconds.1',
    },
  ])('reports $name', ({ delaysSeconds, expectedPath }) => {
    const messages = delaysSeconds.length === 1 ? [a, b] : [a, b, c];
    const issues = validateCampaignSequence({
      schemaVersion: 1,
      messages,
      delaysSeconds,
    });

    expectIssue(issues, 'DURATION_OVERFLOW', expectedPath);
  });
});
