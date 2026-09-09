import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { RecordTableNoRecordGroupAddNew } from '@/object-record/record-table/components/RecordTableNoRecordGroupAddNew';

import { totalNumberOfRecordsToVirtualizeComponentState } from '@/object-record/record-table/virtualization/states/totalNumberOfRecordsToVirtualizeComponentState';
const mockCreateNewIndexRecord = jest.fn();
const mockUpsertRecordsInStore = jest.fn();
const mockLoadRecordsToVirtualRows = jest.fn();
let hideAddNew = false;

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    embeddedSurfaceOptions: { hideAddNew },
  }),
}));

jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({
    objectMetadataItem: { id: 'campaign-creator-object' },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canCreateObjectRecords: true }),
}));

jest.mock('@/object-record/record-table/hooks/useCreateNewIndexRecord', () => ({
  useCreateNewIndexRecord: () => ({
    createNewIndexRecord: mockCreateNewIndexRecord,
  }),
}));

jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({
    upsertRecordsInStore: mockUpsertRecordsInStore,
  }),
}));

jest.mock(
  '@/object-record/record-table/virtualization/hooks/useLoadRecordsToVirtualRows',
  () => ({
    useLoadRecordsToVirtualRows: () => ({
      loadRecordsToVirtualRows: mockLoadRecordsToVirtualRows,
    }),
  }),
);

jest.mock(
  '@/object-record/utils/canCreateRecordsForObjectMetadataItem',
  () => ({
    canCreateRecordsForObjectMetadataItem: () => true,
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (state: unknown) =>
      state === totalNumberOfRecordsToVirtualizeComponentState ? 3 : false,
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => false,
  }),
);

jest.mock(
  '@/object-record/record-table/record-table-row/components/RecordTableActionRow',
  () => ({
    RecordTableActionRow: ({
      text,
      onClick,
    }: {
      text: string;
      onClick: () => void;
    }) => <button onClick={onClick}>{text}</button>,
  }),
);

describe('RecordTableNoRecordGroupAddNew', () => {
  beforeEach(() => {
    hideAddNew = false;
    jest.clearAllMocks();
  });

  it('keeps Add New available for the normal Creators table', () => {
    render(<RecordTableNoRecordGroupAddNew />);

    expect(screen.getByRole('button', { name: 'Add New' })).toBeVisible();
  });

  it('removes Add New from an embedded Campaign table', () => {
    hideAddNew = true;

    render(<RecordTableNoRecordGroupAddNew />);

    expect(
      screen.queryByRole('button', { name: 'Add New' }),
    ).not.toBeInTheDocument();
  });
});

it.each([undefined, { id: 'created-record' }])(
  'virtualizes only a defined native creation result: %j',
  async (record) => {
    hideAddNew = false;
    jest.clearAllMocks();
    mockCreateNewIndexRecord.mockResolvedValueOnce(record);
    render(<RecordTableNoRecordGroupAddNew />);
    fireEvent.click(screen.getByRole('button', { name: 'Add New' }));
    await waitFor(() =>
      expect(mockCreateNewIndexRecord).toHaveBeenCalledWith({
        position: 'last',
      }),
    );
    if (record) {
      await waitFor(() =>
        expect(mockUpsertRecordsInStore).toHaveBeenCalledWith({
          partialRecords: [record],
        }),
      );
      expect(mockLoadRecordsToVirtualRows).toHaveBeenCalledWith({
        records: [record],
        startingRealIndex: 3,
      });
    } else {
      expect(mockUpsertRecordsInStore).not.toHaveBeenCalled();
      expect(mockLoadRecordsToVirtualRows).not.toHaveBeenCalled();
    }
  },
);
