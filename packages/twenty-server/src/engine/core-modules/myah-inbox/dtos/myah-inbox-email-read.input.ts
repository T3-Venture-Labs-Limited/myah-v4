import { ArgsType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ArgsType()
export class MyahInboxEmailReadInput {
  @Field(() => String)
  @IsString()
  @MaxLength(8192)
  contactId: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  expectedWorkspaceId: string;
}

@ArgsType()
export class MyahInboxEmailCardsInput extends MyahInboxEmailReadInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  snapshot?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  olderCursor?: string;
}

@ArgsType()
export class MyahInboxEmailCardInput extends MyahInboxEmailReadInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  anchorKey?: string;
}

@ArgsType()
export class MyahInboxEmailCardMessagesInput extends MyahInboxEmailCardInput {
  @Field(() => String)
  @IsString()
  @MaxLength(8192)
  snapshot: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cursor?: string;
}

@ArgsType()
export class MyahInboxEmailMessageLocationInput extends MyahInboxEmailReadInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  messageId: string;

  @Field(() => String)
  @IsString()
  @MaxLength(8192)
  snapshot: string;
}
