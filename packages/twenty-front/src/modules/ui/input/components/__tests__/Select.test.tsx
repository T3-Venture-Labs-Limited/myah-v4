import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

import { Select } from '@/ui/input/components/Select';

jest.mock('@/ui/input/components/SelectControl', () => ({
  SelectControl: ({
    selectedOption,
  }: {
    selectedOption: { label: string };
  }) => <button>{selectedOption.label}</button>,
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    dropdownComponents,
    onOpen,
  }: {
    clickableComponent: ReactNode;
    dropdownComponents: ReactNode;
    onOpen?: () => void;
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div>
        <div
          onClick={() => {
            if (!isOpen) {
              onOpen?.();
            }

            setIsOpen(!isOpen);
          }}
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
});
