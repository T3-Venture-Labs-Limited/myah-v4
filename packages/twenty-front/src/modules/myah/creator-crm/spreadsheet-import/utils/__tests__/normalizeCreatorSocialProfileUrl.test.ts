import { normalizeCreatorSocialProfileUrl } from '@/myah/creator-crm/spreadsheet-import/utils/normalizeCreatorSocialProfileUrl';

describe('normalizeCreatorSocialProfileUrl', () => {
  it.each([
    [
      'instagram' as const,
      'https://www.instagram.com/Ada/?utm_source=csv#bio',
      'https://instagram.com/Ada',
    ],
    [
      'tiktok' as const,
      'https://www.tiktok.com/@Ada/',
      'https://tiktok.com/@Ada',
    ],
    [
      'youtube' as const,
      'https://www.youtube.com/channel/UCAbC123/?view=1',
      'https://youtube.com/channel/UCAbC123',
    ],
    [
      'twitter' as const,
      'https://twitter.com/Ada/#profile',
      'https://x.com/Ada',
    ],
  ])('canonicalizes %s profile URLs', (provider, value, expected) => {
    expect(normalizeCreatorSocialProfileUrl(provider, value)).toBe(expected);
  });

  it.each([
    ['instagram' as const, 'http://instagram.com/ada'],
    ['instagram' as const, 'https://example.com/ada'],
    ['youtube' as const, 'https://youtube.com/watch?v=video'],
    ['youtube' as const, 'https://youtube.com/shorts/video'],
    ['twitter' as const, 'not-a-url'],
  ])('rejects invalid %s profile URLs', (provider, value) => {
    expect(normalizeCreatorSocialProfileUrl(provider, value)).toBeUndefined();
  });

  it('preserves case-sensitive path data', () => {
    expect(
      normalizeCreatorSocialProfileUrl(
        'youtube',
        'https://youtube.com/channel/UCAbCdEf',
      ),
    ).toBe('https://youtube.com/channel/UCAbCdEf');
  });
});
