import { render, screen } from '@testing-library/react';

import { ObjectOptionsDropdownLayoutContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownLayoutContent';
import { ViewType } from '@/views/types/ViewType';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';

const mockObjectOptions = {
  dropdownId: 'creator-list-options',
  isLayoutLocked: true,
  objectMetadataItem: { fields: [] },
  onContentChange: jest.fn(),
  resetContent: jest.fn(),
  viewType: ViewType.TABLE,
};

let mockCurrentViewType = ViewType.KANBAN;

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({ useObjectOptionsDropdown: () => mockObjectOptions }),
);

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useSetViewTypeFromLayoutOptionsMenu',
  () => ({
    useSetViewTypeFromLayoutOptionsMenu: () => ({
      setAndPersistViewType: jest.fn(),
    }),
  }),
);

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({
    currentView: {
      isCompact: false,
      key: null,
      openRecordIn: ViewOpenRecordIn.RECORD_PAGE,
      type: mockCurrentViewType,
    },
  }),
}));

jest.mock('@/views/hooks/useUpdateCurrentView', () => ({
  useUpdateCurrentView: () => ({ updateCurrentView: jest.fn() }),
}));

jest.mock('@/views/view-picker/hooks/useGetAvailableFieldsForCalendar', () => ({
  useGetAvailableFieldsForCalendar: () => ({
    availableFieldsForCalendar: [{}],
    navigateToDateFieldSettings: jest.fn(),
  }),
}));

jest.mock(
  '@/views/view-picker/hooks/useGetAvailableFieldsToGroupRecordsBy',
  () => ({
    useGetAvailableFieldsToGroupRecordsBy: () => ({
      availableFieldsForGrouping: [{}],
      navigateToSelectSettings: jest.fn(),
    }),
  }),
);

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => undefined,
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ViewOpenRecordIn.SIDE_PANEL,
}));

jest.mock('@lingui/react', () => ({
  useLingui: () => {
    const translate = (message: unknown) => {
      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        return message.join('');
      }

      if (message && typeof message === 'object' && 'message' in message) {
        const descriptor = message as {
          message: string;
          values?: Record<string, unknown>;
        };

        return descriptor.message.replace(/\{(\w+)\}/g, (_match, key: string) =>
          String(descriptor.values?.[key] ?? ''),
        );
      }

      return '';
    };

    return { i18n: { _: translate }, t: translate };
  },
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
  () => ({ DropdownMenuHeaderLeftComponent: () => null }),
);

jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownMenuSeparator', () => ({
  DropdownMenuSeparator: () => null,
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
  IconBaselineDensitySmall: () => null,
  IconCalendar: () => null,
  IconCalendarWeek: () => null,
  IconChevronLeft: () => null,
  IconLayoutList: () => null,
  IconLayoutNavbar: () => null,
  IconLayoutSidebarRight: () => null,
  IconTable: () => null,
}));

jest.mock('twenty-ui/surfaces', () => ({
  OverflowingTextWithTooltip: ({ text }: { text: string }) => <>{text}</>,
}));

jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({
    contextualText,
    text,
  }: {
    contextualText?: string;
    text: string;
  }) => (
    <output>{`${text}${contextualText ? ` ${contextualText}` : ''}`}</output>
  ),
  MenuItemSelect: ({ text }: { text: string }) => <output>{text}</output>,
  MenuItemToggle: ({ text }: { text: string }) => <output>{text}</output>,
}));

describe('ObjectOptionsDropdownLayoutContent', () => {
  beforeEach(() => {
    mockCurrentViewType = ViewType.KANBAN;
  });

  it('keeps Open In but suppresses view-type and Board layout controls for a forced Table', () => {
    render(<ObjectOptionsDropdownLayoutContent />);

    expect(screen.getByText('Open in Record Page')).toBeVisible();
    expect(screen.queryByText('Table')).not.toBeInTheDocument();
    expect(screen.queryByText('Kanban')).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('Group')).not.toBeInTheDocument();
    expect(screen.queryByText('Compact view')).not.toBeInTheDocument();
  });

  it('suppresses view-type controls for a locked Table with a stored Table view', () => {
    mockCurrentViewType = ViewType.TABLE;

    render(<ObjectOptionsDropdownLayoutContent />);

    expect(screen.queryByText('Table')).not.toBeInTheDocument();
    expect(screen.queryByText('Kanban')).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument();
  });

  it('summarizes Open In from the scoped current view rather than main state', () => {
    render(<ObjectOptionsDropdownLayoutContent />);

    expect(screen.getByText('Open in Record Page')).toBeVisible();
  });
});
