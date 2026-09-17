import { act, render, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { ContextStorePageType } from 'twenty-shared/types';

import { MessageOnInstagramCommand } from '@/command-menu-item/engine-command/global/components/MessageOnInstagramCommand';
import { CommandComponentInstanceContext } from '@/command-menu-item/engine-command/states/contexts/CommandComponentInstanceContext';
import { headlessCommandContextApisState } from '@/command-menu-item/engine-command/states/headlessCommandContextApisState';
import { buildHeadlessCommandContextApi } from '@/command-menu-item/engine-command/utils/buildHeadlessCommandContextApi';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentPageTypeComponentState } from '@/context-store/states/contextStoreCurrentPageTypeComponentState';
import { contextStoreTargetedRecordsRuleComponentState } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { EngineComponentKey } from '~/generated-metadata/graphql';

const mockOpen = jest.fn();
const mockQuery = jest.fn();
const mockUnmount = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useQuery: () => mockQuery(),
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({}),
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));
jest.mock('@/side-panel/hooks/useOpenInstagramMessageInSidePanel', () => ({
  useOpenInstagramMessageInSidePanel: () => ({
    openInstagramMessageInSidePanel: mockOpen,
  }),
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => jest.fn(),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));
jest.mock(
  '@/command-menu-item/engine-command/hooks/useUnmountEngineCommand',
  () => ({
    useUnmountCommand: () => mockUnmount,
  }),
);
jest.mock('@/context-store/utils/computeContextStoreFilters', () => ({
  computeContextStoreFilters: () => null,
}));
jest.mock(
  '@/object-metadata/states/flattenedFieldMetadataItemsSelector',
  () => {
    const { atom } = jest.requireActual('jotai');
    return { flattenedFieldMetadataItemsSelector: { atom: atom([]) } };
  },
);
jest.mock('@/object-metadata/states/objectMetadataItemsSelector', () => {
  const { atom } = jest.requireActual('jotai');
  return {
    objectMetadataItemsSelector: {
      atom: atom([
        {
          id: 'creator-object',
          nameSingular: 'creator',
          namePlural: 'creators',
        },
      ]),
    },
  };
});

const readyAccount = {
  loading: false,
  data: {
    instagramMessageComposerAccount: {
      status: 'READY',
      sender: { accountRecordId: 'sender', label: '@sender' },
    },
  },
};

const captureContext = (
  store: ReturnType<typeof createStore>,
  instanceId: string,
  pageType: ContextStorePageType,
  selectedRecordIds = ['creator-id'],
  loadedIds = selectedRecordIds,
) => {
  store.set(
    contextStoreCurrentPageTypeComponentState.atomFamily({ instanceId }),
    pageType,
  );
  store.set(
    contextStoreCurrentObjectMetadataItemIdComponentState.atomFamily({
      instanceId,
    }),
    'creator-object',
  );
  store.set(
    contextStoreTargetedRecordsRuleComponentState.atomFamily({ instanceId }),
    { mode: 'selection', selectedRecordIds },
  );
  for (const id of loadedIds) {
    store.set(recordStoreFamilyState.atomFamily(id), {
      id,
      __typename: 'Creator',
    });
  }
  const context = buildHeadlessCommandContextApi({
    store,
    contextStoreInstanceId: instanceId,
    engineComponentKey: EngineComponentKey.MESSAGE_ON_INSTAGRAM,
  });
  store.set(
    headlessCommandContextApisState.atom,
    (contexts) => new Map([...contexts, [instanceId, context]]),
  );
  return context;
};

const command = (
  store: ReturnType<typeof createStore>,
  instanceIds: string[],
) => (
  <Provider store={store}>
    {instanceIds.map((instanceId) => (
      <CommandComponentInstanceContext.Provider
        key={instanceId}
        value={{ instanceId }}
      >
        <MessageOnInstagramCommand />
      </CommandComponentInstanceContext.Provider>
    ))}
  </Provider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReturnValue({ loading: true });
});

it.each([
  [ContextStorePageType.Record, ContextStorePageType.Index, undefined],
  [ContextStorePageType.Index, ContextStorePageType.Record, 'creator-id'],
])(
  'retains the %s selection decision after navigation to %s during account loading',
  async (initialPage, nextPage, creatorRecordId) => {
    const store = createStore();
    captureContext(store, 'main', initialPage);
    const { rerender } = render(command(store, ['main']));
    expect(mockOpen).not.toHaveBeenCalled();
    act(() => {
      store.set(
        contextStoreCurrentPageTypeComponentState.atomFamily({
          instanceId: 'main',
        }),
        nextPage,
      );
      store.set(
        contextStoreTargetedRecordsRuleComponentState.atomFamily({
          instanceId: 'main',
        }),
        { mode: 'selection', selectedRecordIds: ['different-creator'] },
      );
    });
    expect(mockOpen).not.toHaveBeenCalled();
    mockQuery.mockReturnValue(readyAccount);
    rerender(command(store, ['main']));
    await waitFor(() => expect(mockUnmount).toHaveBeenCalledWith('main'));
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith({ creatorRecordId });
    rerender(command(store, ['main']));
    expect(mockOpen).toHaveBeenCalledTimes(1);
  },
);

it('isolates concurrent command context snapshots', async () => {
  const store = createStore();
  captureContext(store, 'record-pane', ContextStorePageType.Record, [
    'implicit-creator',
  ]);
  captureContext(store, 'index-pane', ContextStorePageType.Index, [
    'explicit-creator',
  ]);
  const { rerender } = render(command(store, ['record-pane', 'index-pane']));
  act(() => {
    store.set(
      contextStoreCurrentPageTypeComponentState.atomFamily({
        instanceId: 'record-pane',
      }),
      ContextStorePageType.Index,
    );
    store.set(
      contextStoreCurrentPageTypeComponentState.atomFamily({
        instanceId: 'index-pane',
      }),
      ContextStorePageType.Record,
    );
  });
  mockQuery.mockReturnValue(readyAccount);
  rerender(command(store, ['record-pane', 'index-pane']));
  await waitFor(() => expect(mockUnmount).toHaveBeenCalledTimes(2));
  expect(mockOpen.mock.calls).toEqual([
    [{ creatorRecordId: undefined }],
    [{ creatorRecordId: 'explicit-creator' }],
  ]);
});

it.each([
  ['unloaded selection', ['missing'], []],
  ['partially loaded bulk selection', ['loaded', 'missing'], ['loaded']],
])(
  'does not prefill a captured %s after records load',
  async (_name, selectedIds, loadedIds) => {
    const store = createStore();
    captureContext(
      store,
      'main',
      ContextStorePageType.Index,
      selectedIds,
      loadedIds,
    );
    const { rerender } = render(command(store, ['main']));
    act(() => {
      store.set(recordStoreFamilyState.atomFamily('missing'), {
        id: 'missing',
        __typename: 'Creator',
      });
    });
    mockQuery.mockReturnValue(readyAccount);
    rerender(command(store, ['main']));
    await waitFor(() => expect(mockUnmount).toHaveBeenCalledTimes(1));
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith({ creatorRecordId: undefined });
  },
);
