import { renderHook } from '@testing-library/react';

import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useReadDefaultDomainFromConfiguration } from '@/domain-manager/hooks/useReadDefaultDomainFromConfiguration';
import { domainConfigurationState } from '@/domain-manager/states/domainConfigurationState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue');

describe('useReadDefaultDomainFromConfiguration', () => {
  it('does not add a subdomain to an IP address', () => {
    (useAtomStateValue as jest.Mock).mockImplementation((state) => {
      if (state === isMultiWorkspaceEnabledState) {
        return true;
      }

      if (state === domainConfigurationState) {
        return {
          defaultSubdomain: 'app',
          frontDomain: '127.0.0.1',
          publicFunctionDomain: undefined,
        };
      }

      throw new Error('Unexpected state');
    });

    const { result } = renderHook(() =>
      useReadDefaultDomainFromConfiguration(),
    );

    expect(result.current.defaultDomain).toBe('127.0.0.1');
  });
});
