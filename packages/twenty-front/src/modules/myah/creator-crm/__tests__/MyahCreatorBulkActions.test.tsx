import { act, fireEvent, render, screen } from '@testing-library/react';

import { MyahCreatorBulkActions } from '@/myah/creator-crm/components/MyahCreatorBulkActions';

const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockSetTargetedRecordsRule = jest.fn();
const mockUseFindOneRecord = jest.fn();
const mockCreateOneRecord = jest.fn();
let selectedCreatorIds = ['creator-a'];
let canCreateTarget = true;

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
  contextStoreTargetedRecordsRuleComponentState: 'targeted-records-rule',
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => ({
  useAtomComponentStateValue: (state: unknown) =>
    state === 'targeted-records-rule'
      ? {
          mode: 'selection',
          selectedRecordIds: selectedCreatorIds,
        }
      : '',
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetTargetedRecordsRule,
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (args: unknown) => mockUseFindOneRecord(args),
}));

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: mockCreateOneRecord }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        id: 'creator-list-metadata',
        nameSingular: 'creatorList',
      },
    ],
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({
    objectPermissionsByObjectMetadataId: { 'creator-list-metadata': {} },
  }),
}));

jest.mock(
  '@/object-record/utils/canCreateRecordsForObjectMetadataItem',
  () => ({
    canCreateRecordsForObjectMetadataItem: () => canCreateTarget,
  }),
);

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
  }: {
    children: React.ReactNode;
  }) => {
    const firstChild = Array.isArray(children) ? children[0] : children;
    const title = (
      firstChild as React.ReactElement<{ title?: string }> | undefined
    )?.props.title;

    return (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    );
  },
}));

jest.mock(
  '@/object-record/record-picker/single-record-picker/components/SingleRecordPicker',
  () => ({
    SingleRecordPicker: ({
      onMorphItemSelected,
      onCreate,
    }: {
      onMorphItemSelected: (item: { recordId: string }) => void;
      onCreate?: (initialName?: string) => void;
    }) => (
      <>
        <button onClick={() => onMorphItemSelected({ recordId: 'list-a' })}>
          Choose Spring creators
        </button>
        {onCreate && (
          <button onClick={() => onCreate('Spring launch')}>
            Native create target
          </button>
        )}
      </>
    ),
  }),
);

jest.mock('@/ui/input/components/SettingsTextInput', () => ({
  SettingsTextInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

jest.mock('twenty-ui/typography', () => ({
  H1Title: ({ title }: { title: string }) => <h1>{title}</h1>,
  H1TitleFontColor: { Primary: 'primary' },
}));

jest.mock('@/myah/creator-crm/components/CreatorBulkRelationshipDialog', () => ({
  getCreatorBulkRelationshipDialogId: ({ id }: { id: string }) =>
    `creator-bulk-relationship-${id}`,
  CreatorBulkRelationshipDialog: ({
    target,
    onClose,
    onSuccess,
  }: {
    target: { label: string };
    onClose: () => void;
    onSuccess: () => void;
  }) => (
    <div>
      <span>{target.label}</span>
      <button onClick={onClose}>Dismiss preview</button>
      <button onClick={onSuccess}>Complete relationship</button>
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
    mockUseFindOneRecord.mockReturnValue({ record: undefined });
    canCreateTarget = true;
  });

  it('opens an opaque native list picker', () => {
    render(<MyahCreatorBulkActions />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));

    expect(
      screen.getByRole('dialog', { name: 'Add creators to a list' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Create new list' }),
    ).toBeVisible();
  });

  it('hides named creation when the target object cannot be created', () => {
    canCreateTarget = false;

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));

    expect(
      screen.queryByRole('button', { name: 'Create new list' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Native create target' }),
    ).not.toBeInTheDocument();
  });

  it('requires a nonempty name before creating and selecting a new list', async () => {
    mockCreateOneRecord.mockResolvedValue({
      id: 'created-list',
      name: 'Spring launch',
    });
    mockUseFindOneRecord.mockImplementation(({ objectRecordId }) => ({
      record:
        objectRecordId === 'created-list'
          ? { id: 'created-list', name: 'Spring launch' }
          : undefined,
    }));

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create new list' }));

    const nameDialog = screen.getByRole('dialog', {
      name: 'Create new list',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create list' }),
    );

    expect(nameDialog).toBeVisible();
    expect(mockCreateOneRecord).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: ' Spring launch ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create list' }));
    });

    expect(mockCreateOneRecord).toHaveBeenCalledWith({ name: 'Spring launch' });
    expect(screen.getByText('Spring launch')).toBeVisible();
    expect(mockCloseModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-target-picker',
    );
  });

  it('opens the preview for an existing selected list', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-a', name: 'Spring creators' },
    });

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose Spring creators' }),
    );

    expect(screen.getByText('Spring creators')).toBeVisible();
    expect(mockOpenModal).toHaveBeenCalledWith(
      'creator-bulk-relationship-list-a',
    );
  });

  it('clears the selected creators after a successful relationship mutation', () => {
    mockUseFindOneRecord.mockReturnValue({
      record: { id: 'list-a', name: 'Spring creators' },
    });

    render(<MyahCreatorBulkActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Creator List' }));
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
