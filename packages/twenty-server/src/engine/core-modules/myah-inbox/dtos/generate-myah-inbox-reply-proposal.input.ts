import { MyahInboxReplyDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { Field, InputType } from '@nestjs/graphql';

import { Matches, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH = 10_000;

@InputType('GenerateMyahInboxReplyProposalInput')
export class GenerateMyahInboxReplyProposalInput extends MyahInboxReplyDraftInput {
  @Field(() => String)
  @Matches(/^[a-f0-9]{64}$/)
  expectedContextFingerprint: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH)
  operatorInstructions: string;
}
