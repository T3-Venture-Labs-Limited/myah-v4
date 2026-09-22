import { createHash } from 'crypto';

import {
  normalizeSocialProfileIdentity,
  type SocialProfilePlatform,
} from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

export type LegacyCreatorRow = Record<string, unknown> & { id: string };

export type PlannedLegacySocialProfile = ReturnType<
  typeof normalizeSocialProfileIdentity
> & {
  followerCount: number | null;
  followerCountObservedAt: null;
  followerCountSource: 'MYAH-409 legacy Creator migration';
};

export type CreatorSocialProfileMigrationPlan = {
  creatorId: string;
  sourceDigest: string;
  profiles: PlannedLegacySocialProfile[];
  noteMarkdown: string | null;
  conflicts: string[];
  skippedRestrictedFields: string[];
};

type PlatformMapping = {
  platform: SocialProfilePlatform;
  urlField: string;
  linkUrlField?: string;
  handleField?: string;
  followerField?: string;
  noteFields: string[];
};

export const CREATOR_NOTE_FIELDS = [
  'gender',
  'profileType',
  'creatorStatus',
  'hasLinkInBio',
  'hasBrandDeals',
  'promotesAffiliateLinks',
  'hasMerch',
  'linksInBio',
  'externalUrls',
  'hashtagsUsed',
  'categories',
  'niches',
  'notes',
] as const;

export const CREATOR_SOCIAL_PLATFORM_MAPPINGS: readonly PlatformMapping[] = [
  {
    platform: 'INSTAGRAM',
    urlField: 'instagramUrl',
    linkUrlField: 'instagramLinkPrimaryLinkUrl',
    handleField: 'instagramUsername',
    followerField: 'instagramFollowerCount',
    noteFields: [
      'instagramBio',
      'instagramEngagementPercent',
      'instagramMostRecentPostDate',
      'instagramMediaCount',
      'instagramAvgLikes',
      'instagramAvgComments',
      'instagramReelsPercent',
      'instagramReelsAvgViewCount',
      'instagramPostingFrequencyRecentMonths',
      'instagramEstimatedIncomeMin',
      'instagramEstimatedIncomeMax',
    ],
  },
  {
    platform: 'TIKTOK',
    urlField: 'tiktokUrl',
    linkUrlField: 'tiktokLinkPrimaryLinkUrl',
    handleField: 'tiktokUsername',
    followerField: 'tiktokFollowerCount',
    noteFields: [
      'tiktokBio',
      'tiktokMostRecentPostDate',
      'tiktokEngagementPercent',
      'tiktokVideoCount',
      'tiktokPlayCountMedian',
      'tiktokAvgLikes',
      'tiktokAvgComments',
      'tiktokAvgDownloads',
      'tiktokPostingFrequencyRecentMonths',
    ],
  },
  {
    platform: 'YOUTUBE',
    urlField: 'youtubeUrl',
    linkUrlField: 'youtubeLinkPrimaryLinkUrl',
    handleField: 'youtubeCustomUrl',
    followerField: 'youtubeSubscriberCount',
    noteFields: [
      'youtubeTitle',
      'youtubeDescription',
      'youtubeTopicDetails',
      'youtubeLastUploadDate',
      'youtubeLastStreamUploadDate',
      'youtubeShortsPercentage',
      'youtubeVideoCount',
      'youtubeEngagementPercent',
      'youtubeAvgViewsLong',
      'youtubeAvgViewsShorts',
      'youtubeAvgStreamViews',
      'youtubeAvgStreamDuration',
      'youtubePostingFrequencyRecentMonths',
      'youtubeEstimatedIncomeMin',
      'youtubeEstimatedIncomeMax',
    ],
  },
  {
    platform: 'TWITTER',
    urlField: 'twitterUrl',
    linkUrlField: 'twitterLinkPrimaryLinkUrl',
    handleField: 'twitterUsername',
    followerField: 'twitterFollowerCount',
    noteFields: ['twitterBio', 'twitterEngagementPercent'],
  },
  {
    platform: 'TWITCH',
    urlField: 'twitchUrl',
    handleField: 'twitchUsername',
    followerField: 'twitchTotalFollowers',
    noteFields: ['twitchDisplayName'],
  },
  {
    platform: 'PATREON',
    urlField: 'patreonUrl',
    noteFields: [],
  },
];

export const LEGACY_CREATOR_MIGRATION_FIELDS = [
  ...CREATOR_NOTE_FIELDS,
  ...new Set(
    CREATOR_SOCIAL_PLATFORM_MAPPINGS.flatMap((mapping) => [
      mapping.urlField,
      ...(mapping.linkUrlField ? [mapping.linkUrlField] : []),
      ...(mapping.handleField ? [mapping.handleField] : []),
      ...(mapping.followerField ? [mapping.followerField] : []),
      ...mapping.noteFields,
    ]),
  ),
] as const;

