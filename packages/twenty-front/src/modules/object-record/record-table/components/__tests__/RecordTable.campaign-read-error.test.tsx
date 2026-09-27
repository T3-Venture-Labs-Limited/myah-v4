import { fireEvent, render, screen } from '@testing-library/react';
import { RecordTable } from '@/object-record/record-table/components/RecordTable';

const mockRetry = jest.fn();
let mockReadError = true;
jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    embeddedSurfaceOptions: { showInitialReadError: true },
  }),
}));
jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: () => ({
    recordTableId: 'table',
    objectNameSingular: 'campaignCreator',
    objectMetadataItem: { id: 'metadata' },
    visibleRecordFields: [],
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canReadObjectRecords: true }),
}));
jest.mock(
  '@/object-record/record-table/virtualization/hooks/useTriggerInitialRecordTableDataLoad',
  () => ({
    useTriggerInitialRecordTableDataLoad: () => ({
      triggerInitialRecordTableDataLoad: mockRetry,
    }),
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (state: { key: string }) =>
      state.key === 'recordTableInitialReadErrorComponentState'
        ? mockReadError
        : false,
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => false,
  }),
);
jest.mock(
  '@/object-record/record-table/hooks/internal/useResetTableRowSelection',
  () => ({
    useResetTableRowSelection: () => ({ resetTableRowSelection: jest.fn() }),
  }),
);
jest.mock('@/ui/utilities/pointer-event/hooks/useClickOutsideListener', () => ({
  useClickOutsideListener: () => ({ toggleClickOutside: jest.fn() }),
}));
jest.mock(
  '@/object-record/record-table/components/RecordTableBodyEffectsWrapper',
  () => ({ RecordTableBodyEffectsWrapper: () => null }),
);
jest.mock(
  '@/object-record/record-table/components/RecordTableScrollToFocusedCellEffect',
  () => ({ RecordTableScrollToFocusedCellEffect: () => null }),
);
jest.mock(
  '@/object-record/record-table/components/RecordTableScrollToFocusedRowEffect',
  () => ({ RecordTableScrollToFocusedRowEffect: () => null }),
);
jest.mock('@/object-record/record-table/components/RecordTableEmpty', () => ({
  RecordTableEmpty: () => <div>No rows</div>,
}));
jest.mock('@/object-record/record-table/components/RecordTableContent', () => ({
  RecordTableContent: () => <div>Membership rows</div>,
}));
jest.mock('twenty-ui/input', () => ({
  Button: ({ title, onClick }: { title: string; onClick: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
}));

it('replaces a false empty Campaign membership table with a retryable failed-read state', () => {
  mockReadError = true;
  mockRetry.mockClear();
  const { rerender } = render(<RecordTable />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'audience count is unknown',
  );
  expect(screen.queryByText('No rows')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry Campaign Influencers' }),
  );
  expect(mockRetry).toHaveBeenCalledTimes(1);
  mockReadError = false;
  rerender(<RecordTable />);
  expect(screen.getByText('No rows')).toBeVisible();
});
