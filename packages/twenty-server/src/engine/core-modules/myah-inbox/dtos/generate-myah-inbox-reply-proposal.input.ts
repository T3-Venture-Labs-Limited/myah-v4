import { Field, InputType } from '@nestjs/graphql';

import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

export const MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH = 10_000;

@InputType('GenerateMyahInboxReplyProposalInput')
export class GenerateMyahInboxReplyProposalInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH)
  operatorInstructions: string;
}
