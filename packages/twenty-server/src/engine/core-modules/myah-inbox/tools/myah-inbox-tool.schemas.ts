import { z } from 'zod';

import {
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
  MYAH_INBOX_MAX_PAGE_SIZE,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH } from 'src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input';
import { ReplyContextKind } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

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
    campaignId: z.string().uuid().optional(),
    search: z.string().optional(),
  })
  .strict();

export const myahInboxReplyContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(ReplyContextKind.GENERAL) }).strict(),
  z
    .object({
      kind: z.literal(ReplyContextKind.CAMPAIGN),
      campaignId: z.string().uuid(),
    })
    .strict(),
]);

export const listMyahInboxReplyContextsInputSchema = z
  .object({
    messageThreadId: messageThreadIdInputSchema,
    first: z.number().int().min(1).max(MYAH_INBOX_MAX_PAGE_SIZE).optional(),
    after: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();

export const getMyahInboxThreadContextInputSchema = z
  .object({
    messageThreadId: selectedMessageThreadIdInputSchema,
    replyContext: myahInboxReplyContextSchema.optional(),
  })
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
  })
  .strict()
  .refine(
    ({ creatorId, campaignId }) =>
      creatorId !== undefined || campaignId !== undefined,
    { message: 'At least one thread field is required' },
  );

export const saveMyahInboxReplyDraftInputSchema = z
  .object({
    messageThreadId: messageThreadIdInputSchema,
    replyContext: myahInboxReplyContextSchema,
    expectedContextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
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
