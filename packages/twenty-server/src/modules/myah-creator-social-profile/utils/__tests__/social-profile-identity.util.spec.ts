import {
  normalizeSocialProfileIdentity,
  resolveSocialProfileIdentityMatch,
  socialProfileDisplayName,
  type SocialProfileIdentityRecord,
} from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

const profile = (
  overrides: Partial<SocialProfileIdentityRecord> = {},
): SocialProfileIdentityRecord => ({
  id: 'profile-1',
  creatorId: 'creator-1',
  platform: 'INSTAGRAM',
  normalizedLocator: 'handle:creator.name',
  platformAccountId: null,
  ...overrides,
});

describe('social profile identity', () => {
  it.each([
    [
      { platform: 'instagram', handle: '  @Creator.Name  ' },
      'INSTAGRAM',
      'handle:creator.name',
      'https://www.instagram.com/creator.name/',
    ],
    [
      {
        platform: 'instagram',
        profileUrl: 'https://instagram.com/Creator.Name',
      },
      'INSTAGRAM',
      'handle:creator.name',
      'https://www.instagram.com/creator.name/',
    ],
    [
      {
        platform: 'tiktok',
        profileUrl: 'https://www.tiktok.com/@Creator.Name/',
      },
      'TIKTOK',
      'handle:creator.name',
      'https://www.tiktok.com/@creator.name',
    ],
    [
      { platform: 'twitter', profileUrl: 'https://twitter.com/Creator_Name/' },
      'TWITTER',
      'handle:creator_name',
      'https://x.com/creator_name',
    ],
    [
      {
        platform: 'youtube',
        profileUrl: 'https://youtube.com/channel/UCAbC123',
      },
      'YOUTUBE',
      'url:https://www.youtube.com/channel/UCAbC123',
      'https://www.youtube.com/channel/UCAbC123',
    ],
  ])(
    'normalizes known platform identities',
    (input, platform, locator, url) => {
      expect(normalizeSocialProfileIdentity(input)).toMatchObject({
        platform,
        normalizedLocator: locator,
        profileUrl: url,
      });
    },
  );

  it('derives a non-null label for URL-only profiles', () => {
    expect(
      socialProfileDisplayName(
        normalizeSocialProfileIdentity({
          platform: 'youtube',
          profileUrl: 'https://youtube.com/channel/UCAbC123',
        }),
      ),
    ).toBe('YOUTUBE profile');
  });

  it.each([
    { platform: 'unknown', handle: 'creator' },
    { platform: 'instagram', handle: 'creator name' },
    { platform: 'instagram' },
    {
      platform: 'instagram',
      handle: 'one',
      profileUrl: 'https://instagram.com/two',
    },
  ])(
    'rejects unknown, malformed, missing or contradictory identity',
    (input) => {
      expect(() => normalizeSocialProfileIdentity(input)).toThrow();
    },
  );

  it('matches locator-only input to an ID-bearing profile', () => {
    const existing = profile({ platformAccountId: 'ig-1' });

    expect(
      resolveSocialProfileIdentityMatch({
        creatorId: 'creator-1',
        identity: normalizeSocialProfileIdentity({
          platform: 'instagram',
          handle: '@Creator.Name',
        }),
        byPlatformAccountId: null,
        byNormalizedLocator: existing,
      }),
    ).toEqual({ profile: existing, enrichPlatformAccountId: false });
  });

  it('enriches a locator-only profile when a stable ID arrives', () => {
    const existing = profile();

    expect(
      resolveSocialProfileIdentityMatch({
        creatorId: 'creator-1',
        identity: normalizeSocialProfileIdentity({
          platform: 'instagram',
          handle: '@creator.name',
          platformAccountId: ' ig-1 ',
        }),
        byPlatformAccountId: null,
        byNormalizedLocator: existing,
      }),
    ).toEqual({ profile: existing, enrichPlatformAccountId: true });
  });

  it('rejects contradictory ID and locator matches', () => {
    expect(() =>
      resolveSocialProfileIdentityMatch({
        creatorId: 'creator-1',
        identity: normalizeSocialProfileIdentity({
          platform: 'instagram',
          handle: '@creator.name',
          platformAccountId: 'ig-1',
        }),
        byPlatformAccountId: profile({
          id: 'profile-by-id',
          normalizedLocator: 'handle:other',
          platformAccountId: 'ig-1',
        }),
        byNormalizedLocator: profile({ id: 'profile-by-locator' }),
      }),
    ).toThrow('different social profiles');
  });

  it('rejects a stable ID that contradicts the locator-owned profile', () => {
    expect(() =>
      resolveSocialProfileIdentityMatch({
        creatorId: 'creator-1',
        identity: normalizeSocialProfileIdentity({
          platform: 'instagram',
          handle: '@creator.name',
          platformAccountId: 'ig-new',
        }),
        byPlatformAccountId: null,
        byNormalizedLocator: profile({ platformAccountId: 'ig-old' }),
      }),
    ).toThrow('stable account ID');
  });

  it('rejects cross-Creator ownership instead of merging', () => {
    expect(() =>
      resolveSocialProfileIdentityMatch({
        creatorId: 'creator-2',
        identity: normalizeSocialProfileIdentity({
          platform: 'instagram',
          handle: '@creator.name',
        }),
        byPlatformAccountId: null,
        byNormalizedLocator: profile(),
      }),
    ).toThrow('another Creator');
  });

  it('returns no match for a second same-platform account', () => {
    expect(
      resolveSocialProfileIdentityMatch({
        creatorId: 'creator-1',
        identity: normalizeSocialProfileIdentity({
          platform: 'instagram',
          handle: '@second.account',
        }),
        byPlatformAccountId: null,
        byNormalizedLocator: null,
      }),
    ).toEqual({ profile: null, enrichPlatformAccountId: false });
  });
});
