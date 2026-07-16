import { type SanitizedPaging } from 'src/logic-functions/types/composio-tool-result.type';

export const extractNestedDataList = (data: unknown): unknown[] | undefined => {
  if (Array.isArray(data)) {
    return data;
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    'data' in data &&
    Array.isArray(data.data)
  ) {
    return data.data;
  }

  return undefined;
};

export const hasValidInstagramPaging = (data: unknown): boolean => {
  if (typeof data !== 'object' || data === null || !('paging' in data)) {
    return true;
  }

  const paging = data.paging;

  if (typeof paging !== 'object' || paging === null || Array.isArray(paging)) {
    return false;
  }

  if (!('next' in paging)) {
    return true;
  }

  if (
    typeof paging.next !== 'string' ||
    paging.next.trim().length === 0 ||
    !('cursors' in paging)
  ) {
    return false;
  }

  const cursors = paging.cursors;

  return (
    typeof cursors === 'object' &&
    cursors !== null &&
    !Array.isArray(cursors) &&
    'after' in cursors &&
    typeof cursors.after === 'string' &&
    cursors.after.trim().length > 0
  );
};

export const sanitizePaging = (data: unknown): SanitizedPaging | undefined => {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('paging' in data) ||
    !hasValidInstagramPaging(data)
  ) {
    return undefined;
  }

  const paging = data.paging;

  if (
    typeof paging !== 'object' ||
    paging === null ||
    !('next' in paging) ||
    typeof paging.next !== 'string' ||
    !('cursors' in paging)
  ) {
    return undefined;
  }

  const cursors = paging.cursors;

  if (
    typeof cursors !== 'object' ||
    cursors === null ||
    !('after' in cursors)
  ) {
    return undefined;
  }

  const after = cursors.after;

  return typeof after === 'string' ? { cursors: { after } } : undefined;
};
