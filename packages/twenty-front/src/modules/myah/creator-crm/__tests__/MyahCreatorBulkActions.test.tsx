import { act, fireEvent, render, screen } from '@testing-library/react';

import { MyahCreatorBulkActions } from '@/myah/creator-crm/components/MyahCreatorBulkActions';

const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockSetTargetedRecordsRule = jest.fn();
const mockUseFindOneRecord = jest.fn();
let selectedCreatorIds = ['creator-a'];

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({ objectNamePlural: 'creators' }),
}));

jest.mock('@/object-metadata/hooks/useFilteredObjectMetadataItems', () => ({
  useFilteredObjectMetadataItems: () => ({
    findObjectMetadataItemByNamePlural: () => ({
      universalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
  }),
}));

jest.mock('@/context-store/states/contextStoreTargetedRecordsRuleComponentState', () => ({
  contextStoreTargetedRecordsRuleComponentState: {},
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => ({
  useAtomComponentStateValue: () => ({
    mode: 'selection',
    selectedRecordIds: selectedCreatorIds,
  }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetTargetedRecordsRule,
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (args: unknown) => mockUseFindOneRecord(args),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal, closeModal: mockCloseModal }),
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    dropdownComponents,
  }: {
    clickableComponent: React.ReactNode;
    dropdownComponents: React.ReactNode;
  }) => (
    <div>
      {clickableComponent}
      {dropdownComponents}
    </div>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose?: () => void;
  }) => (
    <div>
      {children}
      {onClose && <button onClick={onClose}>Dismiss target picker</button>}
      {onClose && (
        <button onClick={onClose}>Dismiss target picker again</button>
      )}
    </div>
  ),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({
    FormSingleRecordPicker: ({
      label,
      onChange,
    }: {
      label: string;
      onChange: (value: string) => void;
    }) => <button onClick={() => onChange('list-a')}>{label}</button>,
  }),
);

jest.mock('@/myah/creator-crm/components/CreatorBulkRelationshipDialog', () => ({
  getCreatorBulkRelationshipDialogId: ({ id }: { id: string }) =>
    `creator-bulk-relationship-${id}`,
  CreatorBulkRelationshipDialog: ({
    target,
    onClose,
  }: {
    target: { label: string };
    onClose: () => void;
  }) => (
    <div>
      <span>{target.label}</span>
      <button onClick={onClose}>Dismiss preview</button>
    </div>
  ),
}));

jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({ text, onClick }: { text: string; onClick: () => void }) => (
    <button onClick={onClick}>{text}</button>
  ),
}));

describe('MyahCreatorBulkActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectedCreatorIds = ['creator-a'];
  });

  it('opens a preview for an unnamed selected Creator List', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-a', name: '' },
    });

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a Creator List' }),
    );

    expect(screen.getByText('Untitled Creator List')).toBeVisible();
    expect(mockOpenModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-list-a',
    );
  });
  it('keeps the preview open when the target picker closes after selecting a list', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-a', name: 'Spring creators' },
    });

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss target picker' }),
    );

    expect(screen.getByText('Spring creators')).toBeVisible();
    expect(mockOpenModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-list-a',
    );
  });

  it('keeps the preview open through multiple target picker close callbacks', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-a', name: 'Spring creators' },
    });

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss target picker' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss target picker again' }),
    );

    expect(screen.getByText('Spring creators')).toBeVisible();
    expect(mockOpenModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-list-a',
    );
  });

  it('does not reopen a dismissed preview after the selection state rerenders', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-a', name: 'Spring creators' },
    });

    const { rerender } = render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a Creator List' }),
    );
    expect(mockOpenModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-list-a',
    );

    mockOpenModal.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss preview' }));
    selectedCreatorIds = ['creator-a', 'creator-b'];
    act(() => rerender(<MyahCreatorBulkActions />));

    expect(mockOpenModal).not.toHaveBeenCalled();
  });
});
