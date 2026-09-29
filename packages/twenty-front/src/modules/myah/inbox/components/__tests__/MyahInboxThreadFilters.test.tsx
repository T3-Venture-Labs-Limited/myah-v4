/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse a typed baseline prop fixture. */
import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxThreadFilters } from '@/myah/inbox/components/MyahInboxThreadFilters';
import { DEFAULT_MYAH_INBOX_FILTERS } from '@/myah/inbox/states/myahInboxSelectionState';

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    border: { color: { light: 'lightgray' } },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

jest.mock('twenty-ui/input', () => ({
  IconButton: ({
    ariaLabel,
    disabled,
    onClick,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => <button aria-label={ariaLabel} disabled={disabled} onClick={onClick} />,
}));

jest.mock('@/ui/input/components/Select', () => ({
  Select: () => null,
}));

jest.mock('@/ui/input/components/TextInput', () => ({
  TextInput: ({ label }: { label: string }) => <label>{label}</label>,
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: () => null,
}));

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: () => null,
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({ FormSingleRecordPicker: () => null }),
);

const defaultProps = {
  filters: DEFAULT_MYAH_INBOX_FILTERS,
  isRefreshing: false,
  loading: false,
  loadingMore: false,
  onFiltersChange: jest.fn(),
  onRefresh: jest.fn(),
  refreshError: null,
  refreshStatus: 'idle' as const,
};

describe('MyahInboxThreadFilters', () => {
  it('keeps the contact-list Refresh control enabled while a next batch loads, so a refresh can supersede it', () => {
    const onRefresh = jest.fn();
    const { rerender } = render(
      <MyahInboxThreadFilters
        {...defaultProps}
        contentType="contacts"
        loadingMore
        onRefresh={onRefresh}
      />,
    );

    const refreshButton = screen.getByRole('button', {
      name: 'Refresh Inbox',
    });

    expect(refreshButton).toBeEnabled();
    fireEvent.click(refreshButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <MyahInboxThreadFilters
        {...defaultProps}
        contentType="contacts"
        loading
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Refresh Inbox' }),
    ).toBeDisabled();

    rerender(
      <MyahInboxThreadFilters
        {...defaultProps}
        contentType="contacts"
        isRefreshing
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Refresh Inbox' }),
    ).toBeDisabled();
  });

  it('still disables the conversations Refresh control while a next page loads', () => {
    render(
      <MyahInboxThreadFilters
        {...defaultProps}
        contentType="conversations"
        loadingMore
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Refresh Inbox' }),
    ).toBeDisabled();
  });
});
