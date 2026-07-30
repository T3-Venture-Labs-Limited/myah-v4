import { useClientConfig } from '@/client-config/hooks/useClientConfig';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

export const ClientConfigProviderEffect = () => {
  const [clientConfigApiStatus, setClientConfigApiStatus] = useAtomState(
    clientConfigApiStatusState,
  );
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const tokenPair = useAtomStateValue(tokenPairState);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken?.token;
  const workspaceId = currentWorkspace?.id;
  const configIdentity = `${workspaceId ?? ''}:${accessToken ?? ''}`;
  const [fetchedIdentity, setFetchedIdentity] = useState<string | null>(null);
  const { data, loading, error, fetchClientConfig } = useClientConfig();

  useEffect(() => {
    if (clientConfigApiStatus.isLoading) return;
    if (fetchedIdentity === configIdentity) {
      return;
    }

    // Bootstrap is intentionally public. Once authentication or workspace
    // identity becomes available, fetch again so workspace-scoped settings
    // replace the bootstrap config and follow workspace switches.
    if (
      !clientConfigApiStatus.isLoadedOnce ||
      isDefined(accessToken) ||
      isDefined(workspaceId)
    ) {
      setFetchedIdentity(configIdentity);
      void fetchClientConfig();
    }
  }, [
    accessToken,
    clientConfigApiStatus.isLoadedOnce,
    clientConfigApiStatus.isLoading,
    configIdentity,
    fetchedIdentity,
    fetchClientConfig,
    workspaceId,
  ]);

  useEffect(() => {
    if (loading) return;

    if (error instanceof Error) {
      setClientConfigApiStatus((currentStatus) => ({
        ...currentStatus,
        isErrored: true,
        error,
      }));
      return;
    }

    if (!isDefined(data?.clientConfig)) {
      return;
    }
  }, [data?.clientConfig, error, loading, setClientConfigApiStatus]);

  return <></>;
};
