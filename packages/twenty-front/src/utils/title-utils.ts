import { t } from '@lingui/core/macro';
import { AppPath } from 'twenty-shared/types';

export const getPageTitleFromPath = (pathname: string): string => {
  switch (pathname) {
    case AppPath.Verify:
      return t`Verify`;
    case AppPath.SignInUp:
      return t`Sign in or Create an account`;
    case AppPath.Invite:
      return t`Invite`;
    case AppPath.WorkspaceActivation:
      return t`Create Workspace`;
    case AppPath.CreateProfile:
      return t`Create Profile`;
    default:
      return 'Myah';
  }
};
