import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

import { Select } from '@/ui/input/components/Select';

jest.mock('@/ui/input/components/SelectControl', () => ({
  SelectControl: ({
    selectedOption,
  }: {
    selectedOption: { label: string };
  }) => <span>{selectedOption.label}</span>,
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    clickableComponentAriaLabel,
    dropdownComponents,
    isClickableComponentKeyboardAccessible,
    onOpen,
  }: {
    clickableComponent: ReactNode;
    clickableComponentAriaLabel?: string;
    dropdownComponents: ReactNode;
    isClickableComponentKeyboardAccessible?: boolean;
    onOpen?: () => void;
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleDropdown = () => {
      if (!isOpen) {
        onOpen?.();
      }

      setIsOpen(!isOpen);
    };

    return (
      <div>
        <div
          aria-label={clickableComponentAriaLabel}
          onClick={toggleDropdown}
          onKeyDown={(event) => {
            if (
              isClickableComponentKeyboardAccessible === true &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              toggleDropdown();
            }
          }}
          role="button"
          tabIndex={isClickableComponentKeyboardAccessible === true ? 0 : -1}
        >
          {clickableComponent}
        </div>
        {isOpen ? dropdownComponents : null}
      </div>
    );
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

jest.mock('@/ui/layout/dropdown/components/DropdownMenuSearchInput', () => ({
  DropdownMenuSearchInput: () => null,
}));

jest.mock('@/ui/layout/dropdown/components/DropdownMenuSeparator', () => ({
  DropdownMenuSeparator: () => null,
}));

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: jest.fn() }),
}));

jest.mock('@/ui/layout/selectable-list/components/SelectableList', () => ({
  SelectableList: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('@/ui/layout/selectable-list/components/SelectableListItem', () => ({
  SelectableListItem: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/selectable-list/hooks/useSelectableList', () => ({
  useSelectableList: () => ({ setSelectedItemId: jest.fn() }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => undefined,
  }),
);

jest.mock('twenty-ui/navigation', () => ({
  MenuItem: ({ text }: { text: string }) => <button>{text}</button>,
  MenuItemSelect: ({
    text,
    onClick,
  }: {
    text: string;
    onClick: () => void;
  }) => <button onClick={onClick}>{text}</button>,
}));

describe('Select', () => {
  it('offers the empty option so a selected value can be cleared', () => {
    const onChange = jest.fn();

    render(
      <Select
        dropdownId="test-select"
        value="closed"
        emptyOption={{ label: 'All states', value: '' }}
        options={[{ label: 'Closed', value: 'closed' }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Closed' }));

    fireEvent.click(screen.getByRole('button', { name: 'All states' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('labels the control and opens it from the keyboard', () => {
    render(
      <Select
        dropdownId="country-select"
        ariaLabel="Country"
        label="Country"
        value=""
        emptyOption={{ label: 'Select a country', value: '' }}
        options={[{ label: 'Netherlands', value: 'NL' }]}
      />,
    );

    const select = screen.getByRole('button', {
      name: 'Country: Select a country',
    });

    expect(select).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(select, { key: 'Enter' });

    expect(
      screen.getByRole('button', { name: 'Netherlands' }),
    ).toBeInTheDocument();
  });

  it('keeps the selected value as the accessible name by default', () => {
    render(
      <Select
        dropdownId="view-type-select"
        label="View type"
        value="table"
        options={[
          { label: 'Table', value: 'table' },
          { label: 'Kanban', value: 'kanban' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
  });
});
