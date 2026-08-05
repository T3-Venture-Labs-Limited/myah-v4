import { render, screen } from '@testing-library/react';

import { ObjectOptionsDropdownLayoutOpenInContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownLayoutOpenInContent';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({
    useObjectOptionsDropdown: () => ({
      dropdownId: 'scoped-options',
      onContentChange: jest.fn(),
    }),
  }),
);

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useUpdateObjectViewOptions',
  () => ({
    useUpdateObjectViewOptions: () => ({
      setAndPersistOpenRecordIn: jest.fn(),
    }),
  }),
);

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectMetadataItem: { nameSingular: 'creator' },
  }),
}));

jest.mock('@/object-record/utils/canOpenObjectInSidePanel', () => ({
  canOpenObjectInSidePanel: () => true,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => null,
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ViewOpenRecordIn.SIDE_PANEL,
}));

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({
    currentView: { openRecordIn: ViewOpenRecordIn.RECORD_PAGE },
  }),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader',
  () => ({
    DropdownMenuHeader: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  }),
);

jest.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/internal/DropdownMenuHeaderLeftComponent',
  () => ({
    DropdownMenuHeaderLeftComponent: () => null,
  }),
);

jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/selectable-list/components/SelectableList', () => ({
  SelectableList: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/selectable-list/components/SelectableListItem', () => ({
  SelectableListItem: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('twenty-ui/icon', () => ({
  IconChevronLeft: () => null,
  IconLayoutNavbar: () => null,
  IconLayoutSidebarRight: () => null,
}));

jest.mock('twenty-ui/navigation', () => ({
  MenuItemSelect: ({ selected, text }: { selected: boolean; text: string }) => (
    <output data-testid={text}>{selected ? 'selected' : 'unselected'}</output>
  ),
}));

describe('ObjectOptionsDropdownLayoutOpenInContent', () => {
  it('selects Open In from the current scoped view instead of main index state', () => {
    render(<ObjectOptionsDropdownLayoutOpenInContent />);

    expect(screen.getByTestId('Side Panel')).toHaveTextContent('unselected');
    expect(screen.getByTestId('Record Page')).toHaveTextContent('selected');
  });
});
