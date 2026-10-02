import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { domainConfigurationState } from '@/domain-manager/states/domainConfigurationState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isValidHostname } from 'twenty-shared/utils';

export const useReadDefaultDomainFromConfiguration = () => {
  const domainConfiguration = useAtomStateValue(domainConfigurationState);
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );

  const defaultDomain =
    isMultiWorkspaceEnabled &&
    isValidHostname(domainConfiguration.frontDomain, { allowIp: false })
      ? `${domainConfiguration.defaultSubdomain}.${domainConfiguration.frontDomain}`
      : domainConfiguration.frontDomain;

  return {
    defaultDomain,
  };
};
