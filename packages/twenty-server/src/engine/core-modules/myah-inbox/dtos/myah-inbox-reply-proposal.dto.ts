import { Field, ObjectType } from '@nestjs/graphql';

import { z } from 'zod';

import {
  MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH,
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';

const MYAH_INBOX_MAX_REPLY_SUBJECT_LENGTH = 998;

export const MyahInboxReplyProposalSchema = z
  .object({
    subject: z.string().max(MYAH_INBOX_MAX_REPLY_SUBJECT_LENGTH).nullable(),
    body: z
      .object({
        markdown: z.string().max(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH),
        blocknote: z
          .string()
          .max(MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH)
          .nullable(),
      })
      .strict(),
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
  @Field(() => String, { nullable: true })
  subject: string | null;

  @Field(() => MyahInboxReplyProposalBody)
  body: MyahInboxReplyProposalBody;
}
