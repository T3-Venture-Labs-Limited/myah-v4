export const SOCIAL_PROFILE_PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'TWITTER',
  'TWITCH',
  'PATREON',
] as const;

export type SocialProfilePlatform = (typeof SOCIAL_PROFILE_PLATFORMS)[number];

export type SocialProfileIdentityInput = {
  platform: unknown;
  handle?: unknown;
  profileUrl?: unknown;
  platformAccountId?: unknown;
};

export type NormalizedSocialProfileIdentity = {
  platform: SocialProfilePlatform;
  handle: string | null;
  profileUrl: string | null;
  normalizedLocator: string | null;
  platformAccountId: string | null;
};

export type SocialProfileIdentityRecord = {
  id: string;
  creatorId: string;
  platform: SocialProfilePlatform;
  normalizedLocator: string | null;
  platformAccountId: string | null;
};

const HANDLE_PATTERNS: Partial<Record<SocialProfilePlatform, RegExp>> = {
  INSTAGRAM: /^[a-z0-9._]{1,30}$/i,
  TIKTOK: /^[a-z0-9._]{2,24}$/i,
  TWITTER: /^[a-z0-9_]{1,15}$/i,
  TWITCH: /^[a-z0-9_]{4,25}$/i,
  PATREON: /^[a-z0-9_-]+$/i,
  YOUTUBE: /^[a-z0-9._-]+$/i,
};

const canonicalHandleUrl = (
  platform: SocialProfilePlatform,
  handle: string,
): string => {
  switch (platform) {
    case 'INSTAGRAM':
      return `https://www.instagram.com/${handle}/`;
    case 'TIKTOK':
      return `https://www.tiktok.com/@${handle}`;
    case 'YOUTUBE':
      return `https://www.youtube.com/@${handle}`;
    case 'TWITTER':
      return `https://x.com/${handle}`;
    case 'TWITCH':
      return `https://www.twitch.tv/${handle}`;
    case 'PATREON':
      return `https://www.patreon.com/${handle}`;
  }
};

const normalizeHandle = (
  platform: SocialProfilePlatform,
  rawHandle: string,
): string => {
  const handle = rawHandle.trim().replace(/^@/, '');

  if (!HANDLE_PATTERNS[platform]?.test(handle)) {
    throw new Error(`Invalid ${platform} handle`);
  }

  return handle.toLowerCase();
};

const parseProfileUrl = (
  platform: SocialProfilePlatform,
  rawUrl: string,
): {
  handle: string | null;
  profileUrl: string;
  normalizedLocator: string;
} => {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid ${platform} profile URL`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Invalid ${platform} profile URL`);
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathParts = url.pathname.split('/').filter(Boolean);
  let rawHandle: string | undefined;

  switch (platform) {
    case 'INSTAGRAM':
      if (host !== 'instagram.com' || pathParts.length !== 1) break;
      rawHandle = pathParts[0];
      break;
    case 'TIKTOK':
      if (
        host !== 'tiktok.com' ||
        pathParts.length !== 1 ||
        !pathParts[0].startsWith('@')
      )
        break;
      rawHandle = pathParts[0];
      break;
    case 'TWITTER':
      if (
        (host !== 'twitter.com' && host !== 'x.com') ||
        pathParts.length !== 1
      )
        break;
      rawHandle = pathParts[0];
      break;
    case 'TWITCH':
      if (host !== 'twitch.tv' || pathParts.length !== 1) break;
      rawHandle = pathParts[0];
      break;
    case 'PATREON':
      if (host !== 'patreon.com' || pathParts.length !== 1) break;
      rawHandle = pathParts[0];
      break;
    case 'YOUTUBE': {
      if (host !== 'youtube.com' || pathParts.length === 0) break;
      if (pathParts.length === 1 && pathParts[0].startsWith('@')) {
        rawHandle = pathParts[0];
        break;
      }
      if (
        pathParts.length === 2 &&
        ['channel', 'c', 'user'].includes(pathParts[0]) &&
        pathParts[1].length > 0
      ) {
        const canonicalUrl = `https://www.youtube.com/${pathParts[0]}/${pathParts[1]}`;

        return {
          handle: null,
          profileUrl: canonicalUrl,
          normalizedLocator: `url:${canonicalUrl}`,
        };
      }
      break;
    }
  }

  if (!rawHandle) {
    throw new Error(`Invalid ${platform} profile URL`);
  }

  const handle = normalizeHandle(platform, rawHandle);

  return {
    handle,
    profileUrl: canonicalHandleUrl(platform, handle),
    normalizedLocator: `handle:${handle}`,
  };
};

