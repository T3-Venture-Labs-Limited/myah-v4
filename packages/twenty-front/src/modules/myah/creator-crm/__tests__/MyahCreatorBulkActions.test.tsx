import { fireEvent, render, screen } from '@testing-library/react';

import { MyahCreatorBulkActions } from '@/myah/creator-crm/components/MyahCreatorBulkActions';

const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const mockOpenModal = jest.fn();
const mockSetTargetedRecordsRule = jest.fn();

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

jest.mock(
  '@/context-store/states/contextStoreTargetedRecordsRuleComponentState',
  () => ({
    contextStoreTargetedRecordsRuleComponentState: 'targeted-records-rule',
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => ({
      mode: 'selection',
      selectedRecordIds: ['creator-a'],
    }),
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetTargetedRecordsRule,
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

jest.mock('@/myah/creator-crm/hooks/useCreatorListContext', () => ({
  useCreatorListContext: () => undefined,
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    dropdownComponents,
  }: React.PropsWithChildren<{
    clickableComponent: React.ReactNode;
    dropdownComponents: React.ReactNode;
  }>) => (
    <div>
      {clickableComponent}
      {dropdownComponents}
    </div>
  ),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({ title, onClick }: { title: string; onClick: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
}));

jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({ text, onClick }: { text: string; onClick: () => void }) => (
    <button onClick={onClick}>{text}</button>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: React.PropsWithChildren) => (
    <>{children}</>
  ),
}));

jest.mock(
  '@/myah/creator-crm/components/CreatorBulkRelationshipTargetPickerDialog',
  () => ({
    CreatorBulkRelationshipTargetPickerDialog: ({
      onTargetSelected,
    }: {
      onTargetSelected: (target: {
        kind: 'creator-list';
        id: string;
        label: string;
      }) => void;
    }) => (
      <button
        onClick={() =>
          onTargetSelected({
            kind: 'creator-list',
            id: 'list-a',
            label: 'Spring creators',
          })
        }
      >
        Choose Spring creators
      </button>
    ),
    CREATOR_BULK_RELATIONSHIP_TARGET_PICKER_MODAL_ID: 'target-picker',
  }),
);

jest.mock(
  '@/myah/creator-crm/components/CreatorBulkRelationshipDialog',
  () => ({
    getCreatorBulkRelationshipDialogId: ({
      operation,
      target,
    }: {
      operation: string;
      target: { kind: string; id: string };
    }) => `creator-bulk-relationship-${operation}-${target.kind}-${target.id}`,
    CreatorBulkRelationshipDialog: ({
      action,
      onSuccess,
    }: {
      action: { operation: string; target: { label: string } };
      onSuccess: () => void;
    }) => (
      <div>
        <span>{`${action.operation}:${action.target.label}`}</span>
        <button onClick={onSuccess}>Complete relationship</button>
      </div>
    ),
  }),
);

describe('MyahCreatorBulkActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the existing add-to-List picker flow and opens an add confirmation', () => {
    render(<MyahCreatorBulkActions />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Add to Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose Spring creators' }),
    );

    expect(screen.getByText('add:Spring creators')).toBeVisible();
    expect(mockOpenModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-add-creator-list-list-a',
    );
  });

  it('clears the native selection only after a successful add relationship mutation', () => {
    render(<MyahCreatorBulkActions />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Add to Creator List' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose Spring creators' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete relationship' }),
    );

    expect(mockSetTargetedRecordsRule).toHaveBeenCalledWith({
      mode: 'selection',
      selectedRecordIds: [],
    });
  });
});
