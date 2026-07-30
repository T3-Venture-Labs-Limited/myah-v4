import { act, renderHook } from '@testing-library/react';
import { useStore } from 'jotai';
import { useAuth } from '@/auth/hooks/useAuth';
import { ensureTokenRenewed } from '@/auth/utils/ensureTokenRenewed';
import { getClientConfig } from '@/client-config/utils/getClientConfig';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useClientConfig } from '@/client-config/hooks/useClientConfig';

jest.mock('@/auth/hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('@/auth/utils/ensureTokenRenewed', () => ({
  ensureTokenRenewed: jest.fn(),
}));
jest.mock('@/client-config/utils/getClientConfig', () => ({
  getClientConfig: jest.fn(),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomState', () => ({
  useAtomState: jest.fn(),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomState', () => ({
  useSetAtomState: jest.fn(),
}));
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: jest.fn(),
}));

const mockClientConfig = {
  aiModels: [],
  authProviders: {},
};

const setClientConfigApiStatus = jest.fn();
const clearSession = jest.fn();
const store = { get: jest.fn() };

const createUnauthenticatedError = () => {
  const error = new Error('Client config request is unauthenticated');

  error.name = 'ClientConfigUnauthenticatedError';

  return error;
};

describe('useClientConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAtomState as jest.Mock).mockReturnValue([
      { isLoading: false },
      setClientConfigApiStatus,
    ]);
    (useSetAtomState as jest.Mock).mockReturnValue(jest.fn());
    (useAuth as jest.Mock).mockReturnValue({ clearSession });
    (useStore as jest.Mock).mockReturnValue(store);
    store.get.mockReturnValue(null);
  });

  it('renews an expired session and retries authenticated client config', async () => {
    (getClientConfig as jest.Mock)
      .mockRejectedValueOnce(createUnauthenticatedError())
      .mockResolvedValueOnce(mockClientConfig);
    (ensureTokenRenewed as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useClientConfig());

    await act(async () => {
      await result.current.fetchClientConfig();
    });

    expect(ensureTokenRenewed).toHaveBeenCalledTimes(1);
    expect(getClientConfig).toHaveBeenCalledTimes(2);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('retries with a replacement session without renewing or clearing it', async () => {
    const replacementTokenPair = {
      accessOrWorkspaceAgnosticToken: {
        expiresAt: '2030-01-01T00:00:00.000Z',
        token: 'replacement-access-token',
      },
      refreshToken: {
        expiresAt: '2030-01-01T00:00:00.000Z',
        token: 'replacement-refresh-token',
      },
    };

    store.get.mockReturnValue({
      accessOrWorkspaceAgnosticToken: {
        expiresAt: '2030-01-01T00:00:00.000Z',
        token: 'stale-access-token',
      },
      refreshToken: {
        expiresAt: '2030-01-01T00:00:00.000Z',
        token: 'stale-refresh-token',
      },
    });
    (getClientConfig as jest.Mock)
      .mockImplementationOnce(async () => {
        store.get.mockReturnValue(replacementTokenPair);

        throw createUnauthenticatedError();
      })
      .mockResolvedValueOnce(mockClientConfig);

    const { result } = renderHook(() => useClientConfig());

    await act(async () => {
      await result.current.fetchClientConfig();
    });

    expect(ensureTokenRenewed).not.toHaveBeenCalled();
    expect(getClientConfig).toHaveBeenCalledTimes(2);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('renews an expired access token before requesting client config', async () => {
    store.get.mockReturnValue({
      accessOrWorkspaceAgnosticToken: {
        expiresAt: '2020-01-01T00:00:00.000Z',
        token: 'expired-access-token',
      },
    });
    (ensureTokenRenewed as jest.Mock).mockResolvedValue(true);
    (getClientConfig as jest.Mock).mockResolvedValue(mockClientConfig);

    const { result } = renderHook(() => useClientConfig());

    await act(async () => {
      await result.current.fetchClientConfig();
    });

    expect(ensureTokenRenewed).toHaveBeenCalledWith(store);
    expect(getClientConfig).toHaveBeenCalledTimes(1);
  });

  it('clears the session when renewing an expired client-config token fails', async () => {
    (getClientConfig as jest.Mock).mockRejectedValueOnce(
      createUnauthenticatedError(),
    );
    (ensureTokenRenewed as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useClientConfig());

    await act(async () => {
      await result.current.fetchClientConfig();
    });

    expect(getClientConfig).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});
