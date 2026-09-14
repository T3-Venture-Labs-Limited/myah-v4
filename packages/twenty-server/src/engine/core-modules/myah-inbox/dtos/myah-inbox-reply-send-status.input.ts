import { Field, InputType } from '@nestjs/graphql';

import { IsOptional, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('MyahInboxReplySendStatusInput')
export class MyahInboxReplySendStatusInput {
  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  expectedWorkspaceId?: string | null;

  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  receiptId: string;
}
