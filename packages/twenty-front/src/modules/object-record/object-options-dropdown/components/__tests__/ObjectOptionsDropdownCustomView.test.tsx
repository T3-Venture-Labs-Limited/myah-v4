import { render, screen } from '@testing-library/react';

import { ObjectOptionsDropdownCustomView } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownCustomView';
import { ViewType } from '@/views/types/ViewType';

const mockObjectOptions = {
  closeDropdown: jest.fn(),
  dropdownId: 'creator-list-options',
  objectMetadataItem: {
    fields: [],
    id: 'creator-object',
    nameSingular: 'creator',
  },
  onContentChange: jest.fn(),
  onViewChange: undefined,
  recordIndexId: 'creator-list-index',
  isLayoutLocked: false,
  viewType: ViewType.TABLE,
};

let mockCurrentViewType = ViewType.KANBAN;

jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownMenuViewName',
  () => ({ ObjectOptionsDropdownMenuViewName: () => null }),
);

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({ useObjectOptionsDropdown: () => mockObjectOptions }),
);

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard',
  () => ({
    useObjectOptionsForBoard: () => ({ visibleBoardFields: Array(9).fill({}) }),
  }),
);

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({
    currentView: {
      id: 'creator-board-view',
      isCompact: false,
      key: null,
      name: 'Creator Board',
      type: mockCurrentViewType,
      visibility: 'WORKSPACE',
    },
  }),
}));

jest.mock('@/views/view-picker/hooks/useDestroyViewFromCurrentState', () => ({
  useDestroyViewFromCurrentState: () => ({
    destroyViewFromCurrentState: jest.fn(),
  }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => undefined,
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({
    useAtomFamilySelectorValue: () => [],
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => undefined,
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

jest.mock(
  '@/object-record/record-field/states/visibleRecordFieldsComponentSelector',
  () => ({ visibleRecordFieldsComponentSelector: {} }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => [{}, {}],
  }),
);

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

jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownMenuSeparator', () => ({
  DropdownMenuSeparator: () => null,
}));

jest.mock('@/ui/layout/selectable-list/components/SelectableList', () => ({
  SelectableList: ({
    children,
    selectableItemIdArray,
  }: {
    children: React.ReactNode;
    selectableItemIdArray: string[];
  }) => (
    <>
      <output data-testid="selectable-item-ids">
        {selectableItemIdArray.join(',')}
      </output>
      {children}
    </>
  ),
}));

jest.mock('@/ui/layout/selectable-list/components/SelectableListItem', () => ({
  SelectableListItem: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('twenty-ui/icon', () => ({
  IconCalendar: () => null,
  IconCalendarWeek: () => null,
  IconLayoutList: () => null,
  IconListDetails: () => null,
  IconShare: () => null,
  IconTrash: () => null,
}));

jest.mock('twenty-ui/surfaces', () => ({
  AppTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
}));

describe('ObjectOptionsDropdownCustomView', () => {
  beforeEach(() => {
    mockCurrentViewType = ViewType.KANBAN;
    mockObjectOptions.isLayoutLocked = false;
  });

  it('hides Layout when the rendered Table layout is locked, regardless of the stored view type', () => {
    for (const storedViewType of [
      ViewType.TABLE,
      ViewType.KANBAN,
      ViewType.CALENDAR,
    ]) {
      mockCurrentViewType = storedViewType;
      mockObjectOptions.isLayoutLocked = true;

      const { unmount } = render(<ObjectOptionsDropdownCustomView />);

      expect(screen.queryByText(/^Layout/)).not.toBeInTheDocument();

      unmount();
    }
  });

  it('summarizes fields from the forced Table scope instead of Board fields', () => {
    render(<ObjectOptionsDropdownCustomView />);

    expect(screen.getByText('Fields 2 shown')).toBeVisible();
    expect(screen.queryByText('Fields 9 shown')).not.toBeInTheDocument();
  });

  it('summarizes fields from the forced Table scope for stored Table views', () => {
    mockCurrentViewType = ViewType.TABLE;
    mockObjectOptions.isLayoutLocked = true;

    render(<ObjectOptionsDropdownCustomView />);

    expect(screen.getByText('Fields 2 shown')).toBeVisible();
    expect(screen.queryByText('Fields 9 shown')).not.toBeInTheDocument();
  });

  it('omits Calendar options at the source when a Calendar custom view is forced to Table', () => {
    mockCurrentViewType = ViewType.CALENDAR;
    mockObjectOptions.isLayoutLocked = true;

    render(<ObjectOptionsDropdownCustomView />);

    expect(screen.getByTestId('selectable-item-ids')).toHaveTextContent(
      'Visibility,Fields,Delete view',
    );
    expect(screen.getByTestId('selectable-item-ids')).not.toHaveTextContent(
      'CalendarDateField',
    );
    expect(screen.getByTestId('selectable-item-ids')).not.toHaveTextContent(
      'CalendarView',
    );
    expect(screen.queryByText('Date field')).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar view')).not.toBeInTheDocument();
  });
});
