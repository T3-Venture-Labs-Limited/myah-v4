type InstagramRecipientSourceField =
  | 'instagramUsername'
  | 'instagramUrl'
  | 'instagramLink';

type ResolveInstagramRecipient = (input: {
  instagramLink: { primaryLinkUrl?: string | null } | null;
  instagramUrl: string | null;
  instagramUsername: string | null;
}) => {
  normalizedUsername: string;
  sourceFields: InstagramRecipientSourceField[];
};

const loadResolver = (): ResolveInstagramRecipient | undefined => {
  try {
    return require('../resolve-instagram-recipient.util')
      .resolveInstagramRecipient as ResolveInstagramRecipient;
  } catch {
    return undefined;
  }
};

const resolve = (input: {
  instagramLink?: { primaryLinkUrl?: string | null } | null;
  instagramUrl?: string | null;
  instagramUsername?: string | null;
}) => {
  const resolver = loadResolver();

  expect(resolver).toBeDefined();

  return resolver!({
    instagramLink: input.instagramLink ?? null,
    instagramUrl: input.instagramUrl ?? null,
    instagramUsername: input.instagramUsername ?? null,
  });
};

describe('resolveInstagramRecipient', () => {
  it('normalizes one leading at-sign, whitespace, profile URLs, and casing across every populated source', () => {
    expect(
      resolve({
        instagramUsername: '  @Creator.Name  ',
        instagramUrl: 'https://www.instagram.com/creator.name/',
        instagramLink: {
          primaryLinkUrl: 'https://instagram.com/CREATOR.NAME?igsh=abc',
        },
      }),
    ).toEqual({
      normalizedUsername: 'creator.name',
      sourceFields: ['instagramUsername', 'instagramUrl', 'instagramLink'],
    });
  });

  it.each([
    ['instagramUsername', { instagramUsername: '@@creator' }],
    ['instagramUsername', { instagramUsername: 'creator name' }],
    ['instagramUrl', { instagramUrl: 'http://instagram.com/creator' }],
    ['instagramUrl', { instagramUrl: 'https://evil.example/creator' }],
    ['instagramUrl', { instagramUrl: 'https://help.instagram.com/creator' }],
    ['instagramUrl', { instagramUrl: 'https://instagram.com/p/post-id' }],
    ['instagramLink', { instagramLink: { primaryLinkUrl: 'not a URL' } }],
  ])('rejects a malformed populated %s value', (field, input) => {
    expect(() => resolve(input)).toThrow(
      `Creator ${field} is not a supported Instagram profile`,
    );
  });

  it('rejects conflicting valid populated sources rather than picking one', () => {
    expect(() =>
      resolve({
        instagramUsername: '@first.creator',
        instagramUrl: 'https://instagram.com/second.creator/',
      }),
    ).toThrow(
      'Creator Instagram fields resolve to different usernames: instagramUsername, instagramUrl',
    );
  });

  it('rejects an empty Creator Instagram identity with a fix-specific error', () => {
    expect(() =>
      resolve({
        instagramUsername: '   ',
        instagramUrl: null,
        instagramLink: { primaryLinkUrl: '' },
      }),
    ).toThrow('Creator needs an Instagram username or profile URL');
  });

  it('uses only populated sources and returns them in canonical field order', () => {
    expect(
      resolve({
        instagramLink: {
          primaryLinkUrl: 'https://www.instagram.com/Only_Link/',
        },
      }),
    ).toEqual({
      normalizedUsername: 'only_link',
      sourceFields: ['instagramLink'],
    });
  });
});
