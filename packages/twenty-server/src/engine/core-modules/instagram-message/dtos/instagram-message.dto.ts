import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import { INSTAGRAM_MESSAGE_MAX_BODY_BYTES } from 'twenty-shared/constants';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MaxUtf8ByteLength } from 'src/engine/core-modules/instagram-message/validators/max-utf8-byte-length.validator';

@InputType()
export class SaveInstagramMessageDraftInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  draftId: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @Field()
  @IsIn(['FIRST_MESSAGE', 'REPLY'])
  kind: 'FIRST_MESSAGE' | 'REPLY';

  @Field()
  @IsString()
  @MaxUtf8ByteLength(INSTAGRAM_MESSAGE_MAX_BODY_BYTES)
  body: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  creatorRecordId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  conversationRecordId: string | null;
}

@InputType()
export class GetInstagramMessageDraftInput {
  @Field()
  @IsIn(['FIRST_MESSAGE', 'REPLY'])
  kind: 'FIRST_MESSAGE' | 'REPLY';

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  creatorRecordId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  conversationRecordId: string | null;
}

@ObjectType()
export class InstagramMessageDraftResultDto {
  @Field()
  status: 'SAVED' | 'CONFLICT';

  @Field(() => UUIDScalarType)
  draftId: string;

  @Field(() => Int)
  revision: number;

  @Field()
  body: string;

  @Field(() => Boolean, { nullable: true })
  executionLocked?: boolean | null;
}

@InputType()
export class SendInstagramMessageInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  draftId: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  expectedRevision: number;
}

@InputType()
export class InstagramMessageSendStatusInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  receiptId: string;
}

@ObjectType()
export class InstagramMessageSendStatusDto {
  @Field(() => UUIDScalarType, { nullable: true })
  creatorRecordId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  conversationRecordId: string | null;

  @Field(() => UUIDScalarType)
  receiptId: string;

  @Field()
  state: string;

  @Field(() => String, { nullable: true })
  providerCode: string | null;

  @Field(() => String, { nullable: true })
  outcome: string | null;
}

@ObjectType()
export class InstagramMessageSendResultDto {
  @Field()
  status: string;

  @Field(() => UUIDScalarType)
  receiptId: string;

  @Field(() => String, { nullable: true })
  code?: string;

  @Field(() => Int, { nullable: true })
  hourlyUsed?: number;

  @Field(() => Int, { nullable: true })
  hourlyLimit?: number;

  @Field(() => Int, { nullable: true })
  hourlyRemaining?: number;

  @Field(() => Int, { nullable: true })
  dailyUsed?: number;

  @Field(() => Int, { nullable: true })
  dailyLimit?: number;

  @Field(() => Int, { nullable: true })
  dailyRemaining?: number;

  @Field(() => [String], { nullable: true })
  blockedWindows?: string[];

  @Field(() => Date, { nullable: true })
  nextEligibleAt?: Date | null;
}
