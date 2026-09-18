import { searchRecordStoreFamilyState } from '@/object-record/record-picker/multiple-record-picker/states/searchRecordStoreComponentFamilyState';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { instagramMessageComposerState } from '@/side-panel/pages/instagram-message/states/instagramMessageComposerState';
import { SidePanelInstagramMessagePage } from '@/side-panel/pages/instagram-message/components/SidePanelInstagramMessagePage';

let mockClient: ApolloClient;
const mockSearch = jest.fn();
let mockCreators: RecordPickerPickableMorphItem[] = [];
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));
// Metadata search is the boundary; picker keyboard/commit and composer remain real.
jest.mock(
  '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch',
  () => ({
    useSingleRecordPickerPerformSearch: (args: unknown) => {
      mockSearch(args);
      return {
        pickableMorphItems: mockCreators,
        loading: false,
        error: undefined,
      };
    },
  }),
);
const calls: string[] = [];
let blockedCode: string | null = null;
beforeEach(() => {
  calls.length = 0;
  mockCreators = [];
  mockSearch.mockClear();
  blockedCode = null;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockClient = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          calls.push(operation.operationName ?? '');
          const sender = { accountRecordId: 'account', label: '@sender' };
          const data =
            operation.operationName === 'InstagramMessageComposerAccount'
              ? {
                  instagramMessageComposerAccount: {
                    status: 'READY',
                    sender,
                    code: null,
                  },
                }
              : operation.operationName === 'PrepareInstagramMessageComposer'
                ? {
                    prepareInstagramMessageComposer: {
                      status: blockedCode ? 'BLOCKED' : 'READY',
                      code: blockedCode,
                      normalizedHandle: 'recipient',
                      creatorRecordId: null,
                      sender,
                      actionKind: 'START_CHAT',
                      preparationFingerprint: 'fingerprint',
                    },
                  }
                : {
                    sendInstagramMessageComposer: {
                      status: 'UNKNOWN',
                      receiptId: 'receipt',
                      code: null,
                      nextEligibleAt: null,
                      creatorRecordId: null,
                      conversationRecordId: null,
                    },
                  };
          observer.next({ data });
          observer.complete();
        }),
    ),
  });
});
afterEach(() => mockClient.stop());
const setup = (creatorRecordId?: string) => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, { id: 'workspace' } as never);
  store.set(searchRecordStoreFamilyState.atomFamily('creator'), {
    recordId: 'creator',
    label: 'Ada',
    objectNameSingular: 'creator',
    objectLabelSingular: 'Creator',
    tsRank: 1,
    tsRankCD: 1,
  });
  store.set(instagramMessageComposerState.atomFamily({ instanceId: 'page' }), {
    draftId: 'attempt',
    recipient: creatorRecordId ? { creatorRecordId } : null,
    body: '',
  });
  render(
    <Provider store={store}>
      <I18nProvider i18n={i18n}>
        <SidePanelPageComponentInstanceContext.Provider
          value={{ instanceId: 'page' }}
        >
          <SidePanelInstagramMessagePage />
        </SidePanelPageComponentInstanceContext.Provider>
      </I18nProvider>
    </Provider>,
  );
  return store;
};
it('offers a separate labelled keyboard raw-handle row, prepares only after commit, gates empty body, sends once', async () => {
  setup();
  const recipient = screen.getByRole('combobox', { name: 'To' });
  const send = screen.getByRole('button', { name: 'Send' });
  expect(send).toBeDisabled();
  fireEvent.change(recipient, { target: { value: '@recipient' } });
  expect(calls).not.toContain('PrepareInstagramMessageComposer');
  expect(mockSearch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      objectNameSingulars: ['creator'],
      searchFilter: '@recipient',
    }),
  );
  fireEvent.keyDown(recipient, { key: 'ArrowDown' });
  fireEvent.keyDown(recipient, { key: 'Enter' });
  await screen.findByText('Confirmed recipient: @recipient');
  expect(screen.getByText('@sender')).toBeVisible();
  expect(send).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: 'Hello' },
  });
  await waitFor(() => expect(send).toBeEnabled());
  await act(async () => {
    fireEvent.click(send);
    fireEvent.click(send);
  });
  expect(
    calls.filter((name) => name === 'SendInstagramMessageComposer'),
  ).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled();
  expect(send).toBeDisabled();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
});
it.each([
  'RECIPIENT_UNAVAILABLE',
  'CREATOR_AMBIGUOUS',
  'MISSING_ROUTE_PERMISSION',
])(
  'retains selected Creator and exposes accessible recovery for %s',
  async (code) => {
    blockedCode = code;
    const store = setup('creator');
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(
      store.get(
        instagramMessageComposerState.atomFamily({ instanceId: 'page' }),
      )?.recipient,
    ).toEqual({ creatorRecordId: 'creator' });
    expect(
      screen.getByRole('button', { name: 'Refresh recipient' }),
    ).toBeEnabled();
  },
);

it('selects a Creator with keyboard through the picker search boundary, not a generic create callback', async () => {
  mockCreators = [
    {
      recordId: 'creator',
      objectMetadataId: 'creator-object',
      isSelected: false,
      isMatchingSearchFilter: true,
    },
  ];
  const store = setup();
  const input = screen.getByRole('combobox', { name: 'To' });
  fireEvent.change(input, { target: { value: 'Ada' } });
  expect(screen.getByRole('option', { name: 'Ada' })).toBeVisible();
  expect(calls).not.toContain('PrepareInstagramMessageComposer');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const activeId = input.getAttribute('aria-activedescendant');
  expect(activeId).toBe(screen.getByRole('option', { name: 'Ada' }).id);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(
    store.get(instagramMessageComposerState.atomFamily({ instanceId: 'page' }))
      ?.recipient,
  ).toEqual({ creatorRecordId: 'creator' });
  await screen.findByText('Confirmed recipient: @recipient');
  expect(screen.queryByText('Add New')).not.toBeInTheDocument();
});

it('rejects invalid raw handles without provider preparation and lets keyboard users dismiss results', () => {
  setup();
  const input = screen.getByRole('combobox', { name: 'To' });
  fireEvent.change(input, { target: { value: '@not a handle' } });
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  expect(calls).not.toContain('PrepareInstagramMessageComposer');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveAttribute('aria-expanded', 'false');
  const refresh = screen.getByRole('button', { name: 'Refresh recipient' });
  refresh.focus();
  expect(refresh).toHaveFocus();
});
