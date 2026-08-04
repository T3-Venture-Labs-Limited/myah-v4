import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { type Store } from 'jotai/vanilla/store';
import { type ReactNode } from 'react';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { useUpdateObjectViewOptions } from '@/object-record/object-options-dropdown/hooks/useUpdateObjectViewOptions';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';

const mockUpdateCurrentView = jest.fn();

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

jest.mock('@/views/hooks/useUpdateCurrentView', () => ({
  useUpdateCurrentView: () => ({ updateCurrentView: mockUpdateCurrentView }),
}));

const getWrapper =
  (store: Store, instanceId: string) =>
  ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <ContextStoreComponentInstanceContext.Provider value={{ instanceId }}>
        {children}
      </ContextStoreComponentInstanceContext.Provider>
    </JotaiProvider>
  );

describe('useUpdateObjectViewOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a scoped view Open In option without mutating the main index state', () => {
    const store = createStore();
    store.set(recordIndexOpenRecordInState.atom, ViewOpenRecordIn.SIDE_PANEL);
    const { result } = renderHook(() => useUpdateObjectViewOptions(), {
      wrapper: getWrapper(store, 'creator-list-pane-list-a'),
    });

    act(() => {
      result.current.setAndPersistOpenRecordIn(ViewOpenRecordIn.RECORD_PAGE, {
        id: 'creator-view-a',
      } as never);
    });

    expect(mockUpdateCurrentView).toHaveBeenCalledWith({
      openRecordIn: ViewOpenRecordIn.RECORD_PAGE,
    });
    expect(store.get(recordIndexOpenRecordInState.atom)).toBe(
      ViewOpenRecordIn.SIDE_PANEL,
    );
  });

  it('keeps the existing main index Open In update behavior', () => {
    const store = createStore();
    const { result } = renderHook(() => useUpdateObjectViewOptions(), {
      wrapper: getWrapper(store, MAIN_CONTEXT_STORE_INSTANCE_ID),
    });

    act(() => {
      result.current.setAndPersistOpenRecordIn(ViewOpenRecordIn.RECORD_PAGE, {
        id: 'creator-view-a',
      } as never);
    });

    expect(mockUpdateCurrentView).toHaveBeenCalledWith({
      openRecordIn: ViewOpenRecordIn.RECORD_PAGE,
    });
    expect(store.get(recordIndexOpenRecordInState.atom)).toBe(
      ViewOpenRecordIn.RECORD_PAGE,
    );
  });
});
