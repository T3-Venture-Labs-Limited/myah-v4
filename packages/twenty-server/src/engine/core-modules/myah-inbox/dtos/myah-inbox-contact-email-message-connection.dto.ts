import { ArgsType, Field, Int, ObjectType } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

import { MyahInboxContactEmailMessage } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-email-message.dto';

@ArgsType()
export class MyahInboxContactEmailMessagesInput {
  @Field(() => String)
  @IsString()
  contactId: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  first?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  after?: string;
}

@ObjectType('MyahInboxContactEmailMessageEdge')
export class MyahInboxContactEmailMessageEdge {
  @Field(() => String)
  cursor: string;

  @Field(() => MyahInboxContactEmailMessage)
  node: MyahInboxContactEmailMessage;
}

@ObjectType('MyahInboxContactEmailMessagePageInfo')
export class MyahInboxContactEmailMessagePageInfo {
  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType('MyahInboxContactEmailMessageConnection')
export class MyahInboxContactEmailMessageConnection {
  @Field(() => [MyahInboxContactEmailMessageEdge])
  edges: MyahInboxContactEmailMessageEdge[];

  @Field(() => MyahInboxContactEmailMessagePageInfo)
  pageInfo: MyahInboxContactEmailMessagePageInfo;
}
