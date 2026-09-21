import { render, waitFor } from '@testing-library/react';
import { ContextStorePageType, SettingsPath } from 'twenty-shared/types';
import { MessageOnInstagramCommand } from '@/command-menu-item/engine-command/global/components/MessageOnInstagramCommand';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const mockOpen = jest.fn();
const mockNavigate = jest.fn();
const mockError = jest.fn();
const mockQuery = jest.fn();
const mockContext = jest.fn();
const mockPermission = jest.fn();
const mockClient = {};
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: (flag: PermissionFlagType) => mockPermission(flag),
}));
jest.mock('@/side-panel/hooks/useOpenInstagramMessageInSidePanel', () => ({
  useOpenInstagramMessageInSidePanel: () => ({
    openInstagramMessageInSidePanel: mockOpen,
  }),
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigate,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: mockError }),
}));
jest.mock(
  '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi',
  () => ({ useHeadlessCommandContextApi: () => mockContext() }),
);
jest.mock(
  '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect',
  () => ({
    HeadlessEngineCommandWrapperEffect: ({
      execute,
      ready,
    }: {
      execute: () => void;
      ready: boolean;
    }) => {
      const React = jest.requireActual('react');
      const executed = React.useRef(false);
      React.useEffect(() => {
        if (ready && !executed.current) {
          executed.current = true;
          execute();
        }
      }, [execute, ready]);
      return null;
    },
  }),
);
const readyAccount = {
  data: {
    instagramMessageComposerAccount: {
      status: 'READY',
      code: null,
      sender: { accountRecordId: 'sender', label: '@sender' },
    },
  },
  loading: false,
};
const context = (
  selectedRecordIds: string[] = [],
  loadedIds = selectedRecordIds,
  objectName = 'creator',
) => ({
  objectMetadataItem: { nameSingular: objectName },
  selectedRecords: loadedIds.map((id) => ({ id })),
  targetedRecordsRule: { mode: 'selection', selectedRecordIds },
  contextStoreInstanceId: 'command-context',
  pageType: ContextStorePageType.Index,
});
beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockReturnValue(true);
  mockQuery.mockReturnValue(readyAccount);
  mockContext.mockReturnValue(context());
});
it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])('requires first=%s OR reply=%s, not settings permission', (first, reply) => {
  mockPermission.mockImplementation((flag) =>
    flag === PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL
      ? first
      : flag === PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL
        ? reply
        : false,
  );
  render(<MessageOnInstagramCommand />);
  expect(mockOpen).toHaveBeenCalledTimes(first || reply ? 1 : 0);
  expect(mockQuery.mock.calls[0][1]).toMatchObject({
    client: mockClient,
    skip: !(first || reply),
    fetchPolicy: 'network-only',
  });
  expect(mockNavigate).not.toHaveBeenCalled();
});
it.each(Object.values(ContextStorePageType))(
  'opens globally on %s; implicit page record never prefills',
  (pageType) => {
    mockContext.mockReturnValue({ ...context(['creator-id']), pageType });
    render(<MessageOnInstagramCommand />);
    expect(mockOpen).toHaveBeenCalledWith({
      creatorRecordId:
        pageType === ContextStorePageType.Index ? 'creator-id' : undefined,
    });
  },
);
it.each([
  ['zero', [], [], 'creator'],
  ['bulk', ['a', 'b'], ['a', 'b'], 'creator'],
  ['hidden unloaded second selection', ['a', 'b'], ['a'], 'creator'],
  ['unloaded only selection', ['a'], [], 'creator'],
  ['stale loaded selection', ['a'], ['b'], 'creator'],
  ['implicit loaded only', [], ['a'], 'creator'],
  ['person', ['a'], ['a'], 'person'],
  ['company', ['a'], ['a'], 'company'],
  ['other object', ['a'], ['a'], 'customObject'],
])('does not prefill %s', (_name, ids, loaded, objectName) => {
  mockContext.mockReturnValue(
    context(ids as string[], loaded as string[], objectName as string),
  );
  render(<MessageOnInstagramCommand />);
  expect(mockOpen).toHaveBeenCalledWith({ creatorRecordId: undefined });
});
it('does not prefill exclusions even with one loaded Creator', () => {
  mockContext.mockReturnValue({
    ...context(['a']),
    targetedRecordsRule: { mode: 'exclusion', excludedRecordIds: [] },
  });
  render(<MessageOnInstagramCommand />);
  expect(mockOpen).toHaveBeenCalledWith({ creatorRecordId: undefined });
});
it('opens without object context', () => {
  mockContext.mockReturnValue({ ...context(), objectMetadataItem: null });
  render(<MessageOnInstagramCommand />);
  expect(mockOpen).toHaveBeenCalledWith({ creatorRecordId: undefined });
});
it('waits for account loading and opens only once after readiness', async () => {
  mockQuery.mockReturnValue({ loading: true });
  const { rerender } = render(<MessageOnInstagramCommand />);
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  mockQuery.mockReturnValue(readyAccount);
  rerender(<MessageOnInstagramCommand />);
  await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
  rerender(<MessageOnInstagramCommand />);
  expect(mockOpen).toHaveBeenCalledTimes(1);
});
it.each([true, false])(
  'routes unavailable account only with settings permission=%s',
  (canManage) => {
    mockPermission.mockImplementation(
      (flag) => flag !== PermissionFlagType.CONNECTED_ACCOUNTS || canManage,
    );
    mockQuery.mockReturnValue({
      loading: false,
      data: {
        instagramMessageComposerAccount: {
          status: 'BLOCKED',
          code: 'ACCOUNT_UNAVAILABLE',
          sender: null,
        },
      },
    });
    render(<MessageOnInstagramCommand />);
    expect(mockOpen).not.toHaveBeenCalled();
    if (canManage)
      expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.AccountsInstagram);
    else {
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockError).toHaveBeenCalledWith({
        message: 'Please contact your admin.',
      });
    }
  },
);
it.each([
  { loading: false, error: new Error('lookup failed') },
  { ...readyAccount, error: new Error('partial data is not readiness') },
  { loading: false },
  {
    loading: false,
    data: {
      instagramMessageComposerAccount: {
        status: 'BLOCKED',
        code: 'MISSING_ROUTE_PERMISSION',
        sender: null,
      },
    },
  },
  {
    loading: false,
    data: {
      instagramMessageComposerAccount: { status: 'READY', sender: null },
    },
  },
])(
  'does not treat query failures or invalid readiness as absent account',
  (queryResult) => {
    mockQuery.mockReturnValue(queryResult);
    render(<MessageOnInstagramCommand />);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).not.toHaveBeenCalledWith({
      message: 'Please contact your admin.',
    });
  },
);
