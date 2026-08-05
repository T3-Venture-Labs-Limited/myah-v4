import { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { ObjectOptionsDropdownDefaultView } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownDefaultView';

const mockObjectOptions = {
  dropdownId: 'creator-list-options',
  isLayoutLocked: true,
  onContentChange: jest.fn(),
  recordIndexId: 'creator-list-index',
};

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({ useObjectOptionsDropdown: () => mockObjectOptions }),
);
jest.mock(
  '@/object-record/record-field/states/visibleRecordFieldsComponentSelector',
  () => ({ visibleRecordFieldsComponentSelector: {} }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({ useAtomComponentSelectorValue: () => [] }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({ useAtomComponentStateValue: () => undefined }),
);
jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({ currentView: { icon: 'IconTable' } }),
}));
jest.mock('@/views/hooks/useOpenCreateViewDropown', () => ({
  useOpenCreateViewDropdown: () => ({ openCreateViewDropdown: jest.fn() }),
}));
jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));
jest.mock('~/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: jest.fn() }),
}));
jest.mock('@lingui/react', () => ({
  useLingui: () => {
    const translate = (message: unknown) =>
      typeof message === 'string'
        ? message
        : message && typeof message === 'object' && 'message' in message
          ? String(message.message)
          : '';

    return { i18n: { _: translate }, t: translate };
  },
}));
jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/ui/layout/dropdown/components/DropdownMenuSeparator', () => ({
  DropdownMenuSeparator: () => null,
}));
jest.mock('@/ui/layout/selectable-list/components/SelectableList', () => ({
  SelectableList: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/ui/layout/selectable-list/components/SelectableListItem', () => ({
  SelectableListItem: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('twenty-ui/icon', () => ({
  IconCopy: () => null,
  IconLayout: () => null,
  IconListDetails: () => null,
  IconLock: () => null,
  useIcons: () => ({ getIcon: () => () => null }),
}));
jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({ text }: { text: string }) => <div>{text}</div>,
}));

describe('ObjectOptionsDropdownDefaultView', () => {
  it('hides the unrehydratable copy link in a table-locked scoped pane', () => {
    render(<ObjectOptionsDropdownDefaultView />);

    expect(screen.getByText('Fields')).toBeVisible();
    expect(screen.queryByText('Copy link to view')).not.toBeInTheDocument();
    expect(screen.getByText('Create custom view')).toBeVisible();
  });
});
