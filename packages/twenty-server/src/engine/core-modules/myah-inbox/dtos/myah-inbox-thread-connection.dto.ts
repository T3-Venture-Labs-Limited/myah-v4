import { Field, ObjectType } from '@nestjs/graphql';

import { MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';

@ObjectType('MyahInboxThreadEdge')
export class MyahInboxThreadEdge {
  @Field(() => String)
  cursor: string;

  @Field(() => MyahInboxThreadSummary)
  node: MyahInboxThreadSummary;
}

@ObjectType('MyahInboxThreadPageInfo')
export class MyahInboxThreadPageInfo {
  @Field(() => Boolean)
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType('MyahInboxThreadConnection')
export class MyahInboxThreadConnection {
  @Field(() => [MyahInboxThreadEdge])
  edges: MyahInboxThreadEdge[];

  @Field(() => MyahInboxThreadPageInfo)
  pageInfo: MyahInboxThreadPageInfo;
}
