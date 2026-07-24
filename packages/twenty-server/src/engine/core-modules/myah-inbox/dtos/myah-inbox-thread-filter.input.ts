import { ArgsType, Field, Int, registerEnumType } from '@nestjs/graphql';

import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { MYAH_INBOX_MAX_PAGE_SIZE } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';

export enum MyahInboxQueue {
  CREATOR_LINKED = 'CREATOR_LINKED',
  UNMATCHED = 'UNMATCHED',
}

export enum MyahInboxState {
  NEEDS_REPLY = 'NEEDS_REPLY',
  WAITING_ON_CREATOR = 'WAITING_ON_CREATOR',
  SNOOZED = 'SNOOZED',
  CLOSED = 'CLOSED',
}

registerEnumType(MyahInboxQueue, { name: 'MyahInboxQueue' });
registerEnumType(MyahInboxState, { name: 'MyahInboxState' });

@ArgsType()
export class MyahInboxThreadsInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MYAH_INBOX_MAX_PAGE_SIZE)
  first?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  after?: string;

  @Field(() => MyahInboxQueue, { nullable: true })
  @IsOptional()
  @IsEnum(MyahInboxQueue)
  queue?: MyahInboxQueue;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  owner?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @Field(() => [MyahInboxState], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MyahInboxState, { each: true })
  states?: MyahInboxState[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  search?: string;
}
