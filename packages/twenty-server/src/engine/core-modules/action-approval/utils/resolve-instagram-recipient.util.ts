export type InstagramRecipientSourceField =
  | 'instagramUsername'
  | 'instagramUrl'
  | 'instagramLink';

type ResolveInstagramRecipientInput = {
  instagramLink: { primaryLinkUrl?: string | null } | null;
  instagramUrl: string | null;
  instagramUsername: string | null;
};

type ResolvedInstagramRecipient = {
  normalizedUsername: string;
  sourceFields: InstagramRecipientSourceField[];
};

const INSTAGRAM_PROFILE_HOSTS: Record<string, true> = {
  'instagram.com': true,
  'www.instagram.com': true,
};
const RESERVED_PROFILE_PATHS: Record<string, true> = {
  accounts: true,
  direct: true,
  explore: true,
  p: true,
  reel: true,
  reels: true,
  stories: true,
};
const USERNAME_PATTERN = /^(?!.*\.\.)[a-z0-9._]{1,30}$/;

const normalizeUsername = (value: string): string | null => {
  const trimmedValue = value.trim();
  const withoutAtSign = trimmedValue.startsWith('@')
    ? trimmedValue.slice(1)
    : trimmedValue;
  const normalizedUsername = withoutAtSign.toLowerCase();

  if (
    !USERNAME_PATTERN.test(normalizedUsername) ||
    normalizedUsername.startsWith('.') ||
    normalizedUsername.endsWith('.')
  ) {
    return null;
  }

  return normalizedUsername;
};

const normalizeProfileUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    const pathSegments = url.pathname.split('/').filter(Boolean);

    if (
      url.protocol !== 'https:' ||
      INSTAGRAM_PROFILE_HOSTS[url.hostname.toLowerCase()] !== true ||
      pathSegments.length !== 1
    ) {
      return null;
    }

    const profileSegment = decodeURIComponent(pathSegments[0]);

    if (RESERVED_PROFILE_PATHS[profileSegment.toLowerCase()] === true) {
      return null;
    }

    return normalizeUsername(profileSegment);
  } catch {
    return null;
  }
};

export const resolveInstagramRecipient = (
  input: ResolveInstagramRecipientInput,
): ResolvedInstagramRecipient => {
  const sources: Array<{
    field: InstagramRecipientSourceField;
    value: string;
    valueKind: 'USERNAME' | 'URL';
  }> = [
    {
      field: 'instagramUsername',
      value: input.instagramUsername ?? '',
      valueKind: 'USERNAME',
    },
    {
      field: 'instagramUrl',
      value: input.instagramUrl ?? '',
      valueKind: 'URL',
    },
    {
      field: 'instagramLink',
      value: input.instagramLink?.primaryLinkUrl ?? '',
      valueKind: 'URL',
    },
  ];
  const populatedSources = sources.filter(
    ({ value }) => value.trim().length > 0,
  );

  if (populatedSources.length === 0) {
    throw new Error('Creator needs an Instagram username or profile URL');
  }

  const normalizedSources = populatedSources.map(
    ({ field, value, valueKind }) => {
      const normalizedUsername =
        valueKind === 'USERNAME'
          ? normalizeUsername(value)
          : normalizeProfileUrl(value);

      if (!normalizedUsername) {
        throw new Error(
          `Creator ${field} is not a supported Instagram profile`,
        );
      }

      return { field, normalizedUsername };
    },
  );
  const [firstSource] = normalizedSources;

  if (
    normalizedSources.some(
      ({ normalizedUsername }) =>
        normalizedUsername !== firstSource.normalizedUsername,
    )
  ) {
    throw new Error(
      `Creator Instagram fields resolve to different usernames: ${normalizedSources
        .map(({ field }) => field)
        .join(', ')}`,
    );
  }

  return {
    normalizedUsername: firstSource.normalizedUsername,
    sourceFields: normalizedSources.map(({ field }) => field),
  };
};
