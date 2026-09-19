import { MyahInboxReplyDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { Field, InputType, Int } from '@nestjs/graphql';

import { IsInt, Min } from 'class-validator';

@InputType('SendMyahInboxReplyInput')
export class SendMyahInboxReplyInput extends MyahInboxReplyDraftInput {
  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedDraftRevision: number;
}
