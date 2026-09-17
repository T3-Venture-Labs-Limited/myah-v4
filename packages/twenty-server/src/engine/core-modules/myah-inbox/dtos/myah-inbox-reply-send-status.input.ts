import { MyahInboxReplyDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { Field, InputType } from '@nestjs/graphql';

import { IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('MyahInboxReplySendStatusInput')
export class MyahInboxReplySendStatusInput extends MyahInboxReplyDraftInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  receiptId: string;
}
