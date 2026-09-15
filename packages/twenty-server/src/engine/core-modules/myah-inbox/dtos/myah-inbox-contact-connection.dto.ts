import { Field, ObjectType } from '@nestjs/graphql';

import { MyahInboxContactSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-summary.dto';

@ObjectType('MyahInboxContactEdge')
export class MyahInboxContactEdge {
  @Field(() => String)
  cursor: string;

  @Field(() => MyahInboxContactSummary)
  node: MyahInboxContactSummary;
}

@ObjectType('MyahInboxContactPageInfo')
export class MyahInboxContactPageInfo {
  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType('MyahInboxContactConnection')
export class MyahInboxContactConnection {
  @Field(() => [MyahInboxContactEdge])
  edges: MyahInboxContactEdge[];

  @Field(() => MyahInboxContactPageInfo)
  pageInfo: MyahInboxContactPageInfo;
}
