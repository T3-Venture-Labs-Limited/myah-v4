import { ArgsType, Field, Int, registerEnumType } from '@nestjs/graphql';

import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum MyahInboxState {
  NEEDS_REPLY = 'NEEDS_REPLY',
  WAITING_ON_CREATOR = 'WAITING_ON_CREATOR',
  SNOOZED = 'SNOOZED',
  CLOSED = 'CLOSED',
}

export enum MyahInboxSnoozeStatus {
  ACTIVE = 'ACTIVE',
  DUE = 'DUE',
}

registerEnumType(MyahInboxState, { name: 'MyahInboxState' });
registerEnumType(MyahInboxSnoozeStatus, { name: 'MyahInboxSnoozeStatus' });

@ArgsType()
export class MyahInboxThreadsInput {
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
