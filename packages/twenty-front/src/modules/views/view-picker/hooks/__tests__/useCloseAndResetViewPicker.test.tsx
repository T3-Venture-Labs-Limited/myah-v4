import { fireEvent, render, screen } from '@testing-library/react';

import { useCloseAndResetViewPicker } from '@/views/view-picker/hooks/useCloseAndResetViewPicker';

const mockCloseDropdown = jest.fn();
const mockSetViewPickerMode = jest.fn();
const mockSetViewPickerIsPersisting = jest.fn();

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: mockCloseDropdown }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: (componentState: { key: string }) =>
    componentState.key === 'viewPickerModeComponentState'
      ? mockSetViewPickerMode
      : mockSetViewPickerIsPersisting,
}));

jest.mock('@/views/contexts/ViewBarControlIdsContext', () => ({
  useViewBarControlIds: () => ({
    viewPickerCalendarFieldDropdownId:
      'view-picker-calendar-field-creator-list-pane-list-a',
    viewPickerDropdownId: 'view-picker-creator-list-pane-list-a',
    viewPickerKanbanFieldDropdownId:
      'view-picker-kanban-field-creator-list-pane-list-a',
    viewPickerViewTypeDropdownId:
      'view-picker-view-type-creator-list-pane-list-a',
  }),
}));

const CloseViewPickerButton = () => {
  const { closeAndResetViewPicker } = useCloseAndResetViewPicker();

  return <button onClick={closeAndResetViewPicker}>Close view picker</button>;
};

describe('useCloseAndResetViewPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('closes every scoped nested picker dropdown before closing the scoped picker', () => {
    render(<CloseViewPickerButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Close view picker' }));

    expect(mockCloseDropdown).toHaveBeenCalledWith(
      'view-picker-kanban-field-creator-list-pane-list-a',
    );
    expect(mockCloseDropdown).toHaveBeenCalledWith(
      'view-picker-view-type-creator-list-pane-list-a',
    );
    expect(mockCloseDropdown).toHaveBeenCalledWith(
      'view-picker-calendar-field-creator-list-pane-list-a',
    );
    expect(mockCloseDropdown).toHaveBeenCalledWith(
      'view-picker-creator-list-pane-list-a',
    );
  });
});
