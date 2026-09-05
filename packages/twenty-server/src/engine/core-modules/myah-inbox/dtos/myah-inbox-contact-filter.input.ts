import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import {
  MyahInboxSnoozeStatus,
  MyahInboxState,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';

@ArgsType()
export class MyahInboxContactsInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  first?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  after?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  contactId?: string;

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

  @Field(() => MyahInboxSnoozeStatus, { nullable: true })
  @IsOptional()
  @IsEnum(MyahInboxSnoozeStatus)
  snoozeStatus?: MyahInboxSnoozeStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  search?: string;
}
