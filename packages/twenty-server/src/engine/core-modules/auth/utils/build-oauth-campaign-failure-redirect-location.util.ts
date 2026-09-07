const WORKSPACE_ORIGIN = 'http://workspace.local';

export const buildOAuthCampaignFailureRedirectLocation = (
  redirectLocation: string | undefined,
): string | undefined => {
  if (
    !redirectLocation ||
    !redirectLocation.startsWith('/object/campaign/') ||
    redirectLocation.startsWith('//')
  ) {
    return undefined;
  }

  try {
    const url = new URL(redirectLocation, WORKSPACE_ORIGIN);
    if (url.origin !== WORKSPACE_ORIGIN) return undefined;

    decodeURIComponent(url.pathname);
    url.searchParams.delete('connectedAccountId');
    url.searchParams.delete('linkConnectedAccount');
    url.searchParams.set('emailAccountConnectionFailed', '1');

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
};
