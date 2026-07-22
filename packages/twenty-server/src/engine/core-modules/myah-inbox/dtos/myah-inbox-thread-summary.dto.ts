import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('MyahInboxThreadContext')
export class MyahInboxThreadContext {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  name: string | null;
}

@ObjectType('MyahInboxThreadSummary')
export class MyahInboxThreadSummary {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  lastActivityAt: string;

  @Field(() => String, { nullable: true })
  lastMessagePreview: string | null;

  @Field(() => String, { nullable: true })
  lastMessageSender: string | null;

  @Field(() => String, { nullable: true })
  state: string | null;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  creator: MyahInboxThreadContext | null;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  campaign: MyahInboxThreadContext | null;
}
