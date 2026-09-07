const RELATIVE_REDIRECT_LOCATION_ORIGIN = 'http://workspace.local';

export const buildWorkspaceUrlFromRelativeRedirectLocation = <TWorkspace>({
  buildWorkspaceURL,
  redirectLocation,
  workspace,
}: {
  buildWorkspaceURL: ({
    pathname,
    workspace,
  }: {
    pathname: string;
    workspace: TWorkspace;
  }) => URL;
  redirectLocation: string;
  workspace: TWorkspace;
}): URL => {
  const relativeRedirectUrl = new URL(
    redirectLocation,
    RELATIVE_REDIRECT_LOCATION_ORIGIN,
  );
  const workspaceUrl = buildWorkspaceURL({
    pathname: relativeRedirectUrl.pathname,
    workspace,
  });

  workspaceUrl.search = relativeRedirectUrl.search;
  workspaceUrl.hash = relativeRedirectUrl.hash;

  return workspaceUrl;
};
