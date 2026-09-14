const WORKSPACE_ORIGIN = 'http://workspace.local';

export const appendConnectedAccountIdToRedirectLocation = (
  redirectLocation: string | undefined,
  connectedAccountId: string,
): string | undefined => {
  if (
    !redirectLocation ||
    !redirectLocation.startsWith('/') ||
    redirectLocation.startsWith('//')
  ) {
    return undefined;
  }

  try {
    const url = new URL(redirectLocation, WORKSPACE_ORIGIN);

    if (url.origin !== WORKSPACE_ORIGIN) {
      return undefined;
    }

    decodeURIComponent(url.pathname);
    url.searchParams.set('connectedAccountId', connectedAccountId);

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
};
