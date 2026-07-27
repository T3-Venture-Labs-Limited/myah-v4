import { type ImportedRow } from '@/spreadsheet-import/types/SpreadsheetImportImportedRow';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';

export type SpreadsheetImportHeaderAlias = {
  fieldKey: SpreadsheetImportField['key'];
  selectOptionAliases?: Readonly<Record<string, string>>;
};

export type SpreadsheetImportHeaderProfile = {
  key: string;
  label: string;
  isDetected: (headerValues: ImportedRow) => boolean;
};
