export type CreatorSocialProvider =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'twitter';

const ACCEPTED_HOSTS_BY_PROVIDER: Record<
  CreatorSocialProvider,
  ReadonlySet<string>
> = {
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com']),
  youtube: new Set(['youtube.com', 'www.youtube.com']),
  twitter: new Set(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com']),
};

const CANONICAL_HOST_BY_PROVIDER: Record<CreatorSocialProvider, string> = {
  instagram: 'instagram.com',
  tiktok: 'tiktok.com',
  youtube: 'youtube.com',
  twitter: 'x.com',
};

export const normalizeCreatorSocialProfileUrl = (
  provider: CreatorSocialProvider,
  value: string,
): string | undefined => {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(trimmedValue);
  } catch {
    return undefined;
  }

  if (
    url.protocol !== 'https:' ||
    !ACCEPTED_HOSTS_BY_PROVIDER[provider].has(url.hostname.toLocaleLowerCase())
  ) {
    return undefined;
  }

  if (
    provider === 'youtube' &&
    !/^\/(?:channel\/[^/]+|@[^/]+|c\/[^/]+|user\/[^/]+)\/*$/u.test(url.pathname)
  ) {
    return undefined;
  }

  url.hostname = CANONICAL_HOST_BY_PROVIDER[provider];
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/u, '');

  return url.toString().replace(/\/$/u, '');
};
