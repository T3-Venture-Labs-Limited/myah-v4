import { BadRequestException } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

export type MyahInboxContactCursor = {
  activityAt: string;
  orderingKey: string;
};

type MyahInboxContactCursorPayload = {
  v: 1;
  w: string;
  a: string;
  o: string;
};

export type MyahInboxContactEmailCursor = {
  receivedAt: string;
  messageId: string;
};

type MyahInboxContactEmailCursorPayload = {
  v: 1;
  w: string;
  a: string;
  m: string;
};

const ORDERING_KEY_PATTERN =
  /^(creator|email-thread|instagram-conversation):([0-9a-f-]+)$/;

const invalidCursor = (): never => {
  throw new BadRequestException('Invalid Myah inbox contact cursor');
};

const parseActivityAt = (value: string): string => {
  const activityAt = new Date(value);

  if (Number.isNaN(activityAt.getTime())) return invalidCursor();

  return activityAt.toISOString();
};

const assertOrderingKey = (value: string): void => {
  const match = ORDERING_KEY_PATTERN.exec(value);

  if (!match || !isValidUuid(match[2])) invalidCursor();
};

export const encodeMyahInboxContactCursor = (input: {
  workspaceId: string;
  activityAt: string;
  orderingKey: string;
}): string => {
  if (!isValidUuid(input.workspaceId)) return invalidCursor();
  assertOrderingKey(input.orderingKey);
  const payload: MyahInboxContactCursorPayload = {
    v: 1,
    w: input.workspaceId,
    a: parseActivityAt(input.activityAt),
    o: input.orderingKey,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

export const decodeMyahInboxContactCursor = (
  value: string,
  expectedWorkspaceId: string,
): MyahInboxContactCursor => {
  try {
    if (!value || !isValidUuid(expectedWorkspaceId)) return invalidCursor();
    const payload = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<MyahInboxContactCursorPayload>;

    if (
      payload.v !== 1 ||
      payload.w !== expectedWorkspaceId ||
      typeof payload.a !== 'string' ||
      typeof payload.o !== 'string' ||
      Object.keys(payload).length !== 4
    ) {
      return invalidCursor();
    }
    assertOrderingKey(payload.o);

    return {
      activityAt: parseActivityAt(payload.a),
      orderingKey: payload.o,
    };
  } catch {
    return invalidCursor();
  }
};

const invalidEmailCursor = (): never => {
  throw new BadRequestException('Invalid Myah inbox contact email cursor');
};

const parseEmailReceivedAt = (value: string): string => {
  const receivedAt = new Date(value);

  if (Number.isNaN(receivedAt.getTime())) return invalidEmailCursor();

  return receivedAt.toISOString();
};

export const encodeMyahInboxContactEmailCursor = (input: {
  workspaceId: string;
  receivedAt: string;
  messageId: string;
}): string => {
  if (!isValidUuid(input.workspaceId) || !isValidUuid(input.messageId)) {
    return invalidEmailCursor();
  }
  const payload: MyahInboxContactEmailCursorPayload = {
    v: 1,
    w: input.workspaceId,
    a: parseEmailReceivedAt(input.receivedAt),
    m: input.messageId,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

export const decodeMyahInboxContactEmailCursor = (
  value: string,
  expectedWorkspaceId: string,
): MyahInboxContactEmailCursor => {
  try {
    if (!value || !isValidUuid(expectedWorkspaceId)) {
      return invalidEmailCursor();
    }
    const payload = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<MyahInboxContactEmailCursorPayload>;

    if (
      payload.v !== 1 ||
      payload.w !== expectedWorkspaceId ||
      typeof payload.a !== 'string' ||
      typeof payload.m !== 'string' ||
      !isValidUuid(payload.m) ||
      Object.keys(payload).length !== 4
    ) {
      return invalidEmailCursor();
    }

    return {
      receivedAt: parseEmailReceivedAt(payload.a),
      messageId: payload.m,
    };
  } catch {
    return invalidEmailCursor();
  }
};
