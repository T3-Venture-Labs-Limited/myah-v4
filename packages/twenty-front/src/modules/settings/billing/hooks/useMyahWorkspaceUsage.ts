import { useQuery } from '@apollo/client/react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { MyahWorkspaceUsageDocument } from '~/generated-metadata/graphql';

export const useMyahWorkspaceUsage = () => {
  const isMyahSubscriptionRequired = useAtomStateValue(
    isMyahSubscriptionRequiredState,
  );
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const result = useQuery(MyahWorkspaceUsageDocument, {
    skip: !isMyahSubscriptionRequired || !currentWorkspace?.id,
    fetchPolicy: 'cache-and-network',
    pollInterval: 5 * 60 * 1000,
  });
  return {
    ...result,
    isEnabled: isMyahSubscriptionRequired,
    hasAccess:
      !isMyahSubscriptionRequired ||
      ['ACTIVE', 'PAYMENT_RETRYING', 'COMPLIMENTARY'].includes(
        result.data?.myahWorkspaceUsage.state ?? '',
      ),
    usage: result.data?.myahWorkspaceUsage,
  };
};
