import { fireEvent, render, screen } from '@testing-library/react';

import { generateColumns } from '@/spreadsheet-import/steps/components/ValidationStep/components/columns';

const mockOnRowSelectionChange = jest.fn();

jest.mock('react-data-grid', () => ({
  useRowSelection: () => ({
    isRowSelected: false,
    onRowSelectionChange: mockOnRowSelectionChange,
  }),
}));
Object.defineProperty(window, 'PointerEvent', {
  configurable: true,
  value: MouseEvent,
});

describe('validation select column', () => {
  it('passes the next checked value to row selection', () => {
    const selectColumn = generateColumns([])[0];
    const SelectCell = () =>
      selectColumn.renderCell?.({ row: { __index: 7 } } as never);

    render(<SelectCell />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select' }));

    expect(mockOnRowSelectionChange).toHaveBeenCalledWith({
      row: { __index: 7 },
      checked: true,
      isShiftClick: false,
    });
  });
});
