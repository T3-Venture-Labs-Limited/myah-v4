import { render, screen } from '@testing-library/react';

import { RecordTableNoRecordGroupAddNew } from '@/object-record/record-table/components/RecordTableNoRecordGroupAddNew';

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
  useCreateNewIndexRecord: () => ({ createNewIndexRecord: jest.fn() }),
}));

jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({ upsertRecordsInStore: jest.fn() }),
}));

jest.mock(
  '@/object-record/record-table/virtualization/hooks/useLoadRecordsToVirtualRows',
  () => ({
    useLoadRecordsToVirtualRows: () => ({
      loadRecordsToVirtualRows: jest.fn(),
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
    useAtomComponentStateValue: () => false,
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
    RecordTableActionRow: ({ text }: { text: string }) => (
      <button>{text}</button>
    ),
  }),
);

describe('RecordTableNoRecordGroupAddNew', () => {
  beforeEach(() => {
    hideAddNew = false;
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
