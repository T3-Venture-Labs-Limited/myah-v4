const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({ render: mockRender }));
const mockHydrateMetadataStore = jest.fn(() => Promise.resolve());
const mockMigrateTokenPairCookieToLocalStorage = jest.fn();
const mockReactErrorHandler = jest.fn();
const mockUncaughtErrorHandler = jest.fn();
const mockRecoverableErrorHandler = jest.fn();

jest.mock('react-dom/client', () => ({
  __esModule: true,
  default: { createRoot: mockCreateRoot },
}));

jest.mock('@sentry/react', () => ({
  reactErrorHandler: mockReactErrorHandler,
}));

jest.mock('./instrument', () => ({}), { virtual: true });

jest.mock('@/app/components/App', () => ({ App: () => null }));
jest.mock('@/auth/utils/migrateTokenPairCookieToLocalStorage', () => ({
  migrateTokenPairCookieToLocalStorage: mockMigrateTokenPairCookieToLocalStorage,
}));
jest.mock('@/metadata-store/storage/metadataStoreStorage', () => ({
  hydrateMetadataStore: mockHydrateMetadataStore,
}));

describe('application bootstrap', () => {
  it('installs React 19 handlers without competing with caught-error boundaries', async () => {
    mockReactErrorHandler
      .mockReturnValueOnce(mockUncaughtErrorHandler)
      .mockReturnValueOnce(mockRecoverableErrorHandler);

    jest.isolateModules(() => {
      jest.requireActual('./index');
    });
    await Promise.resolve();

    expect(mockReactErrorHandler).toHaveBeenCalledTimes(2);
    expect(mockCreateRoot).toHaveBeenCalledWith(expect.anything(), {
      onRecoverableError: mockRecoverableErrorHandler,
      onUncaughtError: mockUncaughtErrorHandler,
    });
    expect(mockCreateRoot.mock.calls[0][1]).not.toHaveProperty('onCaughtError');
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