const hasValue = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  (typeof value !== 'string' || value.trim().length > 0) &&
  (!Array.isArray(value) || value.length > 0);

const asTrimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asFollowerCount = (value: unknown): number | null => {
  if (!hasValue(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const formatNoteValue = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
};

export const planMyahCreatorSocialProfileMigration = ({
  row,
  restrictedFields = new Set<string>(),
}: {
  row: LegacyCreatorRow;
  restrictedFields?: ReadonlySet<string>;
}): CreatorSocialProfileMigrationPlan => {
  const conflicts: string[] = [];
  const profiles: PlannedLegacySocialProfile[] = [];
  const noteEntries: Array<[string, unknown]> = [];
  const skippedRestrictedFields = LEGACY_CREATOR_MIGRATION_FIELDS.filter(
    (field) => restrictedFields.has(field) && hasValue(row[field]),
  );

  for (const field of CREATOR_NOTE_FIELDS) {
    if (!restrictedFields.has(field) && hasValue(row[field])) {
      noteEntries.push([field, row[field]]);
    }
  }

  for (const mapping of CREATOR_SOCIAL_PLATFORM_MAPPINGS) {
    for (const field of mapping.noteFields) {
      if (!restrictedFields.has(field) && hasValue(row[field])) {
        noteEntries.push([field, row[field]]);
      }
    }

    const oldUrl = restrictedFields.has(mapping.urlField)
      ? undefined
      : asTrimmedString(row[mapping.urlField]);
    const linkUrl =
      mapping.linkUrlField && !restrictedFields.has(mapping.linkUrlField)
        ? asTrimmedString(row[mapping.linkUrlField])
        : undefined;

    if (oldUrl && linkUrl) {
      try {
        const oldIdentity = normalizeSocialProfileIdentity({
          platform: mapping.platform,
          profileUrl: oldUrl,
        });
        const linkIdentity = normalizeSocialProfileIdentity({
          platform: mapping.platform,
          profileUrl: linkUrl,
        });

        if (oldIdentity.normalizedLocator !== linkIdentity.normalizedLocator) {
          conflicts.push(
            `${mapping.platform}: ${mapping.urlField} conflicts with ${mapping.linkUrlField}`,
          );
          continue;
        }
      } catch (error) {
        conflicts.push(
          `${mapping.platform}: ${error instanceof Error ? error.message : 'invalid identity'}`,
        );
        continue;
      }
    }

    const handleOrUrl =
      mapping.handleField && !restrictedFields.has(mapping.handleField)
        ? asTrimmedString(row[mapping.handleField])
        : undefined;
    const handle = handleOrUrl?.match(/^https?:\/\//u)
      ? undefined
      : handleOrUrl;
    const profileUrl =
      linkUrl ??
      oldUrl ??
      (handleOrUrl?.match(/^https?:\/\//u) ? handleOrUrl : undefined);

    if (!handle && !profileUrl) continue;

    try {
      const identity = normalizeSocialProfileIdentity({
        platform: mapping.platform,
        handle,
        profileUrl,
      });
      const followerValue =
        mapping.followerField && !restrictedFields.has(mapping.followerField)
          ? row[mapping.followerField]
          : undefined;
      const followerCount = asFollowerCount(followerValue);

      if (hasValue(followerValue) && followerCount === null) {
        noteEntries.push([mapping.followerField!, followerValue]);
      }
      profiles.push({
        ...identity,
        followerCount,
        followerCountObservedAt: null,
        followerCountSource: 'MYAH-409 legacy Creator migration',
      });
    } catch (error) {
      conflicts.push(
        `${mapping.platform}: ${error instanceof Error ? error.message : 'invalid identity'}`,
      );
    }
  }

  const digestPayload = Object.fromEntries(
    LEGACY_CREATOR_MIGRATION_FIELDS.filter(
      (field) => !restrictedFields.has(field),
    ).map((field) => [field, row[field] ?? null]),
  );

  return {
    creatorId: row.id,
    sourceDigest: createHash('sha256')
      .update(JSON.stringify({ creatorId: row.id, fields: digestPayload }))
      .digest('hex'),
    profiles,
    noteMarkdown:
      noteEntries.length > 0
        ? noteEntries
            .map(([field, value]) => `- **${field}**: ${formatNoteValue(value)}`)
            .join('\n')
        : null,
    conflicts,
    skippedRestrictedFields,
  };
};
