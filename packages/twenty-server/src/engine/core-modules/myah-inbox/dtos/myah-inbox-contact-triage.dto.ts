import { Field, Int, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';

@ObjectType('MyahInboxContactTriage')
export class MyahInboxContactTriage {
  @Field(() => UUIDScalarType, { nullable: true })
  inboxOwnerId: string | null;

  @Field(() => MyahInboxState)
  inboxState: string;

  @Field(() => String, { nullable: true })
  snoozedUntil: string | null;

  @Field(() => Int)
  revision: number;

  @Field(() => String)
  identityGeneration: string;
}
