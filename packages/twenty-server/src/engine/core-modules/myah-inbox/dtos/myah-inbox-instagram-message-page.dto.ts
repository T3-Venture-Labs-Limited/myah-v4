import { ArgsType, Field, Int, ObjectType } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

@ArgsType()
export class MyahInboxInstagramMessagesInput {
  @Field(() => String)
  @IsString()
  conversationId: string;

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

@ObjectType('MyahInboxInstagramMessage')
export class MyahInboxInstagramMessage {
  @Field(() => String)
  id: string;

  @Field(() => String, { nullable: true })
  text: string | null;

  @Field(() => String)
  direction: string;

  @Field(() => String)
  sentVia: string;

  @Field(() => String)
  provider: string;

  @Field(() => String)
  deliveryState: string;

  @Field(() => String, { nullable: true })
  providerCreatedAt: string | null;

  @Field(() => String)
  createdAt: string;

  @Field(() => Boolean)
  hasAttachments: boolean;

  @Field(() => Int)
  attachmentCount: number;
}

@ObjectType('MyahInboxInstagramMessageEdge')
export class MyahInboxInstagramMessageEdge {
  @Field(() => String)
  cursor: string;

  @Field(() => MyahInboxInstagramMessage)
  node: MyahInboxInstagramMessage;
}

@ObjectType('MyahInboxInstagramMessagePageInfo')
export class MyahInboxInstagramMessagePageInfo {
  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType('MyahInboxInstagramMessageConnection')
export class MyahInboxInstagramMessageConnection {
  @Field(() => [MyahInboxInstagramMessageEdge])
  edges: MyahInboxInstagramMessageEdge[];

  @Field(() => MyahInboxInstagramMessagePageInfo)
  pageInfo: MyahInboxInstagramMessagePageInfo;
}
