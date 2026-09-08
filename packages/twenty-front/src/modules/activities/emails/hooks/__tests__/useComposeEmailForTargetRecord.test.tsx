import { act, renderHook, waitFor } from '@testing-library/react';
import { SettingsPath } from 'twenty-shared/types';
import { useComposeEmailForTargetRecord } from '@/activities/emails/hooks/useComposeEmailForTargetRecord';
import { MockedProvider } from '@apollo/client/testing/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { JestObjectMetadataItemSetter } from '~/testing/jest/JestObjectMetadataItemSetter';

const metadataWrapper = (objectMetadataItems: EnrichedObjectMetadataItem[]) => {
  const store = resetJotaiStore();
  // Do not seed the shared test wrapper's Company-dependent command context.
  return ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <MockedProvider mocks={[]}>
        <JestObjectMetadataItemSetter objectMetadataItems={objectMetadataItems}>
          {children}
        </JestObjectMetadataItemSetter>
      </MockedProvider>
    </JotaiProvider>
  );
};
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
const mockQuery = jest.fn();
const mockClient = { query: mockQuery };
const mockOpen = jest.fn();
const mockNavigate = jest.fn();
const mockAccount = jest.fn();
const mockTarget = jest.fn();
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/activities/emails/hooks/useFirstConnectedAccount', () => ({
  useFirstConnectedAccount: () => mockAccount(),
}));
jest.mock('@/side-panel/hooks/useOpenComposeEmailInSidePanel', () => ({
  useOpenComposeEmailInSidePanel: () => ({
    openComposeEmailInSidePanel: mockOpen,
  }),
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigate,
}));
jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => mockTarget(),
}));
const items = getTestEnrichedObjectMetadataItemsMock().filter(
  ({ nameSingular }) =>
    !['person', 'company', 'opportunity'].includes(nameSingular),
);
const mount = () =>
  renderHook(() => useComposeEmailForTargetRecord(), {
    wrapper: metadataWrapper(items),
  });
beforeEach(() => {
  jest.clearAllMocks();
  mockAccount.mockReturnValue({
    connectedAccountId: 'account-id',
    loading: false,
  });
  mockTarget.mockReturnValue({
    id: 'custom-id',
    targetObjectNameSingular: 'customObject',
  });
});
it.each([null, 'customObject', 'person', 'company', 'opportunity'])(
  'opens the shared button hook safely for absent %s context metadata',
  async (name) => {
    mockTarget.mockReturnValue({
      id: name ? 'record-id' : null,
      targetObjectNameSingular: name,
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.openComposer());
    expect(mockOpen).toHaveBeenCalledWith({
      connectedAccountId: 'account-id',
      defaultTo: '',
    });
    expect(mockQuery).not.toHaveBeenCalled();
  },
);
it('retains shared account setup behavior', async () => {
  mockAccount.mockReturnValue({ connectedAccountId: null, loading: false });
  const { result } = mount();
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.openComposer());
  expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.NewAccount);
  expect(mockOpen).not.toHaveBeenCalled();
});
