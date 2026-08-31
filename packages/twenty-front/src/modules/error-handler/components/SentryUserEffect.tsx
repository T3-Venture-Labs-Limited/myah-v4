import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const SentryUserEffect = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  useEffect(() => {
    try {
      if (isDefined(currentUser)) {
        Sentry.setUser({
          email: currentUser.email,
          id: currentUser.id,
          workspaceId: currentWorkspace?.id,
          workspaceMemberId: currentWorkspaceMember?.id,
        });
      } else {
        Sentry.setUser(null);
      }
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error('Failed to update Sentry user:', error);
    }
  }, [currentUser, currentWorkspace, currentWorkspaceMember]);

  return null;
};
