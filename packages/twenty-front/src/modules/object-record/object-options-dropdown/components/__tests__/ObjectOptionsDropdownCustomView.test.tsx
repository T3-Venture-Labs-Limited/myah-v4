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
  viewType: ViewType.TABLE,
};

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
      type: ViewType.KANBAN,
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
  it('summarizes fields from the forced Table scope instead of Board fields', () => {
    render(<ObjectOptionsDropdownCustomView />);

    expect(screen.getByText('Fields 2 shown')).toBeVisible();
    expect(screen.queryByText('Fields 9 shown')).not.toBeInTheDocument();
  });
});
