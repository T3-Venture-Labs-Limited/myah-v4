import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { isValidUuid } from 'twenty-shared/utils';

export type MyahInboxEmailCursorScope = {
  workspaceId: string;
  userWorkspaceId: string;
  contactId: string;
};
export type MyahInboxEmailCardCursor = MyahInboxEmailCursorScope & {
  version: 1;
  kind: 'snapshot' | 'cards' | 'older' | 'newer';
  snapshotAt: string;
  fingerprint: string;
  timestamp?: string;
  id?: string;
  threadId?: string;
  anchorKey?: string;
};

export const isMyahInboxEmailAnchorKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const [prefix, id, extra] = value.split(':');
  return (
    !extra &&
    ['attempt', 'thread', 'legacy'].includes(prefix) &&
    isValidUuid(id)
  );
};

export const isMyahInboxEmailTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) &&
  isISO8601(value, { strict: true, strictSeparator: true });

export const decodeMyahInboxEmailCardCursor = (
  token: string,
  scope: MyahInboxEmailCursorScope,
  kind?: MyahInboxEmailCardCursor['kind'],
): MyahInboxEmailCardCursor => {
  const invalid = () => new BadRequestException('Invalid Inbox history cursor');
  if (!token || token.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(token))
    throw invalid();
  let row: MyahInboxEmailCardCursor;
  try {
    row = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid();
  const keys = [
    'version',
    'kind',
    'workspaceId',
    'userWorkspaceId',
    'contactId',
    'snapshotAt',
    'fingerprint',
  ];
  if (row.kind !== 'snapshot') keys.push('timestamp', 'id');
  if (row.kind === 'cards' && row.threadId !== undefined) keys.push('threadId');
  if (row.kind === 'older' || row.kind === 'newer') {
    keys.push('threadId');
    if (row.anchorKey !== undefined) keys.push('anchorKey');
  }
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key)) ||
    row.version !== 1 ||
    !['snapshot', 'cards', 'older', 'newer'].includes(row.kind) ||
    (kind && row.kind !== kind) ||
    row.workspaceId !== scope.workspaceId ||
    row.userWorkspaceId !== scope.userWorkspaceId ||
    row.contactId !== scope.contactId ||
    !isValidUuid(row.workspaceId) ||
    !isValidUuid(row.userWorkspaceId) ||
    !isMyahInboxEmailTimestamp(row.snapshotAt) ||
    typeof row.fingerprint !== 'string' ||
    !/^[a-f0-9]{32}$/.test(row.fingerprint) ||
    (row.kind !== 'snapshot' &&
      (!isMyahInboxEmailTimestamp(row.timestamp) ||
        typeof row.id !== 'string' ||
        (row.kind === 'cards'
          ? !isMyahInboxEmailAnchorKey(row.id) && !isValidUuid(row.id)
          : !isValidUuid(row.id)))) ||
    (row.kind === 'cards' &&
      (isMyahInboxEmailAnchorKey(row.id)
        ? typeof row.threadId !== 'string' || !isValidUuid(row.threadId)
        : row.threadId !== undefined)) ||
    (['older', 'newer'].includes(row.kind) &&
      (typeof row.threadId !== 'string' ||
        !isValidUuid(row.threadId) ||
        (row.anchorKey !== undefined &&
          !isMyahInboxEmailAnchorKey(row.anchorKey)))) ||
    Buffer.from(JSON.stringify(row)).toString('base64url') !== token
  )
    throw invalid();
  return row;
};

export const encodeMyahInboxEmailCardCursor = (
  value: MyahInboxEmailCardCursor,
): string => {
  const token = Buffer.from(JSON.stringify(value)).toString('base64url');
  decodeMyahInboxEmailCardCursor(token, value, value.kind);
  return token;
};
