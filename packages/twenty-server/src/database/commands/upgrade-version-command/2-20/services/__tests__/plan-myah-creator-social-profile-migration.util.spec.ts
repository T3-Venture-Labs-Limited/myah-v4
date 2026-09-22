import { planMyahCreatorSocialProfileMigration } from 'src/database/commands/upgrade-version-command/2-20/services/plan-myah-creator-social-profile-migration.util';

describe('planMyahCreatorSocialProfileMigration', () => {
  it('maps multiple platform identities and preserves supplementary values once', () => {
    const plan = planMyahCreatorSocialProfileMigration({
      row: {
        id: 'creator-1',
        gender: 'NON_BINARY',
        notes: 'Prefers email',
        instagramUrl: 'https://instagram.com/Ada',
        instagramLinkPrimaryLinkUrl: 'https://instagram.com/Ada',
        instagramUsername: '@Ada',
        instagramFollowerCount: '1200',
        instagramEngagementPercent: '4.2',
        tiktokUsername: '@ada.dev',
        tiktokFollowerCount: 900,
        twitchUrl: 'https://twitch.tv/ada_dev',
        twitchTotalFollowers: 300,
        patreonUrl: 'https://patreon.com/ada-dev',
      },
    });

    expect(plan.conflicts).toEqual([]);
    expect(plan.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: 'INSTAGRAM',
          handle: 'ada',
          followerCount: 1200,
          followerCountObservedAt: null,
        }),
        expect.objectContaining({
          platform: 'TIKTOK',
          handle: 'ada.dev',
          followerCount: 900,
        }),
        expect.objectContaining({
          platform: 'TWITCH',
          handle: 'ada_dev',
          followerCount: 300,
        }),
        expect.objectContaining({ platform: 'PATREON', handle: 'ada-dev' }),
      ]),
    );
    expect(plan.noteMarkdown).toContain('**gender**: NON_BINARY');
    expect(plan.noteMarkdown).toContain('**notes**: Prefers email');
    expect(plan.noteMarkdown).toContain(
      '**instagramEngagementPercent**: 4.2',
    );
    expect(plan.sourceDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('fails the affected platform closed for contradictory URL and LINKS values', () => {
    const plan = planMyahCreatorSocialProfileMigration({
      row: {
        id: 'creator-1',
        instagramUrl: 'https://instagram.com/one',
        instagramLinkPrimaryLinkUrl: 'https://instagram.com/two',
        tiktokUsername: 'valid_account',
      },
    });

    expect(plan.conflicts).toEqual([
      'INSTAGRAM: instagramUrl conflicts with instagramLinkPrimaryLinkUrl',
    ]);
    expect(plan.profiles.map(({ platform }) => platform)).toEqual(['TIKTOK']);
  });

  it('accepts equivalent normalized legacy URL and LINKS values', () => {
    const plan = planMyahCreatorSocialProfileMigration({
      row: {
        id: 'creator-1',
        instagramUrl: 'https://instagram.com/Ada',
        instagramLinkPrimaryLinkUrl: 'https://www.instagram.com/ada/',
      },
    });

    expect(plan.conflicts).toEqual([]);
    expect(plan.profiles).toHaveLength(1);
    expect(plan.profiles[0]?.normalizedLocator).toBe('handle:ada');
  });

  it('keeps unknown follower observation time null and preserves invalid counts in the Note', () => {
    const plan = planMyahCreatorSocialProfileMigration({
      row: {
        id: 'creator-1',
        youtubeCustomUrl: '@ada',
        youtubeSubscriberCount: '-1',
      },
    });

    expect(plan.profiles[0]).toEqual(
      expect.objectContaining({
        platform: 'YOUTUBE',
        followerCount: null,
        followerCountObservedAt: null,
      }),
    );
    expect(plan.noteMarkdown).toContain('**youtubeSubscriberCount**: -1');
  });

  it('does not copy restricted values into profiles, Notes, or the digest payload', () => {
    const row = {
      id: 'creator-1',
      instagramUsername: 'private_handle',
      instagramBio: 'private bio',
      tiktokUsername: 'public_handle',
    };
    const restrictedFields = new Set([
      'instagramUsername',
      'instagramBio',
    ]);
    const plan = planMyahCreatorSocialProfileMigration({
      row,
      restrictedFields,
    });
    const changedRestrictedValues = planMyahCreatorSocialProfileMigration({
      row: {
        ...row,
        instagramUsername: 'other_private_handle',
        instagramBio: 'other private bio',
      },
      restrictedFields,
    });

    expect(plan.skippedRestrictedFields).toEqual([
      'instagramUsername',
      'instagramBio',
    ]);
    expect(plan.profiles.map(({ platform }) => platform)).toEqual(['TIKTOK']);
    expect(plan.noteMarkdown).toBeNull();
    expect(changedRestrictedValues.sourceDigest).toBe(plan.sourceDigest);
  });
});
