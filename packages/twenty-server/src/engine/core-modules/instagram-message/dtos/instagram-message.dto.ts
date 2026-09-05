import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

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
