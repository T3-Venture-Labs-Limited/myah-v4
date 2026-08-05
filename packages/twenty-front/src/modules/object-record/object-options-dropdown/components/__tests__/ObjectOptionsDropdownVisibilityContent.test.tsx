import { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { ObjectOptionsDropdownVisibilityContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownVisibilityContent';

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({
    useObjectOptionsDropdown: () => ({
      dropdownId: 'creator-list-options',
      isLayoutLocked: true,
      resetContent: jest.fn(),
    }),
  }),
);
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));
jest.mock('@/views/hooks/useCanPersistViewChanges', () => ({
  useCanPersistViewChanges: () => ({ canPersistChanges: true }),
}));
jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({ currentView: { visibility: 'WORKSPACE' } }),
}));
jest.mock('@/views/hooks/useUpdateCurrentView', () => ({
  useUpdateCurrentView: () => ({ updateCurrentView: jest.fn() }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => undefined,
  }),
);
jest.mock('~/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: jest.fn() }),
}));
jest.mock('@lingui/react', () => ({
  useLingui: () => {
    const translate = (message: { message?: string } | string) =>
      typeof message === 'string' ? message : (message.message ?? '');

    return { i18n: { _: translate }, t: translate };
  },
}));
jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader',
  () => ({
    DropdownMenuHeader: ({ children }: { children: ReactNode }) => (
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
  IconChevronLeft: () => null,
  IconCircle: () => null,
  IconCircleDashed: () => null,
  IconCopy: () => null,
}));
jest.mock('twenty-ui/surfaces', () => ({ AppTooltip: () => null }));
jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({ text }: { text: string }) => <div>{text}</div>,
  MenuItemSelect: ({ text }: { text: string }) => <div>{text}</div>,
}));

describe('ObjectOptionsDropdownVisibilityContent', () => {
  it('hides the custom view copy link in a table-locked scoped pane', () => {
    render(<ObjectOptionsDropdownVisibilityContent />);

    expect(screen.getByText('Workspace')).toBeVisible();
    expect(screen.queryByText('Copy view link')).not.toBeInTheDocument();
  });
});
