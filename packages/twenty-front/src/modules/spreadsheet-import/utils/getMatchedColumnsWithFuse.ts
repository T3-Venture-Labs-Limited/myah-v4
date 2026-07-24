import { type MatchColumnsStepProps } from '@/spreadsheet-import/steps/components/MatchColumnsStep/MatchColumnsStep';

import {
  type SpreadsheetImportField,
  type SpreadsheetImportFields,
  type SpreadsheetImportHeaderAlias,
} from '@/spreadsheet-import/types';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { setColumn } from '@/spreadsheet-import/utils/setColumn';
import Fuse from 'fuse.js';
import { isDefined } from 'twenty-shared/utils';

const normalizeSpreadsheetImportHeader = (header: string) =>
  header
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/gu, '_');

export const getMatchedColumnsWithFuse = ({
  columns,
  fields,
  data,
  headerAliases,
}: {
  columns: SpreadsheetColumns;
  fields: SpreadsheetImportFields;
  data: MatchColumnsStepProps['data'];
  headerAliases?: Readonly<Record<string, SpreadsheetImportHeaderAlias>>;
}) => {
  const matchedColumns: SpreadsheetColumn[] = [...columns];
  const claimedFieldKeys = new Set<SpreadsheetImportField['key']>();
  const exactAliasSourceColumnIndexes = new Set<number>();

  for (const [columnIndex, column] of columns.entries()) {
    const exactAlias =
      headerAliases?.[normalizeSpreadsheetImportHeader(column.header)];
    const exactField = fields.find(
      (field) => field.key === exactAlias?.fieldKey,
    );

    if (!isDefined(exactAlias) || !isDefined(exactField)) {
      continue;
    }

    exactAliasSourceColumnIndexes.add(columnIndex);

    if (claimedFieldKeys.has(exactField.key)) {
      continue;
    }

    matchedColumns[columnIndex] = setColumn(
      column,
      exactField,
      data,
      exactAlias.selectOptionAliases,
    );
    claimedFieldKeys.add(exactField.key);
  }

  const fieldsToSearch = new Fuse(fields, {
    keys: ['label'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.3,
  });

  const suggestedFieldsByColumnHeader: Record<
    SpreadsheetColumn['header'],
    SpreadsheetImportField[]
  > = {};

  for (const [columnIndex, column] of columns.entries()) {
    const fieldsThatMatch = fieldsToSearch.search(column.header);
    const firstMatch = fieldsThatMatch[0] ?? null;
    const secondMatch = fieldsThatMatch[1] ?? null;

    suggestedFieldsByColumnHeader[column.header] = fieldsThatMatch.map(
      (match) => match.item as SpreadsheetImportField,
    );

    if (exactAliasSourceColumnIndexes.has(columnIndex)) {
      continue;
    }

    const isFirstMatchValid =
      isDefined(firstMatch?.item) &&
      isDefined(firstMatch?.score) &&
      firstMatch.score < 0.4 &&
      ((isDefined(secondMatch?.score) &&
        secondMatch.score !== firstMatch.score) ||
        !isDefined(secondMatch));

    if (isFirstMatchValid && !claimedFieldKeys.has(firstMatch.item.key)) {
      matchedColumns[columnIndex] = setColumn(column, firstMatch.item, data);
      claimedFieldKeys.add(firstMatch.item.key);
    }
  }

  return { matchedColumns, suggestedFieldsByColumnHeader };
};
