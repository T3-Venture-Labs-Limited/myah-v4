import { z } from 'zod';

import { MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  MyahInboxSnoozeStatus,
  MyahInboxState,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH } from 'src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input';

export const messageThreadIdInputSchema = z
  .string()
  .uuid()
  .describe('Myah Inbox MessageThread ID.');

export const selectedMessageThreadIdInputSchema = messageThreadIdInputSchema
  .optional()
  .describe(
    'Myah Inbox MessageThread ID. Uses the current selection when omitted.',
  );

export const searchMyahInboxThreadsInputSchema = z
  .object({
    first: z.number().int().min(1).optional(),
    after: z.string().optional(),
    threadId: z.string().uuid().optional(),
    owner: z.string().optional(),
    campaignId: z.string().uuid().optional(),
    states: z.array(z.nativeEnum(MyahInboxState)).optional(),
    snoozeStatus: z.nativeEnum(MyahInboxSnoozeStatus).optional(),
    search: z.string().optional(),
  })
  .strict();

export const getMyahInboxThreadContextInputSchema = z
  .object({ messageThreadId: selectedMessageThreadIdInputSchema })
  .strict();

export const generateMyahInboxReplyProposalInputSchema = z
  .object({
    messageThreadId: selectedMessageThreadIdInputSchema,
    operatorInstructions: z
      .string()
      .trim()
      .min(1)
      .max(MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH)
      .describe('Explicit operator instructions for this proposal'),
  })
  .strict();

export const updateMyahInboxThreadInputSchema = z
  .object({
    messageThreadId: messageThreadIdInputSchema,
    creatorId: z.string().uuid().nullable().optional(),
    campaignId: z.string().uuid().nullable().optional(),
    inboxOwnerId: z.string().uuid().nullable().optional(),
    inboxState: z.nativeEnum(MyahInboxState).optional(),
    snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine(
    ({ creatorId, campaignId, inboxOwnerId, inboxState, snoozedUntil }) =>
      creatorId !== undefined ||
      campaignId !== undefined ||
      inboxOwnerId !== undefined ||
      inboxState !== undefined ||
      snoozedUntil !== undefined,
    { message: 'At least one thread field is required' },
  );

export const saveMyahInboxReplyDraftInputSchema = z
  .object({
    messageThreadId: messageThreadIdInputSchema,
    expectedRevision: z.number().int().min(0),
    body: z
      .object({
        markdown: z.string().max(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH),
        blocknote: z.null(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const getMyahInboxReplySendReadinessInputSchema = z
  .object({ messageThreadId: messageThreadIdInputSchema })
  .strict();

export const getMyahInboxReplySendStatusInputSchema = z
  .object({
    messageThreadId: messageThreadIdInputSchema,
    receiptId: z.string().uuid(),
  })
  .strict();
