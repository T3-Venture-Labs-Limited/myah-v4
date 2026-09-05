import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('MyahInboxContactEmailParticipant')
export class MyahInboxContactEmailParticipant {
  @Field(() => String)
  role: string;

  @Field(() => String, { nullable: true })
  handle: string | null;

  @Field(() => String, { nullable: true })
  displayName: string | null;
}

@ObjectType('MyahInboxContactEmailMessage')
export class MyahInboxContactEmailMessage {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => String, { nullable: true })
  subject: string | null;

  @Field(() => String, { nullable: true })
  text: string | null;

  @Field(() => String)
  receivedAt: string;

  @Field(() => String)
  direction: 'INCOMING' | 'OUTGOING';

  @Field(() => String)
  visibility: 'FULL' | 'SUBJECT' | 'METADATA';

  @Field(() => [MyahInboxContactEmailParticipant])
  participants: MyahInboxContactEmailParticipant[];

  @Field(() => [UUIDScalarType])
  attachmentFileIds: string[];
}
