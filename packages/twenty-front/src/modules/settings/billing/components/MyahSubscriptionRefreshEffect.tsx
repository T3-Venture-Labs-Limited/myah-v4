import { useApolloClient } from '@apollo/client/react';
import { useEffect } from 'react';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { myahSubscriptionRefreshRequestedState } from '@/settings/billing/states/myahSubscriptionRefreshRequestedState';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { GetCurrentUserDocument } from '~/generated-metadata/graphql';

// Mounted under the metadata Apollo provider, including while the workspace's
// record client is blocked. The existing onboarding redirect uses the result.
export const MyahSubscriptionRefreshEffect = () => {
  const client = useApolloClient();
  const [
    myahSubscriptionRefreshRequested,
    setMyahSubscriptionRefreshRequested,
  ] = useAtomState(myahSubscriptionRefreshRequestedState);
  const [currentUser, setCurrentUser] = useAtomState(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { enqueueErrorSnackBar } = useSnackBar();
  const workspaceId = currentWorkspace?.id;
  const userId = currentUser?.id;

  useEffect(() => {
    if (!myahSubscriptionRefreshRequested || !workspaceId || !userId) return;
    let cancelled = false;
    void client
      .query({ query: GetCurrentUserDocument, fetchPolicy: 'network-only' })
      .then(({ data }) => {
        if (
          !cancelled &&
          data?.currentUser?.id === userId &&
          data.currentUser.currentWorkspace?.id === workspaceId
        ) {
          setCurrentUser(data.currentUser);
        }
      })
      .catch(() => {
        if (!cancelled)
          enqueueErrorSnackBar({
            message:
              'Unable to refresh subscription access. Please reload the page.',
          });
      })
      .finally(() => {
        if (!cancelled) setMyahSubscriptionRefreshRequested(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    myahSubscriptionRefreshRequested,
    workspaceId,
    userId,
    setCurrentUser,
    setMyahSubscriptionRefreshRequested,
    enqueueErrorSnackBar,
  ]);
  return null;
};