const parsePlatform = (value: unknown): SocialProfilePlatform => {
  if (typeof value !== 'string') throw new Error('Social platform is required');

  const platform = value.trim().toUpperCase();

  if (!SOCIAL_PROFILE_PLATFORMS.includes(platform as SocialProfilePlatform)) {
    throw new Error(`Unsupported social platform: ${value}`);
  }

  return platform as SocialProfilePlatform;
};

const optionalTrimmedString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string')
    throw new Error('Social identity must be text');

  return value.trim() || null;
};

export const normalizeSocialProfileIdentity = (
  input: SocialProfileIdentityInput,
): NormalizedSocialProfileIdentity => {
  const platform = parsePlatform(input.platform);
  const platformAccountId = optionalTrimmedString(input.platformAccountId);
  const rawHandle = optionalTrimmedString(input.handle);
  const rawProfileUrl = optionalTrimmedString(input.profileUrl);
  const fromHandle = rawHandle
    ? (() => {
        const handle = normalizeHandle(platform, rawHandle);

        return {
          handle,
          profileUrl: canonicalHandleUrl(platform, handle),
          normalizedLocator: `handle:${handle}`,
        };
      })()
    : null;
  const fromUrl = rawProfileUrl
    ? parseProfileUrl(platform, rawProfileUrl)
    : null;

  if (
    fromHandle &&
    fromUrl &&
    fromHandle.normalizedLocator !== fromUrl.normalizedLocator
  ) {
    throw new Error(
      'Social profile handle and URL identify different accounts',
    );
  }

  const locator = fromUrl ?? fromHandle;

  if (!locator && !platformAccountId) {
    throw new Error(
      'A social profile requires a handle, profile URL, or stable account ID',
    );
  }

  return {
    platform,
    handle: locator?.handle ?? null,
    profileUrl: locator?.profileUrl ?? null,
    normalizedLocator: locator?.normalizedLocator ?? null,
    platformAccountId,
  };
};

export const assertValidSocialProfileFollowerCount = (
  followerCount: unknown,
): void => {
  if (followerCount === undefined || followerCount === null) return;
  if (
    typeof followerCount !== 'number' ||
    !Number.isSafeInteger(followerCount) ||
    followerCount < 0
  ) {
    throw new Error('Follower count must be a non-negative integer');
  }
};

export const socialProfileDisplayName = ({
  platform,
  handle,
  platformAccountId,
}: NormalizedSocialProfileIdentity): string =>
  handle
    ? `@${handle} on ${platform}`
    : platformAccountId
      ? `${platform} account ${platformAccountId}`
      : `${platform} profile`;

export const resolveSocialProfileIdentityMatch = ({
  creatorId,
  identity,
  byPlatformAccountId,
  byNormalizedLocator,
}: {
  creatorId: string;
  identity: NormalizedSocialProfileIdentity;
  byPlatformAccountId: SocialProfileIdentityRecord | null;
  byNormalizedLocator: SocialProfileIdentityRecord | null;
}): {
  profile: SocialProfileIdentityRecord | null;
  enrichPlatformAccountId: boolean;
} => {
  if (
    byPlatformAccountId &&
    byNormalizedLocator &&
    byPlatformAccountId.id !== byNormalizedLocator.id
  ) {
    throw new Error(
      'Stable account ID and locator resolve to different social profiles',
    );
  }

  const profile = byPlatformAccountId ?? byNormalizedLocator;

  if (!profile) return { profile: null, enrichPlatformAccountId: false };
  if (profile.creatorId !== creatorId) {
    throw new Error('Social profile is already owned by another Creator');
  }
  if (profile.platform !== identity.platform) {
    throw new Error('Social profile platform cannot change');
  }
  if (
    identity.platformAccountId &&
    profile.platformAccountId &&
    identity.platformAccountId !== profile.platformAccountId
  ) {
    throw new Error(
      'Locator is already bound to a different stable account ID',
    );
  }

  return {
    profile,
    enrichPlatformAccountId:
      Boolean(identity.platformAccountId) && !profile.platformAccountId,
  };
};
