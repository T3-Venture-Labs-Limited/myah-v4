import { Field, InputType } from '@nestjs/graphql';

import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';

@InputType('UpdateMyahInboxThreadInput')
export class UpdateMyahInboxThreadInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  threadId: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  creatorId?: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  campaignId?: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  inboxOwnerId?: string | null;

  @Field(() => MyahInboxState, { nullable: true })
  @IsOptional()
  @IsEnum(MyahInboxState)
  inboxState?: MyahInboxState;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  snoozedUntil?: string | null;
}
