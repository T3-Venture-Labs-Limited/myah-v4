import { BadRequestException } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

export type MyahInboxCursor = {
  receivedAt: string;
  threadId: string;
};

export const encodeMyahInboxCursor = (cursor: MyahInboxCursor): string =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

export const decodeMyahInboxCursor = (cursor: string): MyahInboxCursor => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<MyahInboxCursor>;
    const receivedAt = new Date(decoded.receivedAt ?? '');

    if (
      Number.isNaN(receivedAt.getTime()) ||
      typeof decoded.threadId !== 'string' ||
      !isValidUuid(decoded.threadId)
    ) {
      throw new Error('cursor fields are invalid');
    }

    return {
      receivedAt: receivedAt.toISOString(),
      threadId: decoded.threadId,
    };
  } catch {
    throw new BadRequestException('Invalid Myah inbox cursor');
  }
};
