import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { ReplyContextKind } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { MyahInboxThreadPageInfo } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';

@ObjectType('MyahInboxReplyCampaignOption')
export class MyahInboxReplyCampaignOption {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  name: string;
}

@ObjectType('MyahInboxReplyContextOptionEdge')
export class MyahInboxReplyContextOptionEdge {
  @Field(() => String)
  cursor: string;

  @Field(() => MyahInboxReplyCampaignOption)
  node: MyahInboxReplyCampaignOption;
}

@ObjectType('MyahInboxReplyDefaultContext')
export class MyahInboxReplyDefaultContext {
  @Field(() => ReplyContextKind)
  kind: ReplyContextKind;

  @Field(() => UUIDScalarType, { nullable: true })
  campaignId: string | null;

  @Field(() => String, { nullable: true })
  campaignName: string | null;
}

@ObjectType('MyahInboxReplyContextOptions')
export class MyahInboxReplyContextOptions {
  @Field(() => [MyahInboxReplyContextOptionEdge])
  edges: MyahInboxReplyContextOptionEdge[];

  @Field(() => MyahInboxThreadPageInfo)
  pageInfo: MyahInboxThreadPageInfo;

  @Field(() => Boolean)
  generalAvailable: boolean;

  // Null requires explicit selection. A historical default need not be eligible.
  @Field(() => MyahInboxReplyDefaultContext, { nullable: true })
  defaultContext: MyahInboxReplyDefaultContext | null;
}
