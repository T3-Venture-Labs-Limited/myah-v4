import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';

import { MatchColumnSelectFieldSelectDropdownContent } from '@/spreadsheet-import/components/MatchColumnSelectFieldSelectDropdownContent';
import { FieldMetadataType } from 'twenty-shared/types';
import { spreadsheetImportBuildFieldOptions } from '@/spreadsheet-import/utils/spreadsheetImportBuildFieldOptions';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';

jest.mock('@/spreadsheet-import/hooks/useSpreadsheetImportInternal', () => ({
  useSpreadsheetImportInternal: () => ({
    availableFieldMetadataItems: [
      {
        id: 'name-id',
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      },
    ],
  }),
}));

jest.mock('@/ui/utilities/scroll/components/ScrollWrapper', () => ({
  ScrollWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

it('does not displace a mapped note when a second supplementary column selects it', () => {
  const options = spreadsheetImportBuildFieldOptions(
    [
      {
        key: 'notes',
        label: 'Supplementary note',
        Icon: undefined,
        fieldMetadataItemId: 'virtual:creator-note',
        fieldMetadataType: FieldMetadataType.TEXT,
        fieldType: { type: 'input' },
        isNestedField: false,
      },
    ],
    [
      {
        index: 0,
        header: 'notes',
        type: SpreadsheetColumnType.matched,
        value: 'notes',
      },
    ],
  );
  const select = jest.fn();
  i18n.load('en', {});
  i18n.activate('en');
  const { rerender } = render(
    <MatchColumnSelectFieldSelectDropdownContent
      selectedValue={undefined}
      options={options}
      suggestedOptions={options}
      onSelectFieldMetadataItem={jest.fn()}
      onSelectSuggestedOption={select}
      onCancelSelect={jest.fn()}
      onDoNotImportSelect={jest.fn()}
    />,
    {
      wrapper: ({ children }) => (
        <I18nProvider i18n={i18n}>{children}</I18nProvider>
      ),
    },
  );
  for (const option of screen.getAllByText('Supplementary note'))
    fireEvent.click(option);
  expect(select).not.toHaveBeenCalled();
  expect(
    screen
      .getAllByRole('option', { name: /Supplementary note/ })
      .every((option) => option.getAttribute('aria-disabled') === 'true'),
  ).toBe(true);

  // The operator must explicitly unmap/exclude the first column before reassignment.
  rerender(
    <MatchColumnSelectFieldSelectDropdownContent
      selectedValue={undefined}
      options={options.map((option) => ({ ...option, disabled: false }))}
      suggestedOptions={[]}
      onSelectFieldMetadataItem={jest.fn()}
      onSelectSuggestedOption={select}
      onCancelSelect={jest.fn()}
      onDoNotImportSelect={jest.fn()}
    />,
  );
  fireEvent.click(screen.getByText('Supplementary note'));
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({ value: 'notes' }),
  );
});

it('lets an operator search and select non-schema import destinations without duplicating native fields', () => {
  i18n.load('en', {});
  i18n.activate('en');
  const select = jest.fn();
  const profileOption = {
    value: 'instagram',
    label: 'Instagram profile URL',
    fieldMetadataItemId: 'virtual:social-profile:instagram',
    Icon: undefined,
  };
  const noteOption = {
    value: 'notes',
    label: 'Supplementary note',
    fieldMetadataItemId: 'virtual:creator-note',
    Icon: undefined,
  };
  render(
    <I18nProvider i18n={i18n}>
      <MatchColumnSelectFieldSelectDropdownContent
        selectedValue={undefined}
        options={[
          {
            value: 'name',
            label: 'Name',
            fieldMetadataItemId: 'name-id',
            Icon: undefined,
          },
          profileOption,
          noteOption,
        ]}
        suggestedOptions={[]}
        onSelectFieldMetadataItem={jest.fn()}
        onSelectSuggestedOption={select}
        onCancelSelect={jest.fn()}
        onDoNotImportSelect={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.getAllByText('Name')).toHaveLength(1);
  fireEvent.change(screen.getByPlaceholderText('Search fields'), {
    target: { value: 'instagram' },
  });
  fireEvent.click(screen.getByText('Instagram profile URL'));
  expect(select).toHaveBeenLastCalledWith(profileOption);
  expect(screen.queryByText('Name')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Search fields'), {
    target: { value: 'note' },
  });
  fireEvent.click(screen.getByText('Supplementary note'));
  expect(select).toHaveBeenLastCalledWith(noteOption);
});
