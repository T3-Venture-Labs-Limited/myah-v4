import { ArgsType, Field, Int, registerEnumType } from '@nestjs/graphql';

import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { MYAH_INBOX_MAX_PAGE_SIZE } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';

export enum MyahInboxQueue {
  CreatorLinked = 'CREATOR_LINKED',
  Unmatched = 'UNMATCHED',
}

registerEnumType(MyahInboxQueue, { name: 'MyahInboxQueue' });

@ArgsType()
export class MyahInboxThreadsInput {
  @Field(() => Int, { nullable: true })
  @IsInt()
  @Min(1)
  @Max(MYAH_INBOX_MAX_PAGE_SIZE)
  @IsOptional()
  first?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  after?: string;

  @Field(() => MyahInboxQueue, { nullable: true })
  @IsOptional()
  queue?: MyahInboxQueue;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  owner?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @Field(() => [String], { nullable: true })
  @IsArray()
  @IsOptional()
  states?: string[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  search?: string;
}
