export const normalizeCreatorImportHeader = (header: string): string =>
  header
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/gu, '_');
