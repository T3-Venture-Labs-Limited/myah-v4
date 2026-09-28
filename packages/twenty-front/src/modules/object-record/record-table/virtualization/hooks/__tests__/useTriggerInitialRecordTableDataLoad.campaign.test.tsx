import { act, renderHook } from '@testing-library/react';
import { useTriggerInitialRecordTableDataLoad } from '@/object-record/record-table/virtualization/hooks/useTriggerInitialRecordTableDataLoad';

const mockFindMany = jest.fn();
const mockStoreValues = new Map<string, unknown>();
const mockStore = {
  get: (key: string) => mockStoreValues.get(key),
  set: (key: string, value: unknown) => mockStoreValues.set(key, value),
};
const mockUpsert = jest.fn();
const mockLoadRows = jest.fn();

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));
jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    recordLimit: undefined,
    embeddedSurfaceOptions: { showInitialReadError: true },
  }),
}));
jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({
    recordTableId: 'campaign-membership-table',
    objectNameSingular: 'campaignCreator',
  }),
}));
jest.mock(
  '@/object-record/record-index/hooks/useRecordIndexTableLazyQuery',
  () => ({
    useRecordIndexTableLazyQuery: () => ({ findManyRecordsLazy: mockFindMany }),
  }),
);
jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({ upsertRecordsInStore: mockUpsert }),
}));
jest.mock(
  '@/object-record/record-table/virtualization/hooks/useLoadRecordsToVirtualRows',
  () => ({
    useLoadRecordsToVirtualRows: () => ({
      loadRecordsToVirtualRows: mockLoadRows,
    }),
  }),
);
jest.mock(
  '@/object-record/record-table/virtualization/hooks/useReapplyRowSelection',
  () => ({
    useReapplyRowSelection: () => ({ reapplyRowSelection: jest.fn() }),
  }),
);
jest.mock(
  '@/object-record/record-table/virtualization/hooks/useResetVirtualizedRowTreadmill',
  () => ({
    useResetVirtualizedRowTreadmill: () => ({
      resetVirtualizedRowTreadmill: jest.fn(),
    }),
  }),
);
jest.mock(
  '@/object-record/record-table/virtualization/hooks/useResetTableFocuses',
  () => ({
    useResetTableFocuses: () => ({ resetTableFocuses: jest.fn() }),
  }),
);
jest.mock(
  '@/object-record/record-table/hooks/useScrollTableToPosition',
  () => ({
    useScrollTableToPosition: () => ({ scrollTableToPosition: jest.fn() }),
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: (state: { key: string }) => state.key,
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateCallbackState',
  () => ({
    useAtomComponentFamilyStateCallbackState:
      (state: { key: string }) => (key: string) =>
        `${state.key}-${key}`,
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorCallbackState',
  () => ({
    useAtomComponentSelectorCallbackState: (state: { key: string }) =>
      state.key,
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreValues.clear();
  mockStoreValues.set('recordIndexAllRecordIdsComponentSelector', []);
  mockStoreValues.set('recordIdByRealIndexComponentState', new Map());
  mockStoreValues.set('dataLoadingStatusByRealIndexComponentState', new Map());
});

it('does not convert a failed campaign membership query into an authoritative zero and retries successfully', async () => {
  mockFindMany
    .mockResolvedValueOnce({
      data: undefined,
      records: [],
      totalCount: 0,
      error: new Error('read failed'),
    })
    .mockResolvedValueOnce({
      data: { campaignCreators: {} },
      records: [{ id: 'membership-a' }],
      totalCount: 1,
      error: undefined,
    });
  const { result } = renderHook(() => useTriggerInitialRecordTableDataLoad());
  await act(async () => {
    await result.current.triggerInitialRecordTableDataLoad();
  });
  expect(mockStoreValues.get('recordTableInitialReadErrorComponentState')).toBe(
    true,
  );
  expect(
    mockStoreValues.has('totalNumberOfRecordsToVirtualizeComponentState'),
  ).toBe(false);
  expect(mockUpsert).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.triggerInitialRecordTableDataLoad();
  });
  expect(mockStoreValues.get('recordTableInitialReadErrorComponentState')).toBe(
    false,
  );
  expect(mockUpsert).toHaveBeenCalledWith({
    partialRecords: [{ id: 'membership-a' }],
  });
});
