import { type SpreadsheetImportField } from '@/spreadsheet-import/types';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { getMatchedColumnsWithFuse } from '@/spreadsheet-import/utils/getMatchedColumnsWithFuse';

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== null && value !== undefined,
}));

const createInputField = (key: string, label: string): SpreadsheetImportField =>
  ({
    Icon: null,
    key,
    label,
    fieldType: { type: 'input' },
  }) as SpreadsheetImportField;

const createColumns = (...headers: string[]): SpreadsheetColumns =>
  headers.map((header, index) => ({
    index,
    header,
    type: SpreadsheetColumnType.empty,
  }));

describe('getMatchedColumnsWithFuse', () => {
  const fields = [
    createInputField('email', 'Email'),
    createInputField('name', 'Name'),
    createInputField('instagramLink', 'Instagram'),
  ];

  it('assigns exact aliases before Fuse suggestions can claim the destination', () => {
    const result = getMatchedColumnsWithFuse({
      columns: createColumns('Email address', 'Email'),
      fields,
      data: [['creator@example.com', 'duplicate@example.com']],
      headerAliases: {
        email_address: { fieldKey: 'email' },
      },
    });

    expect(result.matchedColumns).toEqual([
      {
        index: 0,
        header: 'Email address',
        type: SpreadsheetColumnType.matched,
        value: 'email',
      },
      {
        index: 1,
        header: 'Email',
        type: SpreadsheetColumnType.empty,
      },
    ]);
  });

  it('normalizes repeated whitespace, hyphens, underscores, and case for alias lookup', () => {
    const result = getMatchedColumnsWithFuse({
      columns: createColumns('  FIRST __--- NAME  '),
      fields,
      data: [['Ada']],
      headerAliases: {
        first_name: { fieldKey: 'name' },
      },
    });

    expect(result.matchedColumns[0]).toMatchObject({
      type: SpreadsheetColumnType.matched,
      value: 'name',
    });
  });

  it('leaves later duplicate aliases unmatched deterministically', () => {
    const result = getMatchedColumnsWithFuse({
      columns: createColumns('First Name', 'first_name'),
      fields,
      data: [['Ada', 'Lovelace']],
      headerAliases: {
        first_name: { fieldKey: 'name' },
      },
    });

    expect(result.matchedColumns.map((column) => column.type)).toEqual([
      SpreadsheetColumnType.matched,
      SpreadsheetColumnType.empty,
    ]);
  });

  it('preserves generic Fuse behavior without aliases', () => {
    const result = getMatchedColumnsWithFuse({
      columns: createColumns('Email'),
      fields,
      data: [['creator@example.com']],
    });

    expect(result.matchedColumns[0]).toMatchObject({
      type: SpreadsheetColumnType.matched,
      value: 'email',
    });
  });

  it('ignores aliases whose destination field is unavailable', () => {
    const columns = createColumns('legacy_identifier');
    const result = getMatchedColumnsWithFuse({
      columns,
      fields,
      data: [['123']],
      headerAliases: {
        legacy_identifier: { fieldKey: 'missing-field' },
      },
    });

    expect(result.matchedColumns).toEqual(columns);
  });
});
