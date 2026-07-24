import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';

@ObjectType('MyahInboxThreadContext')
export class MyahInboxThreadContext {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String, { nullable: true })
  name: string | null;
}

@ObjectType('MyahInboxThreadSummary')
export class MyahInboxThreadSummary {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  lastActivityAt: string;

  @Field(() => String, { nullable: true })
  subject: string | null;

  @Field(() => String, { nullable: true })
  lastMessagePreview: string | null;

  @Field(() => String, { nullable: true })
  lastMessageSender: string | null;

  @Field(() => MyahInboxState)
  state: MyahInboxState;

  @Field(() => String, { nullable: true })
  snoozedUntil: string | null;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  creator: MyahInboxThreadContext | null;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  campaign: MyahInboxThreadContext | null;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  inboxOwner: MyahInboxThreadContext | null;
}
