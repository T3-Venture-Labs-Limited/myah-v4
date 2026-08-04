import { fireEvent, render, screen } from '@testing-library/react';

import { ViewPickerOptionDropdown } from '@/views/view-picker/components/ViewPickerOptionDropdown';
import { ViewVisibility } from '~/generated-metadata/graphql';

const mockCloseDropdown = jest.fn();
const mockMenuItemWithOptionDropdown = jest.fn(
  ({
    dropdownContent,
    text,
  }: {
    dropdownContent: React.ReactNode;
    text: string;
  }) => (
    <>
      <span>{text}</span>
      {dropdownContent}
    </>
  ),
);

jest.mock(
  '@/navigation-menu-item/common/hooks/useCreateManyNavigationMenuItems',
  () => ({
    useCreateManyNavigationMenuItems: () => ({
      createManyNavigationMenuItems: jest.fn(),
    }),
  }),
);

jest.mock(
  '@/navigation-menu-item/common/hooks/useDeleteManyNavigationMenuItems',
  () => ({
    useDeleteManyNavigationMenuItems: () => ({
      deleteManyNavigationMenuItems: jest.fn(),
    }),
  }),
);

jest.mock(
  '@/navigation-menu-item/display/hooks/useNavigationMenuItemsData',
  () => ({
    useNavigationMenuItemsData: () => ({
      currentUserWorkspaceId: 'user-workspace-id',
      navigationMenuItems: [],
    }),
  }),
);

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: mockCloseDropdown }),
}));

jest.mock(
  '@/ui/navigation/menu-item/components/MenuItemWithOptionDropdown',
  () => ({
    MenuItemWithOptionDropdown: (props: {
      dropdownContent: React.ReactNode;
      text: string;
    }) => mockMenuItemWithOptionDropdown(props),
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

jest.mock('@/views/contexts/ViewBarControlIdsContext', () => ({
  useViewBarControlIds: () => ({
    viewPickerDropdownId: 'creator-list-picker',
  }),
}));

jest.mock('@/views/view-picker/hooks/useDestroyViewFromCurrentState', () => ({
  useDestroyViewFromCurrentState: () => ({
    destroyViewFromCurrentState: jest.fn(),
  }),
}));

jest.mock('@lingui/react/macro', () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings[0] }),
}));

jest.mock('@lingui/react', () => ({
  useLingui: () => ({
    i18n: {
      _: (descriptor: { message: string }) => descriptor.message,
    },
  }),
}));

jest.mock('twenty-ui/icon', () => ({
  IconHeart: () => null,
  IconHeartOff: () => null,
  IconLock: () => null,
  IconPencil: () => null,
  IconTrash: () => null,
  useIcons: () => ({ getIcon: () => () => null }),
}));

jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({ onClick, text }: { onClick: () => void; text: string }) => (
    <button onClick={onClick}>{text}</button>
  ),
}));

describe('ViewPickerOptionDropdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses one scoped ID to render and close a view option menu', () => {
    render(
      <ViewPickerOptionDropdown
        handleViewSelect={jest.fn()}
        isCurrentView={false}
        isIndexView={false}
        isLastView={false}
        onEdit={jest.fn()}
        view={{
          createdByUserWorkspaceId: 'user-workspace-id',
          icon: 'IconTable',
          id: 'creator-view-a',
          name: 'Creator view',
          visibility: ViewVisibility.UNLISTED,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to Favorite' }));

    expect(mockMenuItemWithOptionDropdown.mock.calls[0]?.[0]).toMatchObject({
      dropdownId: 'creator-list-picker-options-creator-view-a',
    });
    expect(mockCloseDropdown).toHaveBeenCalledWith(
      'creator-list-picker-options-creator-view-a',
    );
  });
});
