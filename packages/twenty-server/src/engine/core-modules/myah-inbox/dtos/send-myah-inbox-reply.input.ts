import { Field, InputType, Int } from '@nestjs/graphql';

import { IsInt, IsUUID, Min } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('SendMyahInboxReplyInput')
export class SendMyahInboxReplyInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedDraftRevision: number;
}
