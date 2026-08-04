import { ForbiddenException } from '@nestjs/common';

import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { In, IsNull } from 'typeorm';

import { type MyahInboxThreadEdge } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import { type MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import {
  type MyahInboxThreadContext,
  type MyahInboxThreadSummary,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { encodeMyahInboxCursor } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-cursor.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { MessageVisibilityAccess } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';

export type MyahInboxThreadRaw = {
  id: string;
  lastActivityAt: Date | string;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  messageVisibility: MessageVisibilityAccess;
  state: MyahInboxState;
  snoozedUntil: Date | string | null;
  creatorId: string | null;
  campaignId: string | null;
  inboxOwnerId: string | null;
};

type ContextRecord = {
  id: string;
  name?: string | { firstName?: string; lastName?: string } | null;
};

type ContextRecords = {
  creatorById: Map<string, ContextRecord>;
  campaignById: Map<string, ContextRecord>;
  workspaceMemberById: Map<string, ContextRecord>;
};

type MyahInboxContextRepository = {
  find: (options: unknown) => Promise<ContextRecord[]>;
};

const loadOptionalContextRecords = async (
  repository: MyahInboxContextRepository,
  ids: string[],
): Promise<ContextRecord[]> => {
  if (ids.length === 0) {
    return [];
  }

  try {
    return await repository.find({
      where: { id: In(ids), deletedAt: IsNull() },
      select: { id: true, name: true },
    });
  } catch (error) {
    if (
      error instanceof PermissionsException &&
      error.code === PermissionsExceptionCode.PERMISSION_DENIED
    ) {
      return [];
    }

    throw error;
  }
};

export const loadMyahInboxContextRecords = async ({
  rows,
  creatorRepository,
  campaignRepository,
  workspaceMemberRepository,
}: {
  rows: MyahInboxThreadRaw[];
  creatorRepository: MyahInboxContextRepository;
  campaignRepository: MyahInboxContextRepository;
  workspaceMemberRepository: MyahInboxContextRepository;
}): Promise<ContextRecords> => {
  const creatorIds = [
    ...new Set(rows.map(({ creatorId }) => creatorId).filter(isDefined)),
  ];
  const campaignIds = [
    ...new Set(rows.map(({ campaignId }) => campaignId).filter(isDefined)),
  ];
  const workspaceMemberIds = [
    ...new Set(rows.map(({ inboxOwnerId }) => inboxOwnerId).filter(isDefined)),
  ];
  const [creators, campaigns, workspaceMembers] = await Promise.all([
    loadOptionalContextRecords(creatorRepository, creatorIds),
    loadOptionalContextRecords(campaignRepository, campaignIds),
    workspaceMemberIds.length === 0
      ? []
      : workspaceMemberRepository.find({
          where: { id: In(workspaceMemberIds), deletedAt: IsNull() },
        }),
  ]);

  return {
    creatorById: new Map(creators.map((record) => [record.id, record])),
    campaignById: new Map(campaigns.map((record) => [record.id, record])),
    workspaceMemberById: new Map(
      workspaceMembers.map((record) => [record.id, record]),
    ),
  };
};

const toMyahInboxThreadContext = (
  record: ContextRecord | undefined,
): MyahInboxThreadContext | null => {
  if (!record) {
    return null;
  }

  const name =
    typeof record.name === 'string'
      ? record.name
      : [record.name?.firstName, record.name?.lastName]
          .filter(isDefined)
          .join(' ') || null;

  return { id: record.id, name };
};

export const toMyahInboxThreadEdge = (
  row: MyahInboxThreadRaw,
  contexts: ContextRecords,
): MyahInboxThreadEdge => {
  if (row.messageVisibility === MessageVisibilityAccess.HIDDEN) {
    throw new ForbiddenException('Inbox visibility projection failed closed');
  }

  const lastActivityAt =
    row.lastActivityAt instanceof Date
      ? row.lastActivityAt.toISOString()
      : row.lastActivityAt;
  const subject =
    row.messageVisibility === MessageVisibilityAccess.FULL ||
    row.messageVisibility === MessageVisibilityAccess.SUBJECT
      ? row.subject
      : FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
  const lastMessagePreview =
    row.messageVisibility === MessageVisibilityAccess.FULL
      ? row.lastMessagePreview
      : FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;

  return {
    cursor: encodeMyahInboxCursor({
      receivedAt: lastActivityAt,
      threadId: row.id,
    }),
    node: {
      id: row.id,
      lastActivityAt,
      subject,
      lastMessagePreview,
      lastMessageSender: row.lastMessageSender,
      state: row.state,
      snoozedUntil:
        row.snoozedUntil instanceof Date
          ? row.snoozedUntil.toISOString()
          : row.snoozedUntil,
      creator: row.creatorId
        ? toMyahInboxThreadContext(contexts.creatorById.get(row.creatorId))
        : null,
      campaign: row.campaignId
        ? toMyahInboxThreadContext(contexts.campaignById.get(row.campaignId))
        : null,
      inboxOwner: row.inboxOwnerId
        ? toMyahInboxThreadContext(
            contexts.workspaceMemberById.get(row.inboxOwnerId),
          )
        : null,
    } satisfies MyahInboxThreadSummary,
  };
};
