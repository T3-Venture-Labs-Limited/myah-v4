import { BadRequestException } from '@nestjs/common';

import { isISO8601 } from 'class-validator';
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

export type MyahInboxInstagramMessageCursor = {
  effectiveTimestamp: string;
  messageId: string;
};

type MyahInboxInstagramMessageCursorPayload = {
  v: 1;
  w: string;
  c: string;
  t: string;
  m: string;
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

// Keep PostgreSQL microseconds separate from Date-based display values. Legacy
// v1 millisecond tokens remain readable, but their lost precision is unrecoverable.
const parseContactTimestamp = (value: string, invalid: () => never): string => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(
      value,
    ) ||
    !isISO8601(value, { strict: true, strictSeparator: true })
  ) {
    return invalid();
  }

  return value.includes('.') ? value : value.replace('Z', '.000Z');
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
    a: parseContactTimestamp(input.activityAt, invalidCursor),
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
      activityAt: parseContactTimestamp(payload.a, invalidCursor),
      orderingKey: payload.o,
    };
  } catch {
    return invalidCursor();
  }
};

const invalidInstagramMessageCursor = (): never => {
  throw new BadRequestException('Invalid Myah inbox Instagram message cursor');
};

// Instagram cursors carry PostgreSQL's exact ordering timestamp. Do not
// canonicalize through Date: JavaScript Date drops microseconds.
const parseInstagramEffectiveTimestamp = (value: string): string => {
  const timestamp = new Date(value);

  if (
    Number.isNaN(timestamp.getTime()) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  ) {
    return invalidInstagramMessageCursor();
  }

  return value;
};

export const encodeMyahInboxInstagramMessageCursor = (input: {
  workspaceId: string;
  conversationId: string;
  effectiveTimestamp: string;
  messageId: string;
}): string => {
  if (
    !isValidUuid(input.workspaceId) ||
    !isValidUuid(input.conversationId) ||
    !isValidUuid(input.messageId)
  ) {
    return invalidInstagramMessageCursor();
  }
  const payload: MyahInboxInstagramMessageCursorPayload = {
    v: 1,
    w: input.workspaceId,
    c: input.conversationId,
    t: parseInstagramEffectiveTimestamp(input.effectiveTimestamp),
    m: input.messageId,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

export const decodeMyahInboxInstagramMessageCursor = (
  value: string,
  expected: { workspaceId: string; conversationId: string },
): MyahInboxInstagramMessageCursor => {
  try {
    if (
      !value ||
      !isValidUuid(expected.workspaceId) ||
      !isValidUuid(expected.conversationId)
    ) {
      return invalidInstagramMessageCursor();
    }
    const payload = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<MyahInboxInstagramMessageCursorPayload>;
    if (
      payload.v !== 1 ||
      payload.w !== expected.workspaceId ||
      payload.c !== expected.conversationId ||
      typeof payload.t !== 'string' ||
      typeof payload.m !== 'string' ||
      !isValidUuid(payload.m) ||
      Object.keys(payload).length !== 5
    ) {
      return invalidInstagramMessageCursor();
    }
    return {
      effectiveTimestamp: parseInstagramEffectiveTimestamp(payload.t),
      messageId: payload.m,
    };
  } catch {
    return invalidInstagramMessageCursor();
  }
};

const invalidEmailCursor = (): never => {
  throw new BadRequestException('Invalid Myah inbox contact email cursor');
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
    a: parseContactTimestamp(input.receivedAt, invalidEmailCursor),
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
      receivedAt: parseContactTimestamp(payload.a, invalidEmailCursor),
      messageId: payload.m,
    };
  } catch {
    return invalidEmailCursor();
  }
};
