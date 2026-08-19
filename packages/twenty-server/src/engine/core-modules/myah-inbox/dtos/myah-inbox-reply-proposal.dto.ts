import { Field, ObjectType } from '@nestjs/graphql';

import { z } from 'zod';

import {
  MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH,
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';

const MyahInboxReplyProposalBodySchema = z
  .object({
    markdown: z.string().max(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH),
    blocknote: z.string().max(MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH).nullable(),
  })
  .strict();

export const MyahInboxReplyProposalSchema = z
  .object({
    body: MyahInboxReplyProposalBodySchema,
  })
  .strict();

export const MyahInboxReplyProposalModelOutputSchema = z
  .object({
    body: z.union([
      MyahInboxReplyProposalBodySchema,
      z.string().max(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH),
    ]),
  })
  .strict();

@ObjectType('MyahInboxReplyProposalBody')
export class MyahInboxReplyProposalBody {
  @Field(() => String)
  markdown: string;

  @Field(() => String, { nullable: true })
  blocknote: string | null;
}

@ObjectType('MyahInboxReplyProposal')
export class MyahInboxReplyProposal {
  @Field(() => MyahInboxReplyProposalBody)
  body: MyahInboxReplyProposalBody;
}
