import { render } from '@testing-library/react';
import { ClientConfigProviderEffect } from '@/client-config/components/ClientConfigProviderEffect';
import { useClientConfig } from '@/client-config/hooks/useClientConfig';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

jest.mock('@/client-config/hooks/useClientConfig', () => ({
  useClientConfig: jest.fn(),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomState', () => ({
  useAtomState: jest.fn(),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: jest.fn(),
}));

const fetchClientConfig = jest.fn();
const setClientConfigApiStatus = jest.fn();

let currentWorkspace: { id: string } | null = null;
let accessToken: string | undefined;
let status = { isLoadedOnce: false, isLoading: false };

const configureMocks = () => {
  (useClientConfig as jest.Mock).mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
    fetchClientConfig,
  });
  (useAtomState as jest.Mock).mockReturnValue([
    status,
    setClientConfigApiStatus,
  ]);
  (useAtomStateValue as jest.Mock).mockImplementation((state) =>
    state === currentWorkspaceState
      ? currentWorkspace
      : state === tokenPairState && accessToken
        ? { accessOrWorkspaceAgnosticToken: { token: accessToken } }
        : null,
  );
};

describe('ClientConfigProviderEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentWorkspace = null;
    accessToken = undefined;
    status = { isLoadedOnce: false, isLoading: false };
    configureMocks();
  });

  it('refetches once after authentication or workspace identity changes', () => {
    const view = render(<ClientConfigProviderEffect />);
    expect(fetchClientConfig).toHaveBeenCalledTimes(1);

    status = { isLoadedOnce: true, isLoading: false };
    accessToken = 'access-token';
    currentWorkspace = { id: 'workspace-a' };
    view.rerender(<ClientConfigProviderEffect />);
    expect(fetchClientConfig).toHaveBeenCalledTimes(2);

    view.rerender(<ClientConfigProviderEffect />);
    expect(fetchClientConfig).toHaveBeenCalledTimes(2);

    currentWorkspace = { id: 'workspace-b' };
    view.rerender(<ClientConfigProviderEffect />);
    expect(fetchClientConfig).toHaveBeenCalledTimes(3);
  });
});
