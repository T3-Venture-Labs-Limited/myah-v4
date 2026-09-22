import { type ImportedStructuredRowMetadata } from '@/spreadsheet-import/steps/components/ValidationStep/types';
import { type ImportedStructuredRow } from './SpreadsheetImportImportedStructuredRow';

export type SpreadsheetImportImportValidationResult = {
  validStructuredRows: ImportedStructuredRow[];
  validStructuredRowIndexes: string[];
  invalidStructuredRows: ImportedStructuredRow[];
  allStructuredRows: (ImportedStructuredRow & ImportedStructuredRowMetadata)[];
};
