import { type SpreadsheetImportDialogOptions } from '@/spreadsheet-import/types/SpreadsheetImportDialogOptions';
import { type SpreadsheetImportFields } from '@/spreadsheet-import/types/SpreadsheetImportFields';
import { type SpreadsheetImportHeaderAlias } from '@/spreadsheet-import/types/SpreadsheetImportHeaderProfile';
import { type ImportedStructuredRow } from '@/spreadsheet-import/types/SpreadsheetImportImportedStructuredRow';
import { type SpreadsheetImportTableHook } from '@/spreadsheet-import/types/SpreadsheetImportTableHook';

export type CreatorImportClassification =
  | { kind: 'create' }
  | { kind: 'existing'; creatorId: string; matchedFieldKeys: string[] }
  | { kind: 'conflict'; matchedFieldKeys: string[] };

export type ExistingCreatorSocialProfile = {
  id: string;
  instagramLink?: { primaryLinkUrl?: string | null } | null;
  tiktokLink?: { primaryLinkUrl?: string | null } | null;
  youtubeLink?: { primaryLinkUrl?: string | null } | null;
  twitterLink?: { primaryLinkUrl?: string | null } | null;
};

export type CreatorSpreadsheetImportSession = {
  spreadsheetImportFields: SpreadsheetImportFields;
  headerAliases: Readonly<Record<string, SpreadsheetImportHeaderAlias>>;
  headerProfile: NonNullable<SpreadsheetImportDialogOptions['headerProfile']>;
  matchColumnsStepHook: NonNullable<
    SpreadsheetImportDialogOptions['matchColumnsStepHook']
  >;
  tableHook: SpreadsheetImportTableHook;
  beforeSubmitHook: NonNullable<
    SpreadsheetImportDialogOptions['beforeSubmitHook']
  >;
  getSubmissionBlockReason: NonNullable<
    SpreadsheetImportDialogOptions['getSubmissionBlockReason']
  >;
  getSummary: (rows: readonly ImportedStructuredRow[]) => {
    existing: number;
    conflicts: number;
  };
};
