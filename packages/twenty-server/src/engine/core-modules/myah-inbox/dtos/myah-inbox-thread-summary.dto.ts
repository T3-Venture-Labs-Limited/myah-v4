import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

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

  @Field(() => MyahInboxThreadContext, { nullable: true })
  creator: MyahInboxThreadContext | null;

  @Field(() => MyahInboxThreadContext, { nullable: true })
  campaign: MyahInboxThreadContext | null;
}
