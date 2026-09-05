import { BadRequestException } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

export type MyahInboxContactIdentityKind =
  | 'creator'
  | 'email-thread'
  | 'instagram-conversation';

export type MyahInboxContactIdentity = {
  kind: MyahInboxContactIdentityKind;
  recordId: string;
};

type MyahInboxContactIdPayload = {
  v: 1;
  w: string;
  k: MyahInboxContactIdentityKind;
  r: string;
};

const CONTACT_KIND: Record<MyahInboxContactIdentityKind, true> = {
  creator: true,
  'email-thread': true,
  'instagram-conversation': true,
};

const invalidContactId = (): never => {
  throw new BadRequestException('Invalid Myah inbox contact ID');
};

export const encodeMyahInboxContactId = (input: {
  workspaceId: string;
  identity: MyahInboxContactIdentity;
}): string => {
  if (
    !isValidUuid(input.workspaceId) ||
    !isValidUuid(input.identity.recordId) ||
    CONTACT_KIND[input.identity.kind] !== true
  ) {
    return invalidContactId();
  }

  const payload: MyahInboxContactIdPayload = {
    v: 1,
    w: input.workspaceId,
    k: input.identity.kind,
    r: input.identity.recordId,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

export const decodeMyahInboxContactId = (
  value: string,
  expectedWorkspaceId: string,
): MyahInboxContactIdentity => {
  try {
    if (!value || !isValidUuid(expectedWorkspaceId)) return invalidContactId();
    const payload = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<MyahInboxContactIdPayload>;

    if (
      payload.v !== 1 ||
      payload.w !== expectedWorkspaceId ||
      typeof payload.k !== 'string' ||
      CONTACT_KIND[payload.k as MyahInboxContactIdentityKind] !== true ||
      typeof payload.r !== 'string' ||
      !isValidUuid(payload.r) ||
      Object.keys(payload).length !== 4
    ) {
      return invalidContactId();
    }

    return {
      kind: payload.k as MyahInboxContactIdentityKind,
      recordId: payload.r,
    };
  } catch {
    return invalidContactId();
  }
};
