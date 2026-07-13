import { type SanitizedPaging } from 'src/logic-functions/types/composio-tool-result.type';

export const extractNestedDataList = (data: unknown): unknown[] => {
  if (Array.isArray(data)) {
    return data;
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    'data' in data &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return (data as { data: unknown[] }).data;
  }

  return [];
};

export const sanitizePaging = (data: unknown): SanitizedPaging | undefined => {
  if (typeof data !== 'object' || data === null || !('paging' in data)) {
    return undefined;
  }

  const paging = (data as { paging?: { cursors?: SanitizedPaging['cursors'] } })
    .paging;

  const after = paging?.cursors?.after;
  const before = paging?.cursors?.before;

  if (typeof after !== 'string' && typeof before !== 'string') {
    return undefined;
  }

  return {
    cursors: {
      ...(typeof after === 'string' ? { after } : {}),
      ...(typeof before === 'string' ? { before } : {}),
    },
  };
};
