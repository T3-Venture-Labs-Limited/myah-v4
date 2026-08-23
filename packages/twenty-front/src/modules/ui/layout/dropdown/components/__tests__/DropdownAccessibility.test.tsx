import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';

const mockToggleDropdown = jest.fn();

jest.mock('@floating-ui/react', () => ({
  FloatingPortal: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  autoUpdate: jest.fn(),
  flip: jest.fn(),
  offset: jest.fn(),
  size: jest.fn(),
  useFloating: () => ({
    floatingStyles: {},
    placement: 'bottom-end',
    refs: {
      domReference: { current: null },
      floating: { current: null },
      setFloating: jest.fn(),
      setReference: jest.fn(),
    },
  }),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownOnToggleEffect', () => ({
  DropdownOnToggleEffect: () => null,
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));

jest.mock('@/ui/layout/dropdown/hooks/useToggleDropdown', () => ({
  useToggleDropdown: () => ({ toggleDropdown: mockToggleDropdown }),
}));

jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: jest.fn(),
}));

jest.mock('@/ui/utilities/pointer-event/hooks/useListenClickOutside', () => ({
  useListenClickOutside: jest.fn(),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({ useAtomComponentStateValue: () => true }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => undefined,
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => jest.fn(),
}));

jest.mock('twenty-ui/utilities', () => ({
  useIsMobile: () => false,
}));

describe('Dropdown accessibility semantics', () => {
  it('renders an opt-in dialog role', () => {
    render(
      <Dropdown
        dropdownComponents={<div>Dialog contents</div>}
        dropdownId="dialog-dropdown"
        dropdownRole="dialog"
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('names a dialog and exposes dialog semantics on a keyboard-operable trigger', async () => {
    const user = userEvent.setup();

    render(
      <Dropdown
        clickableComponent={<span>Creator</span>}
        clickableComponentAriaLabel="Creator selector"
        dropdownAriaLabel="Creator selector"
        dropdownComponents={<div>Dialog contents</div>}
        dropdownId="named-dialog-dropdown"
        dropdownRole="dialog"
        isClickableComponentKeyboardAccessible
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Creator selector',
    });

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Creator selector');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('tabindex', '0');

    trigger.focus();
    await user.keyboard('{Enter}');

    expect(mockToggleDropdown).toHaveBeenCalledWith({
      dropdownComponentInstanceIdFromProps: 'named-dialog-dropdown',
      globalHotkeysConfig: undefined,
    });
  });

  it('does not take keyboard activation from nested interactive content', async () => {
    mockToggleDropdown.mockClear();
    const user = userEvent.setup();

    render(
      <Dropdown
        clickableComponent={<a href="/creator">Ada Creator</a>}
        clickableComponentAriaLabel="Creator selector"
        dropdownComponents={<div>Dropdown contents</div>}
        dropdownId="nested-link-dropdown"
        isClickableComponentKeyboardAccessible
      />,
    );

    const recordLink = screen.getByRole('link', { name: 'Ada Creator' });
    recordLink.focus();
    await user.keyboard('{Enter}');

    expect(mockToggleDropdown).not.toHaveBeenCalled();
  });

  it('focuses an opted-in keyboard trigger on mount', () => {
    render(
      <Dropdown
        autoFocusClickableComponent
        clickableComponent={<span>Creator</span>}
        clickableComponentAriaLabel="Creator selector"
        dropdownComponents={<div>Dialog contents</div>}
        dropdownId="auto-focus-dialog-dropdown"
        isClickableComponentKeyboardAccessible
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Creator selector' }),
    ).toHaveFocus();
  });

  it('keeps the default dropdown role as listbox', () => {
    render(
      <Dropdown
        dropdownComponents={<div>Listbox contents</div>}
        dropdownId="listbox-dropdown"
      />,
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
  it('keeps neutral as-child actions free of listbox semantics', () => {
    render(
      <Dropdown
        clickableComponent={<button type="button">Actions</button>}
        containerType="neutral"
        dropdownComponents={<button type="button">Archive</button>}
        dropdownId="neutral-actions-dropdown"
        renderClickableComponentAsChild
      />,
    );

    expect(screen.getByRole('button', { name: 'Actions' })).not.toHaveAttribute(
      'aria-haspopup',
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('lets a neutral shell expose one controlled results listbox', () => {
    render(
      <Dropdown
        clickableComponent={<button type="button">Choose record</button>}
        containerType="neutral"
        dropdownComponents={
          <DropdownMenuItemsContainer
            ariaLabel="Record results"
            id="record-results"
            role="listbox"
          >
            <div role="option">Ada Lovelace</div>
          </DropdownMenuItemsContainer>
        }
        dropdownId="neutral-record-picker"
        renderClickableComponentAsChild
      />,
    );

    const listboxes = screen.getAllByRole('listbox', {
      name: 'Record results',
    });

    expect(listboxes).toHaveLength(1);
    expect(listboxes[0]).toHaveAttribute('id', 'record-results');
  });
  it('forwards ARIA attributes to the search input', () => {
    render(
      <I18nProvider i18n={i18n}>
        <DropdownMenuSearchInput
          aria-activedescendant="creator-option-1"
          aria-controls="creator-results"
          aria-expanded={true}
          aria-label="Search creators"
          role="combobox"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-controls',
      'creator-results',
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-activedescendant',
      'creator-option-1',
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('combobox')).toHaveAccessibleName(
      'Search creators',
    );
  });

  it('names and identifies the listbox', () => {
    render(
      <DropdownMenuItemsContainer
        ariaLabel="Creator results"
        id="creator-results"
        role="listbox"
      >
        <div>Creator result</div>
      </DropdownMenuItemsContainer>,
    );

    const listboxes = screen.getAllByRole('listbox', {
      name: 'Creator results',
    });

    expect(listboxes).toHaveLength(1);
    expect(listboxes[0]).toHaveAttribute('id', 'creator-results');
  });
});
